import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import http from 'http';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache';
import { createClient } from '@supabase/supabase-js';
import { stripe, getUserSubscription, isPro, buildAffiliateUrl } from './stripe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 5000;

// Render terminates TLS in front of us; without this every request shares the proxy's IP,
// so all users would share a single rate-limit bucket
app.set('trust proxy', 1);

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Supabase client. The webhook and price tracker write without a user session, so they need
// the service role key; the anon key only works if RLS lets anonymous users write those tables.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set — falling back to the anon key; subscription writes may fail');
}
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// Caches for repeated queries: skip re-embedding and re-running the LLM extraction
const embeddingCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });
const criteriaCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });

// Queries go to two OpenAI calls; anything longer than this is not a real search
const MAX_QUERY_LENGTH = 300;

// Rate limiting. Images get their own generous bucket (a results page loads ~30 of them);
// the OpenAI-backed routes get a tighter one because each call costs money.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: (req) => req.path === '/api/proxy-image',
});
const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
});
const llmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many searches, please wait a few minutes.' },
});

// CORS configuration
const allowedOrigins = [
  'https://watch-engine.onrender.com',
  'http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001',
  'http://localhost:3002', 'http://localhost:3003',
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));

// Stripe webhook needs raw body — must be before express.json()
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        if (userId) {
          const { error } = await supabase.from('subscriptions').upsert({
            user_id: userId,
            plan: 'pro',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            status: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
          if (error) throw error;
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        // Newer Stripe API versions moved current_period_end onto the subscription items
        const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
        const { error } = await supabase.from('subscriptions')
          .update({
            status: sub.status,
            ...(periodEnd && { current_period_end: new Date(periodEnd * 1000).toISOString() }),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id);
        if (error) throw error;
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { error } = await supabase.from('subscriptions')
          .update({ plan: 'free', status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id);
        if (error) throw error;
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Non-2xx makes Stripe retry, so a transient failure doesn't lose the event
    return res.status(500).json({ received: false });
  }

  res.json({ received: true });
});

app.use(express.json());
app.use(limiter);

// Error/success response helpers
const errorResponse = (res, status, message, error = null) => {
  return res.status(status).json({
    success: false,
    message,
    ...(error && { error: error.message })
  });
};

const successResponse = (res, data) => {
  return res.status(200).json({ success: true, data });
};

// --- Local model functions ---

async function generateEmbedding(text) {
  const cacheKey = text.trim().toLowerCase();
  const cached = embeddingCache.get(cacheKey);
  if (cached) return cached;

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 768,
  });

  const embedding = response.data[0].embedding;
  embeddingCache.set(cacheKey, embedding);
  return embedding;
}

async function extractCategories(query) {
  const cacheKey = query.trim().toLowerCase();
  const cached = criteriaCache.get(cacheKey);
  if (cached) return cached;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a watch expert. Extract search criteria from user queries into structured JSON. Return a JSON object with these properties (omit any not mentioned in the query):
- Type: the type/model of watch (e.g. diving, chronograph, dress)
- Dial_Color: dial color mentioned
- Price_Min: minimum price in EUR (number only)
- Price_Max: maximum price in EUR (number only)
- Movement: movement type (e.g. automatic, quartz, manual)
- Function: watch function (e.g. chronograph, GMT, date)
- Year: year produced
- Family: watch family/collection name
- Limited_Edition: true if they want limited edition
- Brand: brand name if mentioned`
      },
      { role: 'user', content: query }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  try {
    const criteria = JSON.parse(response.choices[0].message.content);
    criteriaCache.set(cacheKey, criteria);
    return criteria;
  } catch {
    return {};
  }
}

// --- Search functions ---

// LLM output is untrusted: "5k" or "" would become NaN and make PostgREST reject the query
function toPrice(value) {
  const n = Number(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(n) ? n : null;
}

function buildSupabaseFilters(criteria) {
  const filters = [];

  if (criteria.Type) {
    filters.push({ column: 'model_name', op: 'ilike', value: `%${criteria.Type}%` });
  }
  if (criteria.Dial_Color) {
    filters.push({ column: 'dial_color', op: 'ilike', value: `%${criteria.Dial_Color}%` });
  }
  if (criteria.Movement) {
    filters.push({ column: 'movement_name', op: 'ilike', value: `%${criteria.Movement}%` });
  }
  if (criteria.Function) {
    filters.push({ column: 'function_name', op: 'ilike', value: `%${criteria.Function}%` });
  }
  if (criteria.Family) {
    filters.push({ column: 'family_name', op: 'ilike', value: `%${criteria.Family}%` });
  }
  if (criteria.Year) {
    filters.push({ column: 'year_produced', op: 'eq', value: criteria.Year });
  }
  if (criteria.Limited_Edition) {
    filters.push({ column: 'limited_edition', op: 'neq', value: null });
  }
  const priceMin = toPrice(criteria.Price_Min);
  const priceMax = toPrice(criteria.Price_Max);
  if (priceMin !== null) {
    filters.push({ column: 'price_eur', op: 'gte', value: priceMin });
  }
  if (priceMax !== null) {
    filters.push({ column: 'price_eur', op: 'lte', value: priceMax });
  }

  return filters;
}

// 1. Vector/semantic search
async function runVectorSearch(embedding) {
  const { data, error } = await supabase.rpc('match_watches', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.2,
    match_count: 30
  });

  if (error) throw error;
  return data || [];
}

// 2. Full-text keyword search (BM25-like via PostgreSQL tsvector)
async function runFullTextSearch(query) {
  const { data, error } = await supabase.rpc('search_watches_fulltext', {
    search_query: query,
    result_limit: 30
  });

  if (error) throw error;
  return data || [];
}

// 3. SQL filter search (hard constraints from LLM extraction)
async function runFilteredSearch(filters) {
  let query = supabase.from('watches').select('id, reference, brand_id, model_name, family_name, movement_name, function_name, year_produced, limited_edition, price_eur, image_url, image_filename, description, dial_color, source, created_at, last_updated');

  for (const f of filters) {
    if (f.op === 'ilike') query = query.ilike(f.column, f.value);
    else if (f.op === 'eq') query = query.eq(f.column, f.value);
    else if (f.op === 'neq') query = query.not(f.column, 'is', null);
    else if (f.op === 'gte') query = query.gte(f.column, f.value);
    else if (f.op === 'lte') query = query.lte(f.column, f.value);
  }

  const { data, error } = await query.limit(30);
  if (error) throw error;
  return data || [];
}

// Scrapers used to insert the same listing multiple times under different ids,
// so fuse on listing content rather than row id to collapse those copies
function watchKey(watch) {
  if (!watch.source || !watch.model_name) return watch.id;
  return [watch.source, watch.model_name, watch.reference, watch.image_url].join('|');
}

// --- Reciprocal Rank Fusion ---
// Combines multiple ranked lists into a single ranking.
// Each result's score = sum of 1/(k + rank) across all lists it appears in.
// k=60 is the standard constant (from the original RRF paper).

function reciprocalRankFusion(rankedLists, k = 60) {
  const scores = new Map();    // key -> cumulative RRF score
  const watchData = new Map(); // key -> watch object

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const watch = list[rank];
      const key = watchKey(watch);

      if (!watchData.has(key)) {
        watchData.set(key, watch);
      }

      const currentScore = scores.get(key) || 0;
      scores.set(key, currentScore + 1 / (k + rank + 1));
    }
  }

  // Sort by RRF score descending
  const fused = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, score]) => ({
      ...watchData.get(key),
      rrf_score: Math.round(score * 10000) / 10000,
    }));

  return fused;
}

// --- API Endpoints ---

// Legacy analyze-query endpoint
app.post('/api/analyze-query', llmLimiter, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return errorResponse(res, 400, 'Invalid query parameter');
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return errorResponse(res, 400, 'Query is too long');
    }

    const criteria = await extractCategories(query);
    return successResponse(res, criteria);
  } catch (error) {
    console.error('Error in analyze-query:', error);
    return errorResponse(res, 500, 'Error processing query', error);
  }
});

// Hybrid search: vector + full-text + filters, fused with RRF
app.post('/api/hybrid-search', llmLimiter, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return errorResponse(res, 400, 'Invalid query parameter');
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return errorResponse(res, 400, 'Query is too long');
    }

    console.log('Hybrid search for:', query);
    const startTime = Date.now();

    // Each branch starts as soon as its own input is ready (vector search only waits on the
    // embedding, not on the slower LLM call), and one failing branch doesn't sink the search.
    const criteriaPromise = extractCategories(query).catch(err => {
      console.error('Category extraction failed:', err.message);
      return {};
    });
    const [vectorSettled, fullTextSettled, filterSettled, criteriaSettled] = await Promise.allSettled([
      generateEmbedding(query).then(runVectorSearch),
      runFullTextSearch(query),
      criteriaPromise.then(criteria => {
        const filters = buildSupabaseFilters(criteria);
        return filters.length > 0 ? runFilteredSearch(filters) : [];
      }),
      criteriaPromise,
    ]);

    const branches = { vector: vectorSettled, fullText: fullTextSettled, filter: filterSettled };
    for (const [name, result] of Object.entries(branches)) {
      if (result.status === 'rejected') console.error(`${name} search failed:`, result.reason?.message || result.reason);
    }
    if (Object.values(branches).every(r => r.status === 'rejected')) {
      throw vectorSettled.reason;
    }

    const valueOf = (result) => (result.status === 'fulfilled' ? result.value : []);
    const vectorResults = valueOf(vectorSettled);
    const fullTextResults = valueOf(fullTextSettled);
    const filterResults = valueOf(filterSettled);
    const criteria = criteriaSettled.value;

    console.log('Extracted criteria:', criteria);
    console.log(`Vector: ${vectorResults.length}, full-text: ${fullTextResults.length}, filter: ${filterResults.length}`);

    // Step 3: Fuse all result sets with Reciprocal Rank Fusion
    const rankedLists = [vectorResults, fullTextResults];
    if (filterResults.length > 0) {
      rankedLists.push(filterResults);
    }

    const fused = reciprocalRankFusion(rankedLists);

    // Apply hard price filters as post-filters (these are constraints, not ranking signals)
    let finalResults = fused;
    const priceMin = toPrice(criteria.Price_Min);
    const priceMax = toPrice(criteria.Price_Max);
    if (priceMin !== null || priceMax !== null) {
      finalResults = fused.filter(w => {
        if (!w.price_eur) return true; // keep watches without price data
        if (priceMin !== null && w.price_eur < priceMin) return false;
        if (priceMax !== null && w.price_eur > priceMax) return false;
        return true;
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`Hybrid search completed in ${elapsed}ms — ${finalResults.length} results`);

    // The full-text RPC returns raw_data (the whole scraped record); the client never uses it
    const payload = finalResults.slice(0, 30).map(({ raw_data, embedding, ...watch }) => watch);
    return successResponse(res, payload);
  } catch (error) {
    console.error('Hybrid search error:', error);
    return errorResponse(res, 500, 'Search failed', error);
  }
});

// Similar watches endpoint — uses vector embedding similarity
app.get('/api/similar-watches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 8, 20);

    const { data, error } = await supabase.rpc('get_similar_watches', {
      watch_id: id,
      match_threshold: 0.2,
      match_count: limit,
    });

    if (error) throw error;
    return successResponse(res, data || []);
  } catch (error) {
    console.error('Similar watches error:', error);
    return errorResponse(res, 500, 'Failed to fetch similar watches', error);
  }
});

// Price comparison — find same watch across different sources
app.get('/api/price-comparison/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get target watch's reference + brand
    const { data: watch, error: watchError } = await supabase
      .from('watches')
      .select('reference, brand_id')
      .eq('id', id)
      .single();

    if (watchError || !watch) {
      return errorResponse(res, 404, 'Watch not found');
    }

    if (!watch.reference) {
      return successResponse(res, []);
    }

    // Find all watches with same reference from different sources
    const { data: listings, error: listingsError } = await supabase
      .from('watches')
      .select('id, reference, model_name, price_eur, source, image_url')
      .eq('reference', watch.reference)
      .eq('brand_id', watch.brand_id)
      .not('price_eur', 'is', null)
      .order('price_eur', { ascending: true });

    if (listingsError) throw listingsError;
    return successResponse(res, listings || []);
  } catch (error) {
    console.error('Price comparison error:', error);
    return errorResponse(res, 500, 'Failed to fetch price comparison', error);
  }
});

// Price history for a watch
app.get('/api/price-history/:watchId', async (req, res) => {
  try {
    const { watchId } = req.params;
    const days = parseInt(req.query.days) || 90;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    let query = supabase
      .from('price_history')
      .select('price, source, scraped_at')
      .eq('watch_id', watchId)
      .gte('scraped_at', since)
      .order('scraped_at', { ascending: true });

    if (req.query.source) query = query.eq('source', req.query.source);

    const { data, error } = await query;
    if (error) throw error;
    return successResponse(res, data || []);
  } catch (error) {
    console.error('Price history error:', error);
    return errorResponse(res, 500, 'Failed to fetch price history', error);
  }
});

// Image proxy endpoint
app.get('/api/proxy-image', imageLimiter, async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }

  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid image URL' });
  }

  // Exact host match: includes() would also accept makingdatameaningful.com.attacker.example
  const host = url.hostname;
  if (host !== 'makingdatameaningful.com' && !host.endsWith('.makingdatameaningful.com')) {
    return res.status(400).json({ error: 'Invalid image source' });
  }

  // The upstream serves plain http (its TLS certificate is broken)
  const request = http.get(`http://${host}${url.pathname}${url.search}`, (response) => {
    const contentType = response.headers['content-type'] || '';
    if (response.statusCode !== 200 || !contentType.startsWith('image/')) {
      response.resume(); // drain so the socket is released
      if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch image' });
      return;
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    response.pipe(res);
  });

  request.setTimeout(10000, () => request.destroy(new Error('Upstream image request timed out')));

  request.on('error', (error) => {
    console.error('Error proxying image:', error.message);
    // Once streaming has started we can't send a JSON error anymore
    if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch image' });
    else res.destroy();
  });

  // Client went away: stop fetching (req 'close' fires when the request body is consumed, not on disconnect)
  res.on('close', () => request.destroy());
});

// --- Monetization Endpoints ---

// Get current user's subscription
app.get('/api/subscription', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return successResponse(res, { plan: 'free', isPro: false });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return successResponse(res, { plan: 'free', isPro: false });

    const sub = await getUserSubscription(user.id);
    return successResponse(res, {
      plan: sub?.plan || 'free',
      isPro: isPro(sub),
      status: sub?.status || 'active',
      currentPeriodEnd: sub?.current_period_end || null,
    });
  } catch (error) {
    console.error('Subscription error:', error);
    return successResponse(res, { plan: 'free', isPro: false });
  }
});

// Create Stripe Checkout session for Pro upgrade
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) return errorResponse(res, 500, 'Stripe not configured');

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return errorResponse(res, 401, 'Not authenticated');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return errorResponse(res, 401, 'Not authenticated');

    // Get or create Stripe customer
    let sub = await getUserSubscription(user.id);
    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      // Upsert subscription record with customer ID
      await supabase.from('subscriptions').upsert({
        user_id: user.id,
        plan: 'free',
        stripe_customer_id: customerId,
        status: 'active',
      }, { onConflict: 'user_id' });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      success_url: `${req.headers.origin || 'http://localhost:3001'}/profile?upgraded=true`,
      cancel_url: `${req.headers.origin || 'http://localhost:3001'}/pricing`,
      metadata: { user_id: user.id },
    });

    return successResponse(res, { url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    return errorResponse(res, 500, 'Failed to create checkout session', error);
  }
});

// Create Stripe billing portal session
app.post('/api/create-portal-session', async (req, res) => {
  if (!stripe) return errorResponse(res, 500, 'Stripe not configured');

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return errorResponse(res, 401, 'Not authenticated');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return errorResponse(res, 401, 'Not authenticated');

    const sub = await getUserSubscription(user.id);
    if (!sub?.stripe_customer_id) return errorResponse(res, 400, 'No subscription found');

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${req.headers.origin || 'http://localhost:3001'}/profile`,
    });

    return successResponse(res, { url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    return errorResponse(res, 500, 'Failed to create portal session', error);
  }
});

// Track affiliate clicks
app.post('/api/track-affiliate-click', async (req, res) => {
  try {
    const { watch_id, source } = req.body;
    if (!watch_id || !source) return errorResponse(res, 400, 'Missing watch_id or source');

    // Get user if authenticated (optional)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const affiliateUrl = buildAffiliateUrl(req.body.original_url, source);

    await supabase.from('affiliate_clicks').insert({
      user_id: userId,
      watch_id,
      source,
      affiliate_url: affiliateUrl || '',
    });

    return successResponse(res, { affiliate_url: affiliateUrl });
  } catch (error) {
    console.error('Affiliate click error:', error);
    return errorResponse(res, 500, 'Failed to track click', error);
  }
});

export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

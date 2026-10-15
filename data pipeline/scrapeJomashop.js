/**
 * Jomashop Scraper — Scale Mode
 *
 * Scrapes watches from Jomashop using parallel browser tabs and concurrent embeddings.
 *
 * Usage:
 *   node "data pipeline/scrapeJomashop.js" --brand "rolex" --pages 10
 *   node "data pipeline/scrapeJomashop.js" --brands "rolex,omega,seiko,tag heuer,tissot" --pages 5
 *   node "data pipeline/scrapeJomashop.js" --all --pages 3
 *
 * Options:
 *   --brand "name"         Single brand
 *   --brands "a,b,c"       Comma-separated list
 *   --all                  Scrape a predefined list of popular brands
 *   --pages N              Pages per brand (default: 5)
 *   --concurrency N        Parallel browser tabs (default: 4)
 *
 * Prerequisites:
 *   - Ollama running with nomic-embed-text pulled
 *   - .env configured with Supabase credentials
 */

import puppeteer from 'puppeteer';
import { Ollama } from 'ollama';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

// ── CLI args ──
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

const maxPages = parseInt(getArg('pages', '5'));
const concurrency = parseInt(getArg('concurrency', '4'));

const ALL_BRANDS = [
  'rolex', 'omega', 'seiko', 'tag heuer', 'tissot', 'citizen',
  'hamilton', 'longines', 'breitling', 'tudor', 'oris', 'cartier',
  'iwc', 'panerai', 'hublot', 'zenith', 'bell ross', 'rado',
  'frederique constant', 'baume mercier', 'movado', 'bulova',
  'orient', 'casio', 'garmin', 'fossil',
];

let brands;
if (hasFlag('all')) {
  brands = ALL_BRANDS;
} else if (getArg('brands', null)) {
  brands = getArg('brands').split(',').map(b => b.trim());
} else {
  brands = [getArg('brand', 'rolex')];
}

const BASE_URL = 'https://www.jomashop.com';
const DELAY_BETWEEN_DETAILS_MS = 1500;
const DELAY_BETWEEN_PAGES_MS = 2000;

// ── Helpers ──

function buildEmbeddingText(watch) {
  const parts = [];
  if (watch.model_name) parts.push(`Model: ${watch.model_name}`);
  if (watch.family_name) parts.push(`Family: ${watch.family_name}`);
  if (watch.movement_name) parts.push(`Movement: ${watch.movement_name}`);
  if (watch.function_name) parts.push(`Function: ${watch.function_name}`);
  if (watch.dial_color) parts.push(`Dial color: ${watch.dial_color}`);
  if (watch.year_produced) parts.push(`Year: ${watch.year_produced}`);
  if (watch.price_eur) parts.push(`Price: EUR${watch.price_eur}`);
  if (watch.limited_edition) parts.push(`Limited edition: ${watch.limited_edition}`);
  if (watch.description) parts.push(`Description: ${watch.description}`);
  return parts.join('. ');
}

async function generateEmbedding(text) {
  try {
    const response = await ollama.embeddings({ model: 'nomic-embed-text', prompt: `search_document: ${text}` });
    return response.embedding;
  } catch (error) {
    console.error('Embedding error:', error.message);
    return null;
  }
}

function parsePrice(priceText) {
  if (!priceText) return null;
  const cleaned = priceText.replace(/[^0-9.]/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

function usdToEur(usd) {
  if (!usd) return null;
  return Math.round(usd * 0.92 * 100) / 100;
}

// Brand ID cache to avoid repeated lookups
const brandIdCache = new Map();
async function resolveBrandId(brandName) {
  if (!brandName) return null;
  if (brandIdCache.has(brandName.toLowerCase())) return brandIdCache.get(brandName.toLowerCase());
  const { data } = await supabase
    .from('brands')
    .select('id')
    .ilike('name', `%${brandName}%`)
    .limit(1)
    .single();
  const id = data?.id || null;
  brandIdCache.set(brandName.toLowerCase(), id);
  return id;
}

// ── Scrape functions ──

async function scrapeListingPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('[class*="product-item"], [class*="productItem"], .product-list-item', { timeout: 10000 }).catch(() => null);

  return page.evaluate(() => {
    const items = [];
    const cards = document.querySelectorAll('[class*="product-item"], [class*="productItem"], .product-list-item, [data-product-id]');
    cards.forEach(card => {
      try {
        const titleEl = card.querySelector('[class*="product-name"], [class*="productName"], h2 a, h3 a, a[class*="name"]');
        const priceEl = card.querySelector('[class*="now-price"], [class*="price"], [class*="special-price"], .price');
        const linkEl = card.querySelector('a[href*="watches"], a[href*=".html"]') || card.querySelector('a');
        const imgEl = card.querySelector('img');

        const title = titleEl?.textContent?.trim() || '';
        const price = priceEl?.textContent?.trim() || '';
        const href = linkEl?.getAttribute('href') || '';
        const imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';

        if (title) items.push({ title, price, href, imgSrc });
      } catch (e) {}
    });
    return items;
  });
}

async function scrapeDetailPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    return page.evaluate(() => {
      const data = {};

      // JSON-LD
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          const parsed = JSON.parse(script.textContent);
          if (parsed['@type'] === 'Product' || parsed.name) {
            data.name = parsed.name;
            data.description = parsed.description;
            data.brand = parsed.brand?.name;
            data.image = Array.isArray(parsed.image) ? parsed.image[0] : parsed.image;
            if (parsed.offers) {
              const offer = Array.isArray(parsed.offers) ? parsed.offers[0] : parsed.offers;
              data.price = offer?.price;
              data.currency = offer?.priceCurrency;
            }
            if (parsed.sku) data.reference = parsed.sku;
          }
        } catch (e) {}
      });

      // Spec rows
      document.querySelectorAll('tr, [class*="spec-row"], [class*="attribute"]').forEach(row => {
        const cells = row.querySelectorAll('td, th, span, div');
        if (cells.length < 2) return;
        const label = cells[0]?.textContent?.trim()?.toLowerCase() || '';
        const value = cells[1]?.textContent?.trim() || '';

        if (label.includes('model') && label.includes('number')) data.reference = value;
        else if (label.includes('model')) data.model = value;
        else if (label.includes('movement')) data.movement = value;
        else if (label.includes('dial') && label.includes('color')) data.dialColor = value;
        else if (label.includes('collection') || label.includes('series') || label.includes('family')) data.family = value;
        else if (label.includes('function') || label.includes('feature')) data.functions = value;
        else if (label.includes('year')) data.year = value;
      });

      return data;
    });
  } catch (error) {
    return {};
  }
}

// Drop rows sharing a source_id within one batch — Postgres rejects an upsert that touches the same row twice
function dedupeBySourceId(rows) {
  const seen = new Set();
  return rows.filter(r => {
    if (!r.source_id) return true;
    if (seen.has(r.source_id)) return false;
    seen.add(r.source_id);
    return true;
  });
}

function transformToSchema(listing, detail, brand) {
  const modelName = detail.name || detail.model || listing.title || '';
  const priceUsd = parsePrice(detail.price || listing.price);
  return {
    source_id: listing.href || null,
    reference: detail.reference || null,
    brand_id: null,
    model_name: modelName,
    family_name: detail.family || null,
    movement_name: detail.movement || null,
    function_name: detail.functions || null,
    year_produced: detail.year || null,
    limited_edition: null,
    price_eur: usdToEur(priceUsd),
    image_url: detail.image || listing.imgSrc || null,
    image_filename: null,
    description: detail.description || null,
    dial_color: detail.dialColor || null,
    source: 'Jomashop',
    raw_data: { listing, detail, brand },
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
}

// ── Process a chunk of listings in parallel using multiple tabs ──

async function processListingsChunk(browser, listings, brand, brandId) {
  const results = [];

  // Open N tabs, each processes one listing at a time
  const processOne = async (listing) => {
    const tab = await browser.newPage();
    await tab.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      let detail = {};
      if (listing.href) {
        const url = listing.href.startsWith('http') ? listing.href : `${BASE_URL}${listing.href}`;
        detail = await scrapeDetailPage(tab, url);
      }

      const row = transformToSchema(listing, detail, brand);
      row.brand_id = brandId;

      const embText = buildEmbeddingText(row);
      row.embedding = await generateEmbedding(embText);

      if (row.model_name) results.push(row);
    } catch (e) {
      console.error(`  Error processing: ${listing.title?.substring(0, 40)}`, e.message);
    } finally {
      await tab.close();
    }
  };

  // Process in chunks of `concurrency` at a time
  for (let i = 0; i < listings.length; i += concurrency) {
    const chunk = listings.slice(i, i + concurrency);
    const chunkNum = Math.floor(i / concurrency) + 1;
    const totalChunks = Math.ceil(listings.length / concurrency);
    console.log(`  Batch ${chunkNum}/${totalChunks} — ${chunk.length} watches in parallel...`);

    await Promise.all(chunk.map(processOne));

    // Small delay between chunks to be respectful
    if (i + concurrency < listings.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_DETAILS_MS));
    }
  }

  return results;
}

// ── Main ──

async function scrapeBrand(browser, listingPage, brand) {
  const brandId = await resolveBrandId(brand);
  let totalForBrand = 0;

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const searchUrl = `${BASE_URL}/catalogsearch/result/?q=${encodeURIComponent(brand + ' watch')}&p=${pageNum}`;
    console.log(`\n[${brand}] Page ${pageNum}/${maxPages}: ${searchUrl}`);

    const listings = await scrapeListingPage(listingPage, searchUrl);
    console.log(`[${brand}] Found ${listings.length} listings`);

    if (listings.length === 0) {
      console.log(`[${brand}] No more listings.`);
      break;
    }

    // Process detail pages in parallel
    const batch = dedupeBySourceId(await processListingsChunk(browser, listings, brand, brandId));

    if (batch.length > 0) {
      const { error } = await supabase.from('watches').upsert(batch, { onConflict: 'source,source_id' });
      if (error) {
        console.error(`[${brand}] Upsert error:`, error);
      } else {
        totalForBrand += batch.length;
        console.log(`[${brand}] Inserted ${batch.length} watches from page ${pageNum}`);
      }
    }

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
  }

  return totalForBrand;
}

async function main() {
  console.log('='.repeat(60));
  console.log(`Jomashop Scraper — Scale Mode`);
  console.log(`Brands: ${brands.join(', ')}`);
  console.log(`Pages per brand: ${maxPages}`);
  console.log(`Concurrent tabs: ${concurrency}`);
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  // One shared page for listing navigation
  const listingPage = await browser.newPage();
  await listingPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await listingPage.setViewport({ width: 1280, height: 800 });

  let grandTotal = 0;
  const startTime = Date.now();

  for (const brand of brands) {
    try {
      const count = await scrapeBrand(browser, listingPage, brand);
      grandTotal += count;
      console.log(`\n[${brand}] Done — ${count} watches inserted`);
    } catch (error) {
      console.error(`\n[${brand}] Failed:`, error.message);
    }
  }

  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`COMPLETE — ${grandTotal} watches across ${brands.length} brands in ${elapsed}s`);
  console.log('='.repeat(60));
}

main().catch(console.error);

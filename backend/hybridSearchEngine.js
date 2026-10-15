/**
 * Watch-Engine Hybrid BM25 + Dense Vector Search, Reciprocal Rank Fusion (RRF),
 * Price Anomaly/Arbitrage Analytics, and Retrieval Evaluation Engine.
 */

const KNOWN_BRANDS = [
  'rolex', 'omega', 'seiko', 'tudor', 'cartier', 'tissot', 'hamilton',
  'longines', 'breitling', 'tag heuer', 'iwc', 'jaeger-lecoultre', 'grand seiko',
  'casio', 'citizen', 'oriente', 'oris', 'sinn', 'nomos', 'zenith', 'panerai',
  'audemars piguet', 'patek philippe', 'vacheron constantin'
];

const KNOWN_TYPES = [
  'chronograph', 'diver', 'diving', 'gmt', 'dress', 'field', 'pilot', 'aviation', 'digital', 'skeleton'
];

const KNOWN_COLORS = [
  'blue', 'black', 'white', 'silver', 'green', 'champagne', 'gold', 'grey', 'gray', 'red', 'salmon', 'mother of pearl', 'brown', 'Tiffany'
];

const KNOWN_MATERIALS = [
  'titanium', 'steel', 'stainless steel', 'rose gold', 'yellow gold', 'white gold', 'platinum', 'ceramic', 'bronze', 'carbon'
];

/**
 * Tokenize text into normalized alphanumeric terms.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Deterministically parse a natural-language watch search query into structured filters.
 * @param {string} query
 */
export function parseNaturalWatchQuery(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Invalid query parameter: query must be a non-empty string');
  }

  const lower = query.toLowerCase();
  const filters = {
    raw_query: query.trim(),
    brands: [],
    watch_type: null,
    dial_color: null,
    case_material: null,
    price_min: null,
    price_max: null,
    diameter_min_mm: null,
    diameter_max_mm: null,
  };

  for (const brand of KNOWN_BRANDS) {
    const regex = new RegExp(`\\b${brand.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(lower)) {
      filters.brands.push(brand);
    }
  }

  for (const wt of KNOWN_TYPES) {
    if (new RegExp(`\\b${wt}\\b`, 'i').test(lower)) {
      filters.watch_type = wt === 'diving' ? 'diver' : wt === 'aviation' ? 'pilot' : wt;
      break;
    }
  }

  for (const col of KNOWN_COLORS) {
    if (new RegExp(`\\b${col.toLowerCase()}\\b`, 'i').test(lower)) {
      filters.dial_color = col.toLowerCase();
      break;
    }
  }

  for (const mat of KNOWN_MATERIALS) {
    if (new RegExp(`\\b${mat}\\b`, 'i').test(lower)) {
      filters.case_material = mat === 'steel' ? 'stainless steel' : mat;
      break;
    }
  }

  // Price between X and Y
  const betweenPrice = lower.match(/(?:between|from)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:and|to|-)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (betweenPrice) {
    const p1 = Number(betweenPrice[1].replace(/,/g, ''));
    const p2 = Number(betweenPrice[2].replace(/,/g, ''));
    if (Number.isFinite(p1) && Number.isFinite(p2)) {
      filters.price_min = Math.min(p1, p2);
      filters.price_max = Math.max(p1, p2);
    }
  } else {
    const underPrice = lower.match(/(?:under|below|less than|max|<=?)\s*\$?\s*([\d,]+(?:\.\d+)?)(?!\s*mm)/i);
    if (underPrice) {
      const val = Number(underPrice[1].replace(/,/g, ''));
      if (Number.isFinite(val)) filters.price_max = val;
    }
    const overPrice = lower.match(/(?:over|above|more than|min|>=?)\s*\$?\s*([\d,]+(?:\.\d+)?)(?!\s*mm)/i);
    if (overPrice) {
      const val = Number(overPrice[1].replace(/,/g, ''));
      if (Number.isFinite(val)) filters.price_min = val;
    }
  }

  // Case diameter bounds (e.g., "38mm to 42mm" or "40mm")
  const rangeMm = lower.match(/(\d{2}(?:\.\d+)?)\s*(?:mm)?\s*(?:to|-)\s*(\d{2}(?:\.\d+)?)\s*mm/i);
  if (rangeMm) {
    const d1 = Number(rangeMm[1]);
    const d2 = Number(rangeMm[2]);
    filters.diameter_min_mm = Math.min(d1, d2);
    filters.diameter_max_mm = Math.max(d1, d2);
  } else {
    const singleMm = lower.match(/\b(\d{2}(?:\.\d+)?)\s*mm\b/i);
    if (singleMm) {
      const d = Number(singleMm[1]);
      filters.diameter_min_mm = d - 1.0;
      filters.diameter_max_mm = d + 1.0;
    }
  }

  return filters;
}

/**
 * Zero-norm-safe cosine similarity between two numeric vectors.
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0.0;
  }
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 1e-12) return 0.0;
  return Math.max(-1.0, Math.min(1.0, dot / denom));
}

/**
 * Okapi BM25 lexical scorer over a watch catalog.
 * @param {string} query
 * @param {Array<Object>} catalog
 * @param {{k1?: number, b?: number}} options
 * @returns {Array<{id: string|number, score: number}>}
 */
export function scoreBM25(query, catalog, { k1 = 1.5, b = 0.75 } = {}) {
  const qTerms = tokenize(query);
  if (qTerms.length === 0 || !Array.isArray(catalog) || catalog.length === 0) {
    return [];
  }

  const N = catalog.length;
  const docTokensList = catalog.map((item) => {
    const text = [
      item.brand,
      item.model_name,
      item.reference_number,
      item.watch_type,
      item.dial_color,
      item.case_material,
      item.movement,
      item.description,
    ]
      .filter(Boolean)
      .join(' ');
    return tokenize(text);
  });

  const avgDl = docTokensList.reduce((acc, t) => acc + t.length, 0) / N || 1;

  // Document frequencies
  const df = new Map();
  for (const q of new Set(qTerms)) {
    let count = 0;
    for (const tokens of docTokensList) {
      if (tokens.includes(q)) count++;
    }
    df.set(q, count);
  }

  const scored = catalog.map((item, idx) => {
    const tokens = docTokensList[idx];
    const dl = tokens.length;
    const tfMap = new Map();
    for (const tok of tokens) {
      tfMap.set(tok, (tfMap.get(tok) || 0) + 1);
    }

    let score = 0.0;
    for (const q of qTerms) {
      const tf = tfMap.get(q) || 0;
      if (tf === 0) continue;
      const n_q = df.get(q) || 0;
      const idf = Math.log(1 + (N - n_q + 0.5) / (n_q + 0.5));
      const num = tf * (k1 + 1);
      const den = tf + k1 * (1 - b + b * (dl / avgDl));
      score += idf * (num / den);
    }

    return { id: item.id, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, bItem) => bItem.score - a.score);
}

/**
 * Weighted Reciprocal Rank Fusion (RRF) over multiple ranked lists.
 * @param {Array<Array<{id: string|number, score?: number}>>} rankedLists
 * @param {object} options
 * @returns {Array<{id: string|number, rrf_score: number, lexical_rank: number|null, semantic_rank: number|null}>}
 */
export function reciprocalRankFusion(rankedLists, { k = 60, weights = null } = {}) {
  if (!Array.isArray(rankedLists) || rankedLists.length === 0) return [];
  const effectiveWeights =
    Array.isArray(weights) && weights.length === rankedLists.length
      ? weights
      : rankedLists.map(() => 1.0);

  const fused = new Map();

  rankedLists.forEach((list, listIdx) => {
    const w = Number(effectiveWeights[listIdx]) || 1.0;
    (list || []).forEach((entry, rankIdx) => {
      const rank = rankIdx + 1;
      const prev = fused.get(entry.id) || {
        id: entry.id,
        rrf_score: 0.0,
        lexical_rank: null,
        semantic_rank: null,
      };
      prev.rrf_score += w / (k + rank);
      if (listIdx === 0) prev.lexical_rank = rank;
      if (listIdx === 1) prev.semantic_rank = rank;
      fused.set(entry.id, prev);
    });
  });

  return Array.from(fused.values()).sort((a, b) => b.rrf_score - a.rrf_score);
}

/**
 * Execute end-to-end hybrid catalog search combining structured constraint filtering,
 * BM25 lexical retrieval, dense vector cosine retrieval, and Reciprocal Rank Fusion.
 */
export function hybridSearchCatalog(
  query,
  catalog,
  {
    queryEmbedding = null,
    topK = 10,
    rrfK = 60,
    lexicalWeight = 1.0,
    semanticWeight = 1.0,
    applyHardFilters = true,
  } = {}
) {
  const parsed = parseNaturalWatchQuery(query);
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return { filters: parsed, results: [] };
  }

  const candidateItems = applyHardFilters
    ? catalog.filter((item) => {
        const price = Number(item.price_eur ?? item.price_usd ?? item.price);
        if (parsed.price_max !== null && Number.isFinite(price) && price > parsed.price_max) {
          return false;
        }
        if (parsed.price_min !== null && Number.isFinite(price) && price < parsed.price_min) {
          return false;
        }
        if (parsed.diameter_min_mm !== null && Number.isFinite(item.diameter_mm)) {
          if (item.diameter_mm < parsed.diameter_min_mm || item.diameter_mm > parsed.diameter_max_mm) {
            return false;
          }
        }
        return true;
      })
    : catalog;

  if (candidateItems.length === 0) {
    return { filters: parsed, results: [] };
  }

  const bm25Ranked = scoreBM25(query, candidateItems);

  let semanticRanked = [];
  if (Array.isArray(queryEmbedding) && queryEmbedding.length > 0) {
    semanticRanked = candidateItems
      .map((item) => ({
        id: item.id,
        score: cosineSimilarity(queryEmbedding, item.embedding),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  const fused = reciprocalRankFusion([bm25Ranked, semanticRanked], {
    k: rrfK,
    weights: [lexicalWeight, semanticWeight],
  });

  const itemMap = new Map(candidateItems.map((it) => [it.id, it]));
  const bm25Map = new Map(bm25Ranked.map((it) => [it.id, it.score]));
  const semMap = new Map(semanticRanked.map((it) => [it.id, it.score]));

  const results = fused.slice(0, topK).map((entry) => {
    const watch = itemMap.get(entry.id);
    return {
      ...watch,
      rrf_score: Number(entry.rrf_score.toFixed(6)),
      bm25_score: Number((bm25Map.get(entry.id) || 0).toFixed(4)),
      semantic_score: Number((semMap.get(entry.id) || 0).toFixed(4)),
      lexical_rank: entry.lexical_rank,
      semantic_rank: entry.semantic_rank,
    };
  });

  return { filters: parsed, results };
}

/**
 * Evaluate watch price history for median, MAD z-score discount anomalies, max drawdown,
 * and cross-marketplace spread (e.g., Chrono24 vs Jomashop).
 * @param {Array<{price: number, source?: string, recorded_at?: string}>} history
 */
export function analyzePriceHistory(history) {
  const valid = (history || [])
    .map((h) => ({
      price: Number(h.price),
      source: h.source || 'Unknown',
      recorded_at: h.recorded_at || null,
    }))
    .filter((h) => Number.isFinite(h.price) && h.price > 0);

  if (valid.length === 0) {
    return {
      count: 0,
      latest_price: null,
      median_price: null,
      mad: 0,
      latest_mad_zscore: 0,
      is_discount_anomaly: false,
      max_drawdown_pct: 0,
      cross_market_spread_pct: 0,
    };
  }

  const prices = valid.map((v) => v.price);
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const absDevs = sorted.map((p) => Math.abs(p - median)).sort((a, b) => a - b);
  const mad =
    absDevs.length % 2 === 0
      ? (absDevs[mid - 1] + absDevs[mid]) / 2
      : absDevs[mid];

  const latest = prices[prices.length - 1];
  const robustSigma = mad * 1.4826;
  const latestMadZ = robustSigma > 1e-9 ? (latest - median) / robustSigma : 0.0;

  // Max drawdown across sequential observations
  let peak = prices[0];
  let maxDd = 0.0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = peak > 0 ? ((peak - p) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // Cross-marketplace lowest vs highest median
  const bySource = new Map();
  for (const v of valid) {
    if (!bySource.has(v.source)) bySource.set(v.source, []);
    bySource.get(v.source).push(v.price);
  }
  let minSourceAvg = Infinity;
  let maxSourceAvg = -Infinity;
  for (const arr of bySource.values()) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (avg < minSourceAvg) minSourceAvg = avg;
    if (avg > maxSourceAvg) maxSourceAvg = avg;
  }
  const spreadPct =
    bySource.size > 1 && maxSourceAvg > 0
      ? ((maxSourceAvg - minSourceAvg) / maxSourceAvg) * 100
      : 0.0;

  return {
    count: valid.length,
    latest_price: latest,
    median_price: Number(median.toFixed(2)),
    mad: Number(mad.toFixed(2)),
    latest_mad_zscore: Number(latestMadZ.toFixed(4)),
    is_discount_anomaly: latestMadZ <= -2.0 && latest < median,
    max_drawdown_pct: Number(maxDd.toFixed(2)),
    cross_market_spread_pct: Number(spreadPct.toFixed(2)),
  };
}

/**
 * Compute Recall@K, Precision@K, MRR, and nDCG@K for ranked watch search results.
 * @param {Array<string|number>} rankedIds
 * @param {Array<string|number>} relevantIds
 * @param {number} k
 */
export function evaluateSearchRelevance(rankedIds, relevantIds, k = 5) {
  const relSet = new Set(relevantIds || []);
  if (relSet.size === 0 || k <= 0) {
    return { recall_at_k: 0, precision_at_k: 0, mrr: 0, ndcg_at_k: 0 };
  }

  const topK = (rankedIds || []).slice(0, k);
  let hits = 0;
  let dcg = 0.0;
  let firstRelRank = null;

  topK.forEach((id, idx) => {
    if (relSet.has(id)) {
      hits += 1;
      dcg += 1.0 / Math.log2(idx + 2);
      if (firstRelRank === null) firstRelRank = idx + 1;
    }
  });

  // Also check full list for MRR if not found in topK
  if (firstRelRank === null && Array.isArray(rankedIds)) {
    for (let i = 0; i < rankedIds.length; i++) {
      if (relSet.has(rankedIds[i])) {
        firstRelRank = i + 1;
        break;
      }
    }
  }

  const idealHits = Math.min(relSet.size, k);
  let idcg = 0.0;
  for (let i = 0; i < idealHits; i++) {
    idcg += 1.0 / Math.log2(i + 2);
  }

  return {
    recall_at_k: Number((hits / relSet.size).toFixed(4)),
    precision_at_k: Number((hits / k).toFixed(4)),
    mrr: firstRelRank ? Number((1.0 / firstRelRank).toFixed(4)) : 0,
    ndcg_at_k: idcg > 0 ? Number((dcg / idcg).toFixed(4)) : 0,
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize,
  parseNaturalWatchQuery,
  cosineSimilarity,
  scoreBM25,
  reciprocalRankFusion,
  hybridSearchCatalog,
  analyzePriceHistory,
  evaluateSearchRelevance,
} from '../backend/hybridSearchEngine.js';
import { shouldTriggerPriceAlert } from '../backend/priceTracker.js';

const CATALOG = [
  {
    id: 'omega-smp',
    brand: 'Omega',
    model_name: 'Seamaster Diver 300M Co-Axial',
    reference_number: '210.30.42.20.03.001',
    watch_type: 'diver',
    dial_color: 'blue',
    case_material: 'stainless steel',
    diameter_mm: 42,
    price_eur: 4650,
    embedding: [0.9, 0.3, 0.1, 0.0],
  },
  {
    id: 'tudor-fxd',
    brand: 'Tudor',
    model_name: 'Pelagos FXD Marine Nationale',
    reference_number: 'M25707B',
    watch_type: 'diver',
    dial_color: 'blue',
    case_material: 'titanium',
    diameter_mm: 42,
    price_eur: 3680,
    embedding: [0.92, 0.28, 0.05, 0.02],
  },
  {
    id: 'breitling-navi',
    brand: 'Breitling',
    model_name: 'Navitimer B01 Chronograph 43',
    reference_number: 'AB0138',
    watch_type: 'chronograph',
    dial_color: 'silver',
    case_material: 'stainless steel',
    diameter_mm: 43,
    price_eur: 7400,
    embedding: [0.1, 0.2, 0.9, 0.4],
  },
  {
    id: 'cartier-santos',
    brand: 'Cartier',
    model_name: 'Santos de Cartier Medium',
    reference_number: 'WSSA0029',
    watch_type: 'dress',
    dial_color: 'white',
    case_material: 'stainless steel',
    diameter_mm: 35,
    price_eur: 6800,
    embedding: [0.05, 0.85, 0.2, 0.3],
  },
];

test('parseNaturalWatchQuery extracts brand, type, color, material, diameter, and price limits', () => {
  const parsed = parseNaturalWatchQuery('Find a blue titanium Tudor diving watch under $4,500 between 38mm to 42mm');
  assert.deepEqual(parsed.brands, ['tudor']);
  assert.equal(parsed.watch_type, 'diver');
  assert.equal(parsed.dial_color, 'blue');
  assert.equal(parsed.case_material, 'titanium');
  assert.equal(parsed.price_max, 4500);
  assert.equal(parsed.diameter_min_mm, 38);
  assert.equal(parsed.diameter_max_mm, 42);
});

test('parseNaturalWatchQuery handles between price range and rejects empty queries', () => {
  const parsed = parseNaturalWatchQuery('Omega chronograph between $3,000 and $8,000 40mm');
  assert.equal(parsed.price_min, 3000);
  assert.equal(parsed.price_max, 8000);
  assert.equal(parsed.diameter_min_mm, 39);
  assert.equal(parsed.diameter_max_mm, 41);

  assert.throws(() => parseNaturalWatchQuery('   '), /Invalid query parameter/);
});

test('cosineSimilarity is zero-norm-safe and handles mismatched dimensions', () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0.0);
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0.0);
  assert.equal(cosineSimilarity([], []), 0.0);
  const sim = cosineSimilarity([1, 0, 0], [1, 0, 0]);
  assert.ok(Math.abs(sim - 1.0) < 1e-9);
});

test('scoreBM25 ranks matching watch documents above non-matching documents', () => {
  const ranked = scoreBM25('Tudor titanium blue diver', CATALOG);
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].id, 'tudor-fxd');
  assert.equal(scoreBM25('', CATALOG).length, 0);
});

test('reciprocalRankFusion combines lexical and semantic rankings deterministically', () => {
  const lex = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const sem = [{ id: 'b' }, { id: 'a' }, { id: 'd' }];
  const fused = reciprocalRankFusion([lex, sem], { k: 60, weights: [1.0, 1.5] });
  assert.equal(fused[0].id, 'b');
  assert.equal(fused[0].lexical_rank, 2);
  assert.equal(fused[0].semantic_rank, 1);
});

test('hybridSearchCatalog applies price and diameter filters and fuses BM25 + embeddings', () => {
  const res = hybridSearchCatalog('blue diver under 4000', CATALOG, {
    queryEmbedding: [0.91, 0.29, 0.06, 0.01],
    topK: 5,
  });
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].id, 'tudor-fxd');
  assert.ok(res.results[0].rrf_score > 0);
});

test('analyzePriceHistory detects MAD discount anomalies and cross-marketplace spreads', () => {
  const stats = analyzePriceHistory([
    { price: 5000, source: 'Chrono24' },
    { price: 5020, source: 'Chrono24' },
    { price: 4980, source: 'Chrono24' },
    { price: 5010, source: 'Chrono24' },
    { price: 4100, source: 'Jomashop' },
  ]);
  assert.equal(stats.count, 5);
  assert.equal(stats.median_price, 5000);
  assert.equal(stats.is_discount_anomaly, true);
  assert.ok(stats.max_drawdown_pct > 15);
  assert.ok(stats.cross_market_spread_pct > 15);
});

test('shouldTriggerPriceAlert enforces 24h cooldown and validates positive prices', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const watch = { id: 'tudor-fxd', price_eur: 3600 };

  assert.equal(
    shouldTriggerPriceAlert({ target_price: 3800, is_active: true, last_notified: null }, watch, now),
    true
  );
  // Notified 12 hours ago -> cooldown active
  assert.equal(
    shouldTriggerPriceAlert(
      { target_price: 3800, is_active: true, last_notified: '2026-10-15T00:00:00Z' },
      watch,
      now
    ),
    false
  );
  // Notified 25 hours ago -> should fire again
  assert.equal(
    shouldTriggerPriceAlert(
      { target_price: 3800, is_active: true, last_notified: '2026-10-14T10:00:00Z' },
      watch,
      now
    ),
    true
  );
  // Invalid or zero prices -> false
  assert.equal(
    shouldTriggerPriceAlert({ target_price: 0, is_active: true }, watch, now),
    false
  );
  assert.equal(
    shouldTriggerPriceAlert({ target_price: 3800, is_active: true }, { price_eur: -10 }, now),
    false
  );
});

test('evaluateSearchRelevance computes Recall@K, Precision@K, MRR, and nDCG@K', () => {
  const metrics = evaluateSearchRelevance(['tudor-fxd', 'breitling-navi', 'omega-smp'], ['tudor-fxd', 'omega-smp'], 3);
  assert.equal(metrics.recall_at_k, 1.0);
  assert.equal(metrics.precision_at_k, 0.6667);
  assert.equal(metrics.mrr, 1.0);
  assert.ok(metrics.ndcg_at_k > 0.9 && metrics.ndcg_at_k <= 1.0);
});

import { computeCatalogCoverageStats } from '../backend/hybridSearchEngine.js';

test('computeCatalogCoverageStats computes brand Shannon entropy and coverage', () => {
  const catalog = [
    { id: '1', brand: 'Rolex', price: 10500 },
    { id: '2', brand: 'Omega', price: 6200 },
    { id: '3', brand: 'Seiko', price: 850 },
    { id: '4', brand: 'Tudor', price: 3900 },
  ];
  const stats = computeCatalogCoverageStats(catalog, [catalog[0], catalog[1]]);
  assert.equal(stats.catalogSize, 4);
  assert.equal(stats.uniqueBrands, 4);
  assert.equal(stats.brandEntropyBits, 2);
  assert.equal(stats.topKBrandCoverage, 0.5);
});

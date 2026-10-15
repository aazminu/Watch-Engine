#!/usr/bin/env node
import {
  hybridSearchCatalog,
  analyzePriceHistory,
  evaluateSearchRelevance,
} from './hybridSearchEngine.js';

const SAMPLE_CATALOG = [
  {
    id: 'w-101',
    brand: 'Omega',
    model_name: 'Seamaster Diver 300M',
    reference_number: '210.30.42.20.03.001',
    watch_type: 'diver',
    dial_color: 'blue',
    case_material: 'stainless steel',
    diameter_mm: 42,
    price_eur: 4650,
    embedding: [0.85, 0.42, 0.12, 0.05],
  },
  {
    id: 'w-102',
    brand: 'Tudor',
    model_name: 'Pelagos 39 Titanium Diver',
    reference_number: 'M25407N-0001',
    watch_type: 'diver',
    dial_color: 'black',
    case_material: 'titanium',
    diameter_mm: 39,
    price_eur: 3950,
    embedding: [0.78, 0.51, 0.18, 0.08],
  },
  {
    id: 'w-103',
    brand: 'Tudor',
    model_name: 'Pelagos FXD Blue Titanium',
    reference_number: 'M25707B/24-0001',
    watch_type: 'diver',
    dial_color: 'blue',
    case_material: 'titanium',
    diameter_mm: 42,
    price_eur: 3680,
    embedding: [0.91, 0.39, 0.09, 0.03],
  },
  {
    id: 'w-104',
    brand: 'Breitling',
    model_name: 'Navitimer B01 Chronograph',
    reference_number: 'AB0138241G1P1',
    watch_type: 'chronograph',
    dial_color: 'silver',
    case_material: 'stainless steel',
    diameter_mm: 43,
    price_eur: 7200,
    embedding: [0.15, 0.22, 0.88, 0.41],
  },
];

const args = process.argv.slice(2);
const cmd = args[0] || 'search';

if (cmd === 'search') {
  const query = args.slice(1).join(' ') || 'blue titanium diver under 4500';
  const out = hybridSearchCatalog(query, SAMPLE_CATALOG, {
    queryEmbedding: [0.9, 0.4, 0.1, 0.02],
    topK: 5,
  });
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === 'eval') {
  const out = hybridSearchCatalog('blue diver under 5000', SAMPLE_CATALOG, {
    queryEmbedding: [0.88, 0.41, 0.11, 0.04],
    topK: 4,
  });
  const rankedIds = out.results.map((r) => r.id);
  const metrics = evaluateSearchRelevance(rankedIds, ['w-101', 'w-103'], 3);
  console.log(JSON.stringify({ rankedIds, metrics }, null, 2));
} else if (cmd === 'price-audit') {
  const report = analyzePriceHistory([
    { price: 4200, source: 'Chrono24' },
    { price: 4180, source: 'Chrono24' },
    { price: 4240, source: 'Chrono24' },
    { price: 4190, source: 'Chrono24' },
    { price: 3650, source: 'Jomashop' },
  ]);
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error(`Unknown subcommand: ${cmd}. Use search | eval | price-audit`);
  process.exit(1);
}

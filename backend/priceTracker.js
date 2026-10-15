/**
 * Price Tracker — Scheduled Script
 *
 * Snapshots current prices from the watches table into price_history,
 * then checks active alerts and logs which ones are triggered.
 *
 * Run manually:   node backend/priceTracker.js
 * Run via cron:   every 6 hours
 *
 * Prerequisites:
 *   - .env with Supabase credentials
 *   - price_history and price_alerts tables created
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

const PAGE_SIZE = 500;

async function snapshotPrices() {
  console.log('Snapshotting current prices into price_history...');
  let offset = 0;
  let totalRecorded = 0;

  while (true) {
    const { data: watches, error } = await supabase
      .from('watches')
      .select('id, price_eur, source')
      .not('price_eur', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) { console.error('Fetch error:', error); break; }
    if (!watches || watches.length === 0) break;

    const rows = watches.map(w => ({
      watch_id: w.id,
      price: w.price_eur,
      source: w.source || 'Unknown',
    }));

    const { error: insertError } = await supabase
      .from('price_history')
      .insert(rows);

    if (insertError) {
      console.error('Insert error:', insertError);
      break;
    }

    totalRecorded += rows.length;
    console.log(`  Recorded ${totalRecorded} prices so far...`);
    offset += PAGE_SIZE;
  }

  console.log(`Price snapshot complete: ${totalRecorded} records.`);
  return totalRecorded;
}

async function checkAlerts() {
  console.log('\nChecking active price alerts...');

  // Get all active alerts
  const { data: alerts, error } = await supabase
    .from('price_alerts')
    .select('id, user_id, watch_id, target_price, last_notified')
    .eq('is_active', true);

  if (error) { console.error('Alert fetch error:', error); return; }
  if (!alerts || alerts.length === 0) {
    console.log('No active alerts.');
    return;
  }

  console.log(`Found ${alerts.length} active alerts.`);

  // Get current prices for all alerted watches
  const watchIds = [...new Set(alerts.map(a => a.watch_id))];
  const { data: watches } = await supabase
    .from('watches')
    .select('id, price_eur, model_name')
    .in('id', watchIds);

  const watchMap = new Map((watches || []).map(w => [w.id, w]));

  let triggered = 0;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  for (const alert of alerts) {
    const watch = watchMap.get(alert.watch_id);
    if (!watch || !watch.price_eur) continue;

    if (watch.price_eur <= alert.target_price) {
      // Skip if already notified within 24h
      if (alert.last_notified && alert.last_notified > oneDayAgo) continue;

      triggered++;
      console.log(`  TRIGGERED: "${watch.model_name}" is $${watch.price_eur} (target: $${alert.target_price})`);

      // Mark as notified
      await supabase
        .from('price_alerts')
        .update({ last_notified: new Date().toISOString() })
        .eq('id', alert.id);

      // TODO: Send email notification here
      // await sendAlertEmail(alert.user_id, watch.model_name, watch.price_eur, alert.target_price);
    }
  }

  console.log(`${triggered} alerts triggered.`);
}

async function main() {
  const startTime = Date.now();
  console.log('='.repeat(50));
  console.log(`Price Tracker — ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  await snapshotPrices();
  await checkAlerts();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
}

main().catch(console.error);

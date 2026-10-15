/**
 * Price Tracker - Scheduled Script & Alert Evaluator
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PAGE_SIZE = 500;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

let _supabase = null;
export async function getSupabaseClient() {
  if (!_supabase) {
    try {
      const dotenv = await import('dotenv');
      dotenv.default.config({ path: path.resolve(__dirname, '../.env') });
    } catch {}
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/**
 * Deterministically evaluate whether an alert should fire for a watch snapshot.
 * Fixes ISO string comparison bug and guards against invalid/non-positive prices.
 */
export function shouldTriggerPriceAlert(alert, watch, nowMs = Date.now()) {
  if (!alert || !watch) return false;
  if (alert.is_active === false) return false;

  const currentPrice = Number(watch.price_eur ?? watch.price);
  const targetPrice = Number(alert.target_price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false;
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return false;
  if (currentPrice > targetPrice) return false;

  if (alert.last_notified) {
    const lastMs = Date.parse(alert.last_notified);
    if (Number.isFinite(lastMs) && nowMs - lastMs < COOLDOWN_MS) {
      return false;
    }
  }

  return true;
}

export async function snapshotPrices(supabase = null) {
  const client = supabase || (await getSupabaseClient());
  let offset = 0;
  let totalRecorded = 0;

  while (true) {
    const { data: watches, error } = await client
      .from('watches')
      .select('id, price_eur, source')
      .not('price_eur', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) { console.error('Fetch error:', error); break; }
    if (!watches || watches.length === 0) break;

    const rows = watches
      .filter(w => Number.isFinite(Number(w.price_eur)) && Number(w.price_eur) > 0)
      .map(w => ({
        watch_id: w.id,
        price: Number(w.price_eur),
        source: w.source || 'Unknown',
      }));

    if (rows.length > 0) {
      const { error: insertError } = await client
        .from('price_history')
        .insert(rows);

      if (insertError) {
        console.error('Insert error:', insertError);
        break;
      }
      totalRecorded += rows.length;
    }
    offset += PAGE_SIZE;
  }

  return totalRecorded;
}

export async function checkAlerts(supabase = null, nowMs = Date.now()) {
  const client = supabase || (await getSupabaseClient());
  const { data: alerts, error } = await client
    .from('price_alerts')
    .select('id, user_id, watch_id, target_price, last_notified, is_active')
    .eq('is_active', true);

  if (error || !alerts || alerts.length === 0) return 0;

  const watchIds = [...new Set(alerts.map(a => a.watch_id))];
  const { data: watches } = await client
    .from('watches')
    .select('id, price_eur, model_name')
    .in('id', watchIds);

  const watchMap = new Map((watches || []).map(w => [w.id, w]));
  let triggered = 0;

  for (const alert of alerts) {
    const watch = watchMap.get(alert.watch_id);
    if (!shouldTriggerPriceAlert(alert, watch, nowMs)) continue;

    triggered++;
    await client
      .from('price_alerts')
      .update({ last_notified: new Date(nowMs).toISOString() })
      .eq('id', alert.id);
  }

  return triggered;
}

async function main() {
  await snapshotPrices();
  await checkAlerts();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(console.error);
}

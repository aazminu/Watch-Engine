import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

export async function getUserSubscription(userId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export function isPro(subscription) {
  if (!subscription) return false;
  return (
    subscription.plan === 'pro' &&
    subscription.status === 'active' &&
    (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
  );
}

export function buildAffiliateUrl(originalUrl, source) {
  if (!originalUrl) return null;
  try {
    const url = new URL(originalUrl);
    if (source?.toLowerCase().includes('jomashop') && process.env.JOMASHOP_AFFILIATE_ID) {
      url.searchParams.set('aid', process.env.JOMASHOP_AFFILIATE_ID);
    } else if (source?.toLowerCase().includes('chrono24') && process.env.CHRONO24_AFFILIATE_ID) {
      url.searchParams.set('refId', process.env.CHRONO24_AFFILIATE_ID);
    }
    return url.toString();
  } catch {
    return originalUrl;
  }
}

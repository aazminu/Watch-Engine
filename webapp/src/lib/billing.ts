import { API_URL } from '../config';
import { supabase } from './supabaseClient';

/**
 * Create a Stripe checkout or billing-portal session and redirect to it.
 * Resolves with an error message if the session couldn't be created.
 */
export async function redirectToBilling(
  endpoint: 'create-checkout-session' | 'create-portal-session'
): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    window.location.href = '/login';
    return null;
  }

  try {
    const res = await fetch(`${API_URL}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const result = await res.json().catch(() => null);
    if (res.ok && result?.success && result.data?.url) {
      window.location.href = result.data.url;
      return null;
    }
    return result?.message || 'Could not reach billing. Please try again.';
  } catch (err) {
    console.error(`${endpoint} error:`, err);
    return 'Could not reach billing. Please try again.';
  }
}

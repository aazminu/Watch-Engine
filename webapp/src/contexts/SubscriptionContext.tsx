import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

interface SubscriptionState {
  plan: 'free' | 'pro';
  isPro: boolean;
  loading: boolean;
  refetch: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  plan: 'free',
  isPro: false,
  loading: true,
  refetch: async () => false,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();

  // Returns whether the user is on Pro, so callers can poll until a webhook lands
  const fetchSubscription = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPlan('free');
        setIsPro(false);
        setLoading(false);
        return false;
      }

      const res = await fetch(`${API_URL}/api/subscription`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (result.success) {
        setPlan(result.data.plan);
        setIsPro(result.data.isPro);
        return Boolean(result.data.isPro);
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    } finally {
      setLoading(false);
    }
    return false;
  }, []);

  // Refetch whenever the signed-in user changes (login, logout, account switch)
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription, user?.id]);

  // Returning from Stripe checkout: the webhook may land a few seconds after the redirect
  useEffect(() => {
    if (!user?.id || !new URLSearchParams(window.location.search).has('upgraded')) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        if (await fetchSubscription()) return;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    })();
    return () => { cancelled = true; };
  }, [fetchSubscription, user?.id]);

  return (
    <SubscriptionContext.Provider value={{ plan, isPro, loading, refetch: fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

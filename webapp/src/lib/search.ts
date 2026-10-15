import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const ANONYMOUS_SEARCH_LIMIT = 3;

export interface SearchResult {
  id: string;
  model_name: string;
  family_name: string;
  movement_name: string;
  function_name: string;
  year_produced: string;
  limited_edition: boolean;
  price_eur: number;
  image_url: string;
  description: string;
  dial_color: string;
  similarity?: number;
}

export async function searchWatches(query: string): Promise<SearchResult[]> {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const today = new Date().toISOString().split('T')[0];

    if (!user) {
      // Handle anonymous user search limit
      const { data: searchData, error: searchError } = await supabase
        .from('anonymous_searches')
        .select('search_count')
        .eq('ip_address', window.location.hostname)
        .eq('search_date', today)
        .single();

      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }

      const currentCount = searchData?.search_count || 0;

      if (currentCount >= ANONYMOUS_SEARCH_LIMIT) {
        throw new Error(`You have reached your daily search limit of ${ANONYMOUS_SEARCH_LIMIT} searches. Please sign up or log in to continue searching.`);
      }

      const { error: upsertError } = await supabase
        .from('anonymous_searches')
        .upsert({
          ip_address: window.location.hostname,
          search_date: today,
          search_count: currentCount + 1
        }, {
          onConflict: 'ip_address,search_date'
        });

      if (upsertError) throw upsertError;
    } else {
      // Handle authenticated user search limit
      const { data: searchData, error: searchError } = await supabase
        .from('user_searches')
        .select('search_count')
        .eq('user_id', user.id)
        .eq('search_date', today)
        .single();

      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }

      const DAILY_SEARCH_LIMIT = 10;
      const currentCount = searchData?.search_count || 0;

      if (currentCount >= DAILY_SEARCH_LIMIT) {
        throw new Error(`You have reached your daily search limit of ${DAILY_SEARCH_LIMIT} searches. Please try again tomorrow.`);
      }

      const { error: upsertError } = await supabase
        .from('user_searches')
        .upsert({
          user_id: user.id,
          search_date: today,
          search_count: currentCount + 1
        }, {
          onConflict: 'user_id,search_date'
        });

      if (upsertError) throw upsertError;
    }

    // Call the hybrid search endpoint (handles both vector + filter search)
    const response = await fetch(`${API_URL}/api/hybrid-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Error in searchWatches:', error);
    throw error;
  }
}

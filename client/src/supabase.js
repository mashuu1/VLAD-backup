import { createClient } from '@supabase/supabase-js';

// Get environment variables or fall back to empty strings
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Fallback static client (if variables exist at build time)
export let supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Dynamic runtime initialization helper
export const initializeSupabaseClient = (url, key) => {
  if (!supabase && url && key) {
    supabase = createClient(url, key);
  }
  return supabase;
};

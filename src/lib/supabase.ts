import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Automatically correct values if Render has them swapped.
const supabaseUrl = rawUrl?.startsWith('sb_publishable_')
  ? rawKey
  : rawUrl;

const supabaseAnonKey = rawUrl?.startsWith('sb_publishable_')
  ? rawUrl
  : rawKey;

if (
  !supabaseUrl?.startsWith('https://') &&
  !supabaseUrl?.startsWith('http://')
) {
  throw new Error('Invalid Supabase URL. Check Render environment variables.');
}

if (!supabaseAnonKey?.startsWith('sb_publishable_')) {
  throw new Error('Invalid Supabase Publishable Key. Check Render environment variables.');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

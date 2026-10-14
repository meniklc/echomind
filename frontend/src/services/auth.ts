import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseAuthClient(): SupabaseClient | null {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }
  return supabaseClient;
}

import { createClient } from '@supabase/supabase-js';

// These should be replaced with your actual Supabase project credentials
// You can find these in your Supabase Dashboard under Settings > API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ SUPABASE ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in Vercel Environment Variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

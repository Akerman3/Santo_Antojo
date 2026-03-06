import { createClient } from '@supabase/supabase-js';

// These should be replaced with your actual Supabase project credentials
// You can find these in your Supabase Dashboard under Settings > API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let clientInstance: any = null;

export const getSupabase = () => {
    if (clientInstance) return clientInstance;

    console.log('--- INITIALIZING SUPABASE CLIENT ---');
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('⚠️ SUPABASE ERROR: Missing API keys in Environment Variables.');
    }

    try {
        clientInstance = createClient(supabaseUrl, supabaseAnonKey);
        console.log('✅ Supabase Client Created');
    } catch (err) {
        console.error('❌ Failed to create Supabase client:', err);
    }

    return clientInstance;
};

// For backward compatibility while we refactor
export const supabase = getSupabase();

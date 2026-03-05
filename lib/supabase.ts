// Supabase client configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Only create client if valid credentials exist
const isValidConfig = 
  supabaseUrl.length > 0 && 
  supabaseUrl.startsWith('http') &&
  supabaseAnonKey.length > 10;

export const supabase = isValidConfig 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = () => supabase !== null;

// Database schema will be:
// Table: companies
// Columns match the Company interface in types.ts

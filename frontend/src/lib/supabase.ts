import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Stage 4c auth↔address mapping. Uses the ANON/publishable key ONLY — the browser
// bundle must never contain a service-role key. RLS governs what anon can read/write;
// see frontend/supabase/migrations/0001_user_instances.sql for the enforced policy.
//
// When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset this is `null` and the
// dashboard falls back to on-chain owner-based enumeration (see routes/Dashboard.tsx).
export const supabase =
  config.supabaseUrl && config.supabaseKey
    ? createClient(config.supabaseUrl, config.supabaseKey)
    : null;

/** Type of a row in the user_instances mapping table (see migrations/0001). */
export interface UserInstanceRow {
  id: string;
  email: string;
  wallet_address: string;
  instance_address: string;
  created_at: string;
}
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Optional public-chain wallet↔treasury projection. Uses the ANON/publishable key ONLY;
// the browser bundle must never contain a service-role key. The mapping deliberately
// contains no email/social-login identifier because those values are not required for
// on-chain discovery and should not be exposed through an anon-readable table.
//
// When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset this is `null` and the
// dashboard falls back to authoritative on-chain owner-based enumeration.
export const supabase =
  config.supabaseUrl && config.supabaseKey
    ? createClient(config.supabaseUrl, config.supabaseKey)
    : null;

/** Type of a public row in the user_instances mapping table (see migrations/0001). */
export interface UserInstanceRow {
  id: string;
  wallet_address: string;
  instance_address: string;
  created_at: string;
}

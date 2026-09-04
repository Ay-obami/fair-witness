import { supabase } from "./supabase";

// Stage 4c — Supabase upsert keyed on (email, wallet_address) <-> instance address,
// replacing the pre-pivot localStorage prototype (which never made it into this repo).
// The instance's on-chain owner is the signing wallet, so wallet_address is the
// deterministic key discriminator; email is stored for the dashboard's "signed in as".
//
// Design notes (kept honest in ROADMAP/DEPLOYMENT too):
// - Supabase is OPTIONAL. When VITE_SUPABASE_URL/_KEY are unset every call here is a
//   graceful no-op and the UI falls back to on-chain owner enumeration (Dashboard.tsx).
// - RLS: the anon/publishable key is intentionally limited by 0001_user_instances.sql.
//   Per-user access auth (custom JWT bridging Thirdweb session identity to Supabase
//   auth) is tracked in ROADMAP Stage 4b as the hardening item.

export interface SupabaseMapping {
  email: string;
  walletAddress: string;
  instanceAddress: string;
}

function asMapping(row: {
  email: string;
  wallet_address: string;
  instance_address: string;
}): SupabaseMapping {
  return {
    email: row.email,
    walletAddress: row.wallet_address,
    instanceAddress: row.instance_address,
  };
}

/** Persist one wallet→instance mapping. `{ ok: false }` (with reason) when unset/failing. */
export async function saveInstanceMapping(
  mapping: SupabaseMapping
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return { ok: false, error: "Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)." };
  }
  const { error } = await supabase
    .from("user_instances")
    .upsert(
      {
        email: mapping.email.toLowerCase(),
        wallet_address: mapping.walletAddress.toLowerCase(),
        instance_address: mapping.instanceAddress.toLowerCase(),
      },
      { onConflict: "instance_address", ignoreDuplicates: false }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Mappings whose on-chain owner is `walletAddress`. `null` when unconfigured. */
export async function fetchInstancesForWallet(
  walletAddress: string
): Promise<SupabaseMapping[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_instances")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase());
  if (error) return null;
  return (data ?? []).map(asMapping);
}

/** Lowercase-normalizes an Ethereum address for column lookups. */
export function normalizeAddress(a: string) {
  return a.toLowerCase();
}
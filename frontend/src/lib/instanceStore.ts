import { supabase } from "./supabase";

// Optional wallet→treasury cache. Both fields are already public on-chain. Personal
// login identifiers (email / social identity) are intentionally NOT persisted here.
// The chain remains authoritative and every cached address is re-validated against the
// current factory before the dashboard admits it.

export interface SupabaseMapping {
  walletAddress: string;
  instanceAddress: string;
}

function asMapping(row: {
  wallet_address: string;
  instance_address: string;
}): SupabaseMapping {
  return {
    walletAddress: row.wallet_address,
    instanceAddress: row.instance_address,
  };
}

/** Persist one public wallet→instance mapping. `{ ok: false }` when unset/failing. */
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
        wallet_address: mapping.walletAddress.toLowerCase(),
        instance_address: mapping.instanceAddress.toLowerCase(),
      },
      { onConflict: "instance_address", ignoreDuplicates: false }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Public mappings whose on-chain owner is `walletAddress`. `null` when unconfigured. */
export async function fetchInstancesForWallet(
  walletAddress: string
): Promise<SupabaseMapping[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_instances")
    .select("wallet_address,instance_address")
    .eq("wallet_address", walletAddress.toLowerCase());
  if (error) return null;
  return (data ?? []).map(asMapping);
}

/** Lowercase-normalizes an Ethereum address for column lookups. */
export function normalizeAddress(a: string) {
  return a.toLowerCase();
}

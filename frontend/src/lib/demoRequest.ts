import { supabase } from "./supabase";

export const DEMO_STRATEGIES = ["ARBITRAGE", "REBALANCING", "RISK_REDUCTION"] as const;
export type DemoStrategy = (typeof DEMO_STRATEGIES)[number];

const CLIENT_ID_KEY = "fair-witness:demo-request-client";

export function isDemoStrategy(value: string): value is DemoStrategy {
  return DEMO_STRATEGIES.some((strategy) => strategy === value);
}

function clientId(): string {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

export async function submitDemoRequest(strategy: DemoStrategy): Promise<{ ok: boolean; requestId?: string; error?: string }> {
  if (!supabase) return { ok: false, error: "The public request queue is not configured." };
  const requestId = crypto.randomUUID();
  const { error } = await supabase.from("demo_requests").insert({
    request_id: requestId,
    client_id: clientId(),
    strategy,
  });
  return error ? { ok: false, error: error.message } : { ok: true, requestId };
}

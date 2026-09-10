import { config } from "./config";
import { humanError } from "./humanError";

export async function ensureSponsoredGas(address: string): Promise<void> {
  if (!config.sponsorApiUrl) throw new Error("Onboarding gas sponsorship is not configured on this deployment.");
  const response = await fetch(`${config.sponsorApiUrl}/sponsor-gas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* preserve HTTP fallback */ }
  if (!response.ok) {
    throw new Error(humanError(payload, `Gas sponsorship failed with HTTP ${response.status}.`));
  }
}

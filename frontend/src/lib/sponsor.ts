import { config } from "./config";
import { humanError } from "./humanError";
import type { Signer } from "ethers";

export async function ensureSponsoredGas(signer: Signer): Promise<void> {
  if (!config.sponsorApiUrl) throw new Error("Onboarding gas sponsorship is not configured on this deployment.");
  const address = await signer.getAddress();
  const challengeResponse = await fetch(`${config.sponsorApiUrl}/sponsor-challenge?address=${encodeURIComponent(address)}`);
  if (!challengeResponse.ok) throw new Error(`Gas sponsorship challenge failed with HTTP ${challengeResponse.status}.`);
  const challenge = await challengeResponse.json() as { nonce: string; message: string };
  const signature = await signer.signMessage(challenge.message);
  const response = await fetch(`${config.sponsorApiUrl}/sponsor-gas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, nonce: challenge.nonce, signature }),
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* preserve HTTP fallback */ }
  if (!response.ok) {
    throw new Error(humanError(payload, `Gas sponsorship failed with HTTP ${response.status}.`));
  }
}

import { config } from "./config";
import { MOCK_ENTRIES, mockTreasuryInfo, mockBalance, mockAgentRegistered } from "./mockData";
import { fetchLiveReplayData, fetchTreasuryInfo, fetchNativeBalance as fetchNativeBalanceLive, fetchAgentRegistered } from "./contractReader";
import type { ReplayData, TreasuryInfo } from "./types";

export async function fetchReplayData(
  actionKey: string,
  treasuryAddress: string = config.treasuryAddress
): Promise<ReplayData | null> {
  if (config.demoMode) {
    // Demo mode accepts either the full 32-byte key or the short mock aliases
    // ("0xaa11" etc.) so the sample data is easy to explore without copy-pasting a
    // full hash. The treasury address is irrelevant to which mock entry is shown —
    // mock entries are illustrative, not per-instance.
    const match = Object.entries(MOCK_ENTRIES).find(
      ([alias, data]) => alias === actionKey || data.entry.actionKey === actionKey
    );
    return match ? match[1] : null;
  }
  return fetchLiveReplayData(actionKey, treasuryAddress);
}

/**
 * Reads the immutable guardrails + identity of a treasury instance. Live mode reads
 * them straight from the instance on-chain; demo mode serves the illustrative mock
 * treasuries (mirroring the two real Stage-1 instances). See the honest-limits note in
 * mockData.ts: demo values are illustrative, never presented as chain data.
 */
export async function fetchTreasury(treasuryAddress: string): Promise<TreasuryInfo> {
  if (config.demoMode) {
    return mockTreasuryInfo(treasuryAddress);
  }
  return fetchTreasuryInfo(treasuryAddress);
}

/**
 * Reads the native CTC balance of a treasury instance. Demo mode serves
 * illustrative mock balances so the page is never empty without an RPC.
 */
export async function fetchNativeBalance(address: string): Promise<string> {
  if (config.demoMode) {
    return mockBalance(address);
  }
  return fetchNativeBalanceLive(address);
}

/**
 * Checks if the configured agent submit key is allowlisted on a treasury instance.
 * Demo mode returns the known mock state; live mode queries the contract directly.
 */
export async function fetchAgentStatus(treasuryAddress: string): Promise<boolean> {
  if (config.demoMode) {
    return mockAgentRegistered(treasuryAddress);
  }
  if (!config.agentSubmitAddress) return false;
  return fetchAgentRegistered(treasuryAddress, config.agentSubmitAddress);
}

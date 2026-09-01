import { config } from "./config";
import { MOCK_ENTRIES, mockTreasuryInfo } from "./mockData";
import { fetchLiveReplayData, fetchTreasuryInfo } from "./contractReader";
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

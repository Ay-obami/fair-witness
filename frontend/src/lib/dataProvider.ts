import { config } from "./config";
import { MOCK_ENTRIES } from "./mockData";
import { fetchLiveReplayData } from "./contractReader";
import type { ReplayData } from "./types";

export async function fetchReplayData(actionKey: string): Promise<ReplayData | null> {
  if (config.demoMode) {
    // Demo mode accepts either the full 32-byte key or the short mock aliases
    // ("0xaa11" etc.) so the sample data is easy to explore without copy-pasting a
    // full hash.
    const match = Object.entries(MOCK_ENTRIES).find(
      ([alias, data]) => alias === actionKey || data.entry.actionKey === actionKey
    );
    return match ? match[1] : null;
  }
  return fetchLiveReplayData(actionKey);
}

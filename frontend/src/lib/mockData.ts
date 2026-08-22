import { ActionType, type ReplayData } from "./types";

// Sample data illustrating three real scenarios this UI needs to make legible:
// 1. A normal, hash-verified execution (the common case).
// 2. A tampered reasoning payload — demonstrates the mismatch detector actually catching
//    something, not just always printing a green checkmark.
// 3. A journal entry whose off-chain reasoning was never found locally (demonstrates the
//    honest "can't verify, here's why" state rather than pretending to a match).
//
// These are illustrative, not fetched from any real chain — see dataProvider.ts for how
// this file is swapped out for contractReader.ts in live mode.

export const MOCK_ENTRIES: Record<string, ReplayData> = {
  "0xaa11": {
    entry: {
      actionKey: "0xaa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa1",
      factKey: "0xff19e9ab7685bf0c8875f27f9fd89f94a7175b87f7c7f98d4a2aa1e3aca5452",
      attestedAt: 1755878400,
      actedAt: 1755878400,
      agent: "0xDB9406adBebe07c3D6A8B310f3De1f330769Bb94",
      decisionHash: "0x8f2e1c9a4b7d3e6f0a1c5b8d2e4f6a9c1b3d5e7f9a0c2e4f6a8b0d2e4f6a8b0d",
      actionType: ActionType.ARBITRAGE,
      tradeSize: "2031250",
      srcPrice: "1005000",
      confPrice: "1010000",
      arbWidthBps: 130,
      amountOut: "2024500",
    },
    reasoning: {
      observedGapBps: 130,
      sourcePrice: "1005000",
      confirmPrice: "1010000",
      destPrice: "997000",
      rule: "R-ARB-1",
      llmRationale:
        "Gap of 130bps between confirmed source price and destination DEX quote exceeds the 80bps floor and the 100bps drift between the two proofs is well within tolerance. Recommend acting.",
      timestamp: "2026-08-22T14:40:00.000Z",
    },
    hashMatches: true,
    sepoliaExplorerFactHint: "Independently verifiable: Sepolia block containing the PriceObserved event this factKey commits to.",
  },
  "0xbb22": {
    entry: {
      actionKey: "0xbb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb2",
      factKey: "0x579d92fdb02c658f3b9dc010bfb9e9bda424bc052c07c9164987a9ba73740ea",
      attestedAt: 1755882000,
      actedAt: 1755882000,
      agent: "0xDB9406adBebe07c3D6A8B310f3De1f330769Bb94",
      decisionHash: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      actionType: ActionType.ARBITRAGE,
      tradeSize: "1875000",
      srcPrice: "998200",
      confPrice: "999100",
      arbWidthBps: 92,
      amountOut: "1868900",
    },
    reasoning: {
      // Deliberately does NOT match what decisionHash actually commits to — simulates
      // someone editing the stored reasoning after the fact. The UI must catch this,
      // not silently show a false checkmark.
      observedGapBps: 92,
      sourcePrice: "998200",
      confirmPrice: "999100",
      destPrice: "990000",
      rule: "R-ARB-1",
      llmRationale: "(edited) Gap sufficient, recommend acting — reasoning altered after the on-chain commitment for demo purposes.",
      timestamp: "2026-08-22T15:00:00.000Z",
    },
    hashMatches: false,
    sepoliaExplorerFactHint: "Independently verifiable: Sepolia block containing the PriceObserved event this factKey commits to.",
  },
  "0xcc33": {
    entry: {
      actionKey: "0xcc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc3",
      factKey: "0x2a4c6e8f0b1d3f5a7c9e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a",
      attestedAt: 1755885600,
      actedAt: 1755885600,
      agent: "0xDB9406adBebe07c3D6A8B310f3De1f330769Bb94",
      decisionHash: "0x9f8e7d6c5b4a3928170615243342516071869a5b4c3d2e1f0a9b8c7d6e5f4a3",
      actionType: ActionType.ARBITRAGE,
      tradeSize: "3120000",
      srcPrice: "1012500",
      confPrice: "1015800",
      arbWidthBps: 148,
      amountOut: "3098200",
    },
    reasoning: null, // simulates a reasoning payload that couldn't be retrieved locally
    hashMatches: null,
    sepoliaExplorerFactHint: "Independently verifiable: Sepolia block containing the PriceObserved event this factKey commits to.",
  },
};

export const MOCK_ACTION_KEYS = Object.keys(MOCK_ENTRIES);

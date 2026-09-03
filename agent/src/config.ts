import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  sepoliaRpcUrl: requireEnv("SEPOLIA_RPC_URL"),
  // Optional comma-separated backup endpoints (same public read-only role). Sepolia public
  // RPCs degrade in waves (reads AND writes) — observed repeatedly on 2026-09-02 — so every
  // Sepolia read tries these in order and pins the last one that worked. When unset the
  // watcher simply uses SEPOLIA_RPC_URL alone.
  sepoliaRpcUrls: (process.env.SEPOLIA_RPC_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
  priceContractAddress: requireEnv("PRICE_CONTRACT_ADDRESS"),

  creditcoinRpcUrl: requireEnv("CREDITCOIN_RPC_URL"),
  proofBuilderUrl: requireEnv("CREDITCOIN_PROOF_BUILDER_URL"),
  treasuryAddress: process.env.TREASURY_ADDRESS || "", // Optional when using FACTORY_ADDRESS + TENANT_ID
  factoryAddress: process.env.FACTORY_ADDRESS, // Optional: enables multi-tenant factory support
  agentSubmitPrivateKey: requireEnv("AGENT_SUBMIT_PRIVATE_KEY"),

  sourceChainKey: Number(process.env.SOURCE_CHAIN_KEY ?? "1"),

  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",

  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? "30000"),
  // Pre-flight-only filter to avoid wasting a proof-generation round trip on an obviously
  // too-narrow gap. The contract's MIN_ARB_WIDTH_BPS is the real, authoritative bound —
  // this local estimate exists purely to save latency/cost, never to replace it.
  minArbWidthBpsLocalEstimate: Number(process.env.MIN_ARB_WIDTH_BPS_LOCAL_ESTIMATE ?? "80"),
  confirmGapTargetBlocks: Number(process.env.CONFIRM_GAP_TARGET_BLOCKS ?? "3"),
} as const;

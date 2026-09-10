import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function requireFrozenSourceChain(): number {
  const configured = Number(process.env.SOURCE_CHAIN_KEY ?? "3");
  if (configured !== 3) {
    throw new Error(
      `SOURCE_CHAIN_KEY must be 3 (Ethereum mainnet) for the frozen market path; received ${configured}`
    );
  }
  return configured;
}

export const config = {
  ethereumRpcUrl: requireEnv("ETHEREUM_RPC_URL"),
  // Optional comma-separated Ethereum-mainnet read endpoints. Every source read validates
  // the immutable observer event rather than accepting a caller-supplied price.
  ethereumRpcUrls: [
    requireEnv("ETHEREUM_RPC_URL"),
    ...(process.env.ETHEREUM_RPC_URLS ?? "").split(","),
  ].map((u) => u.trim()).filter((u, index, all) => Boolean(u) && all.indexOf(u) === index),
  marketObserverAddress: requireEnv("MARKET_OBSERVER_ADDRESS"),

  creditcoinRpcUrl: requireEnv("CREDITCOIN_RPC_URL"),
  proofBuilderUrl: requireEnv("CREDITCOIN_PROOF_BUILDER_URL"),
  treasuryAddress: process.env.TREASURY_ADDRESS || "", // Optional when using FACTORY_ADDRESS + TENANT_ID
  factoryAddress: process.env.FACTORY_ADDRESS, // Optional: enables multi-tenant factory support
  agentSubmitPrivateKey: requireEnv("AGENT_SUBMIT_PRIVATE_KEY"),

  sourceChainKey: requireFrozenSourceChain(),

  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",

  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? "30000"),
  // Pre-flight-only filter to avoid wasting a proof-generation round trip on an obviously
  // too-narrow gap. The contract's MIN_ARB_WIDTH_BPS is the real, authoritative bound —
  // this local estimate exists purely to save latency/cost, never to replace it.
  minArbWidthBpsLocalEstimate: Number(process.env.MIN_ARB_WIDTH_BPS_LOCAL_ESTIMATE ?? "80"),
  confirmGapTargetBlocks: Number(process.env.CONFIRM_GAP_TARGET_BLOCKS ?? "3"),
} as const;

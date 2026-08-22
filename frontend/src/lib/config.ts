export const config = {
  // When true (the default in this sandbox-built repo, since there's no live RPC to
  // point at), the app serves illustrative mock data instead of reading a real chain.
  // Set VITE_DEMO_MODE=false and fill in the vars below to point at a real deployment.
  demoMode: import.meta.env.VITE_DEMO_MODE !== "false",

  creditcoinRpcUrl: import.meta.env.VITE_CREDITCOIN_RPC_URL ?? "",
  treasuryAddress: import.meta.env.VITE_TREASURY_ADDRESS ?? "",
  // Reasoning payloads are read from wherever the agent published them. This demo's
  // agent runner uses a local file store (agent/src/reasoningStore.ts) which isn't
  // reachable from a browser — a real deployment needs this pointed at something
  // fetchable (IPFS gateway, a small API, etc.). See docs/DEPLOYMENT.md.
  reasoningApiUrl: import.meta.env.VITE_REASONING_API_URL ?? "",
} as const;

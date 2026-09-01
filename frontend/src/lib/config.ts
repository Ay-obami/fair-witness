export const config = {
  // When true (the default in this sandbox-built repo, since there's no live RPC to
  // point at), the app serves illustrative mock data instead of reading a real chain.
  // Set VITE_DEMO_MODE=false and fill in the vars below to point at a real deployment.
  demoMode: import.meta.env.VITE_DEMO_MODE !== "false",

  creditcoinRpcUrl: import.meta.env.VITE_CREDITCOIN_RPC_URL ?? "",
  // The DEFAULT treasury instance to query. In the V2 multi-tenant shape, instances are
  // independent — the viewer can point at ANY factory-deployed instance (see the
  // instance switcher in TenantPanel), and each instance's immutable guardrails are read
  // live from the instance itself, so this value is only a starting default.
  treasuryAddress: import.meta.env.VITE_TREASURY_ADDRESS ?? "",
  // The permissionless factory that deployed the instances. Display-only for now: the
  // factory holds the canonical chain config but deliberately keeps NO tenant registry,
  // so instances can't be enumerated from it — an instance address must be supplied
  // (e.g. from the deploy manifest or Blockscout) to view that tenant.
  factoryAddress: import.meta.env.VITE_FACTORY_ADDRESS ?? "",
  // Reasoning payloads are read from wherever the agent published them. This demo's
  // agent runner uses a local file store (agent/src/reasoningStore.ts) which isn't
  // reachable from a browser — a real deployment needs this pointed at something
  // fetchable (IPFS gateway, a small API, etc.). See docs/DEPLOYMENT.md.
  reasoningApiUrl: import.meta.env.VITE_REASONING_API_URL ?? "",
} as const;

export const config = {
  demoMode: import.meta.env.VITE_DEMO_MODE === "true",
  creditcoinRpcUrl: import.meta.env.VITE_CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network",
  treasuryAddress: import.meta.env.VITE_TREASURY_ADDRESS ?? "0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3",
  factoryAddress: import.meta.env.VITE_FACTORY_ADDRESS ?? "0x494490bBF748e59a659227F46510535BF3818442",
  agentSubmitAddress: import.meta.env.VITE_AGENT_SUBMIT_ADDRESS ?? "0xB1D19F71d68c4e7065749e8593D338E9A30D654f",
  faucetAddress: import.meta.env.VITE_DEMO_FAUCET_ADDRESS ?? "0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A",
  sponsorApiUrl: (import.meta.env.VITE_SPONSOR_API_URL ?? "").replace(/\/$/, ""),
  reasoningApiUrl: import.meta.env.VITE_REASONING_API_URL ?? "",
  explorerBaseUrl: import.meta.env.VITE_EXPLORER_BASE_URL ?? "https://creditcoin-testnet.blockscout.com",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
} as const;

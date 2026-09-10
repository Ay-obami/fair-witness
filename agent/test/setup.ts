// Vitest setup — runs in each worker BEFORE any test module is imported.
// Mirrors the production path (src/config.ts does `import "dotenv/config"`
// under tsx/node, where dotenv auto-discovers ../agent/.env). Here we load it
// explicitly so SEPOLIA_RPC_URL / PRICE_CONTRACT_ADDRESS etc. are present on
// process.env before the module graph pulls in config.ts.
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({
  path: resolve(import.meta.dirname, "../.env"),
  override: true,
});

// Unit tests inject endpoint stubs and never dial these values. Keep the new production
// configuration mandatory while making legacy local .env files irrelevant to test import.
process.env.ETHEREUM_RPC_URL ??= "http://127.0.0.1:8545";
process.env.MARKET_OBSERVER_ADDRESS ??= "0x0000000000000000000000000000000000000001";
process.env.SOURCE_CHAIN_KEY = "3";

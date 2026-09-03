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

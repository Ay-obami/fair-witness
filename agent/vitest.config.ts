import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // src/config.ts reads SEPOLIA_RPC_URL etc. via requireEnv() at import time.
    // In production (tsx/node) `import "dotenv/config"` auto-loads ./agent/.env.
    // Under vitest each test file runs in an isolated worker where that
    // auto-discovery is unreliable, so we load .env explicitly in setup — a
    // dev-only mirror of the production path.
    setupFiles: [resolve(import.meta.dirname, "test/setup.ts")],
  },
});



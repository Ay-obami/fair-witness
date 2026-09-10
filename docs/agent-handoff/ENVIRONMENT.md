# Environment Reference (2026-09-07)

> **Sepolia-only target change (2026-09-08):** The selected future runtime must use
> `SEPOLIA_RPC_URL`, optional `SEPOLIA_RPC_URLS`, and `SOURCE_CHAIN_KEY=1`, and must
> verify actual chain ID 11155111. The `ETHEREUM_*`, key 3, and chain ID 1 Phase 2
> settings are historical and must not be deployed. Exact source pool/observer values
> remain unset until Phase 1 is re-frozen.

> **Phase 4 readiness variables (2026-09-08):** The read-only audit accepts
> `ETHEREUM_RPC_URL`, optional `ETHEREUM_RPC_URLS`, `CC_RPC`, optional `CC_RPC_URLS`,
> and address-only `ETHEREUM_DEPLOYER_ADDRESS`, `CC_DEPLOYER_ADDRESS`,
> `TENANT_OWNER_ADDRESS`, `AGENT_ADDRESS`. It never accepts keys, signs, or broadcasts.
> No Ethereum deployer is currently configured; the existing `agent/.env` still uses
> legacy Sepolia names and is not ready for the new path.

> **Phase 2 environment change (2026-09-08):** The selected new source runtime uses
> `ETHEREUM_RPC_URL`, optional `ETHEREUM_RPC_URLS`,
> `MARKET_OBSERVER_ADDRESS`, and `SOURCE_CHAIN_KEY=3`. The watcher verifies the
> RPC's actual chain ID is 1; config rejects any other source chain key. Historical
> `SEPOLIA_*` and `PRICE_CONTRACT_ADDRESS` values below apply only to the legacy
> deployment and must not be used for the new path.

> **Repair notice (2026-09-07):** Node v22.23.2, npm 10.9.8 and forge 1.5.1-stable checked locally. Service connectivity and secrets not verified. Supabase reasoning claim conflicts with file-only source. Remaining environment claims are historical. See REPAIR_AUDIT.md.

## Toolchain (VERIFIED this session)

| Tool | Version |
| --- | --- |
| forge | 1.5.1-stable |
| node | v22.23.2 |
| npm | 10.9.8 |
| tsc (frontend) | 6.0.3 |
| ethers (agent) | 6.17.0 |
| AI runtime | `@google/genai`, model `gemini-flash-latest` (2.5-flash unavailable to new keys) |

## Network endpoints (VERIFIED reachable this session)

| Endpoint | Use |
| --- | --- |
| `https://rpc.cc3-testnet.creditcoin.network` | Creditcoin RPC. chainId 102031. **Flaky**: 10s query-timeout on wide `eth_getLogs`; intermittent `-32600` bursts. Pin `staticNetwork: true` with ethers (deploy script precedent). |
| `https://prover.cc3-testnet.creditcoin.network/` | Attestcoin proof builder (agent `.env`: `CREDITCOIN_PROOF_BUILDER_URL`) |
| `https://creditcoin-testnet.blockscout.com/api?module=…` | Explorer API — tx lists by address, receipts, contract lookups. Reliable fallback when RPC scanning fails. |
| `https://ethereum-sepolia-rpc.publicnode.com` | primary Sepolia RPC (chainId 11155111) |
| `https://1rpc.io/sepolia`, `https://gateway.tenderly.co/public/sepolia` | backup Sepolia reads (`SEPOLIA_RPC_URLS`, tried in order) |

## Environment variables (names + purpose only — never commit values)

### agent/ (see `agent/.env.example`; live `agent/.env` exists, gitignored)
`SEPOLIA_RPC_URL`, `SEPOLIA_RPC_URLS` — source reads;
`PRICE_CONTRACT_ADDRESS` — Sepolia PriceObservation;
`CREDITCOIN_RPC_URL`, `CREDITCOIN_PROOF_BUILDER_URL` — destination + prover;
`TREASURY_ADDRESS` (default instance), `FACTORY_ADDRESS`, `TENANT_ID` (set to the
tenant owner address `0xd1D4…` — naming quirk, see KNOWN_ISSUES #11);
`AGENT_SUBMIT_PRIVATE_KEY` (rotated 2026-09-03); `SOURCE_CHAIN_KEY=1`;
`GEMINI_API_KEY` (rotated 2026-09-03), `GEMINI_MODEL=gemini-flash-latest`;
`POLL_INTERVAL_MS=30000`, `MIN_ARB_WIDTH_BPS_LOCAL_ESTIMATE=80` (pre-flight filter
only — the contract enforces the real bound), `CONFIRM_GAP_TARGET_BLOCKS=3`.
Per-tenant overrides live in gitignored `agent/.env.tenant-a` / `.env.tenant-b`;
the tenant registry is `agent/tenants.json`.

### frontend/ (see `frontend/.env.example`; live `.env` + `.env.local` exist)
`VITE_DEMO_MODE=false` (live mode), `VITE_CREDITCOIN_RPC_URL`,
`VITE_TREASURY_ADDRESS` (Tenant A default), `VITE_FACTORY_ADDRESS`,
`VITE_REASONING_API_URL` (empty — reasoning store not served over HTTP yet),
`VITE_THIRDWEB_CLIENT_ID` (public), `VITE_EXPLORER_BASE_URL=https://creditcoin-testnet.blockscout.com`,
`VITE_AGENT_SUBMIT_ADDRESS` (current submitter `0xB1D1…654f`),
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable only; auth↔address
mapping migration in `frontend/supabase/migrations/`).
`frontend/.env.local` holds a Vercel OIDC token (created by Vercel CLI; local only).

### contracts/script
`DEPLOYER_PK`, `USER_A_PK`, `USER_B_PK` — deploy runbooks; gitignored
`.stage-tenants.env` holds testnet-only demo keys (marked worthless on purpose).
Optional overrides: `VERIFIER_ADDRESS`, `DEX_ROUTER_ADDRESS`, `BASE_ASSET_ADDRESS`,
`QUOTE_ASSET_ADDRESS`, `PRICE_CONTRACT_ADDRESS`, `CC_RPC`, `FACTORY_ADDRESS`,
`FROM_BLOCK`, `OUT_FILE` (index-tenants.js).

## Third-party services in use

| Service | Role |
| --- | --- |
| Vercel | frontend hosting — https://fair-witness.vercel.app (CLI-deployed; Git integration pending) |
| Thirdweb | embedded wallets for tenant sign-up through the factory |
| Supabase | Stage 4b/4c auth↔address mapping (anon key only) + agent reasoning store (service key, server-side only) |
| Google AI Studio | Gemini API key |
| Creditcoin prover + Blockscout | proof generation + chain exploration |

## Local secrets hygiene

- `agent/.env`, `agent/.env.tenant-*`, `frontend/.env*`, `contracts/script/.stage-tenants.env`
  are all gitignored. Do not print their values into docs or logs. Two historical
  leaks are already documented (rotated 2026-09-03 — DECISIONS #12).

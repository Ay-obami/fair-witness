# Deployment and Operations

This document describes the current schema-v1 Fair Witness release. It is intentionally limited to information needed to build, deploy and verify the frontend and agent service. Contract addresses come from the canonical lifecycle manifest rather than from copied historical notes.

## Canonical public-testnet deployment

Source of truth: `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`.

| Component | Value |
|---|---|
| Creditcoin chain ID | `102031` |
| Creditcoin RPC | `https://rpc.cc3-testnet.creditcoin.network` |
| Attestcoin proof builder | `https://prover.cc3-testnet.creditcoin.network/` |
| Factory | `0x494490bBF748e59a659227F46510535BF3818442` |
| Factory deployment block | `5465730` |
| Controlled faucet/reserve | `0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A` |
| Validator | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| Destination adapter | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia observer | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia source pool | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |

Historical factories/receipts may remain in manifests as evidence. Do not configure new product deployments from them.

## Build verification

Requirements: Node.js 22+ and Foundry.

```bash
# contracts
cd contracts
./install-deps.sh
forge test -vvv
forge build --sizes

# agent
cd ../agent
npm ci
npm test
npm run build

# frontend
cd ../frontend
npm ci
npm test
npm run lint
npm run build

# release references
cd ..
npm run check:release
```

CI additionally checks the current deployed treasury creation-code hash/size against the canonical lifecycle manifest and rejects stale committed client ABIs.

## Frontend deployment

The frontend is a Vite/React SPA. Copy `frontend/.env.example` into your deployment provider's environment configuration and supply the non-secret public settings for the target environment.

Important production settings include the current factory/deployment block, demo faucet, Thirdweb client ID, Supabase public URL/key where enabled, and the sponsor/agent-health API URL.

The production application is hosted at:

```text
https://fair-witness.vercel.app/
```

Ensure SPA rewrites continue to serve deep routes such as `/dashboard`, `/activity`, `/decision/:treasury/:attemptId`, `/safeguards` and `/verify`.

Do not put private keys or Supabase service-role credentials in any `VITE_*` variable. Everything prefixed with `VITE_` is browser-visible.

## Agent deployment

The agent is the long-running schema-v1 runner and sponsor/health service. Start it using the scripts in `agent/package.json`; the deployment should use `agent/.env.example` as the variable checklist.

Private server-side values include:

- proposal submit private key;
- Sepolia observer private key;
- gas sponsor private key;
- reasoning-provider API key;
- Supabase service-role key when the audit projection is enabled.

Public configuration includes RPC URLs, chain IDs, observer/pool addresses, factory/deployment block, adapter address, poll interval and proof-builder URL.

The dashboard's live pipeline requires the frontend and agent service to be deployed from compatible revisions. The agent `/health` response includes non-sensitive `treasuryPipelines` telemetry; it must not expose secrets or private model payloads.

For browser access to the health/sponsor service, restrict CORS to the intended frontend origins. Do not replace the production allow-list with `*` merely to make preview deployments convenient.

## Supabase

Supabase is not an authorization layer. On-chain factory events, treasury ownership and treasury policy remain authoritative.

The public `user_instances` projection is intentionally limited to public chain relationships:

```text
id
wallet_address
instance_address
created_at
```

It must not contain login email/social identity. RLS remains enabled. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to the frontend.

For richer audit indexing, see [`AUDIT_DATA_DICTIONARY.md`](AUDIT_DATA_DICTIONARY.md) and the migrations under `frontend/supabase/migrations/`.

## Contract release rule

No contract redeployment is required for frontend styling, documentation, or agent observability changes that do not modify deployed bytecode/constructor commitments.

If Solidity changes affect the current lifecycle contracts:

1. run the full Foundry suite;
2. regenerate committed ABIs;
3. deploy intentionally;
4. write the new canonical manifest;
5. update frontend/agent configuration;
6. update README/runbook/deployment references;
7. run `npm run check:release` and CI;
8. independently verify the deployed bytecode/config before describing the release as current.

Never silently point the app at a new factory while documentation or runner configuration still references the old one.

## Post-deploy smoke

After deploying both frontend and agent:

1. Open `/`, `/mandate`, `/dashboard`, `/activity`, `/safeguards` and `/verify` on desktop and mobile.
2. Confirm the agent health endpoint is reachable from the production origin.
3. Confirm an eligible treasury's dashboard moves through real Observe → Prove → Reason → Authorize → Execute telemetry during a cycle.
4. Confirm paused and closed treasuries do not execute.
5. Confirm Activity reads the schema-v1 journal and Decision Detail opens the matching attempt.
6. Confirm Verify can locate the same treasury/attempt independently.
7. Run a fail-closed case and verify a rejected preflight does not broadcast an execution transaction.
8. Re-run `npm run check:release` against the deployed revision.

## Secrets

Never commit private `.env` files, private keys, API keys, OTPs or service-role credentials. Treat a secret pasted into an untrusted channel or shell history as compromised and rotate it.

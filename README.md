# Fair Witness

[![CI](https://github.com/Ay-obami/fair-witness/actions/workflows/ci.yml/badge.svg)](https://github.com/Ay-obami/fair-witness/actions/workflows/ci.yml)

**Fair Witness is an Attestcoin-powered, non-custodial execution boundary for autonomous financial agents on Creditcoin.**

> **AI proposes. Deterministic policy authorizes. Treasury executes.**

Fair Witness lets an autonomous financial agent reason over cross-chain market information without giving that AI custody or unrestricted transaction authority. The agent can recommend `EXECUTE` or `WAIT`, but every action is independently constrained by a user-owned `FairWitnessTreasury` that verifies Attestcoin evidence, current market state, portfolio state, replay state, policy limits, asset/venue restrictions and the maximum permitted action size before capital can move.

## Product flow

```text
Google / Apple / email account
        ↓
Thirdweb embedded owner wallet
        ↓
User-defined immutable treasury mandate
        ↓
FairWitnessTreasuryFactory.createTreasury()
        ↓
User-owned schema-v1 treasury (starts PAUSED)
        ↓
Controlled demo funding + bounded agent authorization
        ↓
Owner enables AUTONOMOUS mode
        ↓
Factory-discovered Fair Witness runner
        ↓
Source observation → Attestcoin proofs → deterministic strategy candidate
        ↓
AI EXECUTE / WAIT
        ↓
Typed proposal
        ↓
Treasury independently re-verifies and either rejects or executes
        ↓
Append-only on-chain attempt journal
```

The closed strategy set has deterministic priority:

1. **Risk Reduction** — reduce WCTC exposure above the configured ceiling.
2. **Rebalancing** — move the two-asset portfolio toward its configured target when outside tolerance.
3. **Arbitrage** — act on a verified cross-market discrepancy when the net edge clears policy.

The AI cannot reorder that priority or invent an arbitrary transaction.

## Security boundary

The AI cannot:

- hold treasury funds or owner keys;
- choose arbitrary assets, venues, routes, recipients or calldata;
- mutate the user's mandate;
- choose an amount above the deterministic policy ceiling;
- bypass Attestcoin proof verification;
- reuse consumed evidence;
- unpause a treasury;
- bypass execution-rate, freshness, drift, liquidity or slippage limits.

The treasury validates schema, commitments, automation state, enabled strategy, fixed asset pair, immutable venue, deadline, slippage, policy hash, proposal replay, agent nonce replay, evidence replay, Attestcoin evidence, market quality, portfolio state, maximum permitted sizing, balances and execution-rate limits before calling the fixed adapter.

`FairWitnessTreasury` intentionally uses a **maximum permitted amount**, not a brittle exact-amount equality. The agent may submit a conservative amount below the ceiling, while oversized proposals are rejected on-chain.

## Attestcoin integration

Attestcoin is part of authorization, not presentation. The Sepolia observer derives a fixed 300-second V3 TWAP and emits an observation from one immutable controlled source pool. The agent waits for attestation availability and builds the inclusion proofs. On Creditcoin, `VerifiedMarketFactValidator` independently verifies proof inclusion, source identity, transaction index, event semantics, confirmation ordering and proof freshness.

The decoder additionally requires the proven transaction to call the immutable observer's zero-argument `observe()` function, requires a successful receipt, accepts exactly one matching observation event from the expected observer/pool, checks the fixed TWAP window and liquidity, and recomputes the price from the proven mean tick.

An API or database value saying `verified: true` can never replace this path.

## Controlled public-testnet deployment

> **Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.**

The canonical current deployment source is:

`contracts/deployments/controlled-demo-schema-v1-lifecycle.json`

Current lifecycle generation:

| Component | Network | Address |
|---|---|---|
| Market observer | Sepolia | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Controlled source V3 pool | Sepolia | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |
| Fixed Penguin adapter | Creditcoin CC3 | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Attestcoin validator | Creditcoin CC3 | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| **Current treasury factory** | Creditcoin CC3 | `0x494490bBF748e59a659227F46510535BF3818442` |
| Current factory deployment block | Creditcoin CC3 | `5465730` |
| Controlled demo faucet / recycle reserve | Creditcoin CC3 | `0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A` |

The lifecycle factory creates treasuries with pause/resume, production withdrawals, permanent close, and controlled-demo recycling semantics. New product treasuries must be created from this factory generation.

### Historical evidence generation

`contracts/deployments/controlled-demo-schema-v1.json` records the earlier schema-v1 generation used to produce the public strategy evidence below. Those contracts and receipts remain valid historical evidence, but that factory is **not** the current product factory and should not be used for new treasuries.

Public receipts:

- Risk Reduction execution: `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4`
- Rebalancing execution: `0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f`
- Arbitrage execution: `0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39`
- Oversized Risk Reduction rejection: `0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc`

The rejection is intentional evidence of the security model: a mistaken or malicious proposal can be journaled and rejected without moving protected capital.

## Demo product behavior

The browser session is account-centric: a signed-in Google, Apple or email identity reuses its embedded owner wallet and can create multiple treasuries without signing up again. Each treasury remains an independent on-chain contract with its own mandate, balances, agent state, journal and lifecycle controls.

The controlled faucet funds only factory-created treasuries and each treasury can claim once. The public factory itself is permissionless, so the faucet is intentionally treated as finite demo inventory rather than a production entitlement system. Keep the reserve deliberately small and refill it manually for demonstrations.

Demo treasuries cannot directly withdraw the controlled fwWCTC/fwUSD assets. Permanent close pauses the treasury and recycles its remaining controlled assets to the configured demo reserve. Production-mode treasuries instead return supported assets to the owner.

## Repository layout

```text
contracts/  Foundry contracts, tests, deployment manifests and controlled demo infrastructure
agent/      schema-v1 runner, deterministic strategies, Attestcoin client and audit projection
frontend/   React account flow, mandate deployment, activation, dashboard and evidence UI
docs/       architecture, deployment evidence, runbooks, release notes and handoffs
scripts/    release consistency checks
```

## Quickstart

```bash
cd contracts
./install-deps.sh
forge test
forge build --sizes

cd ../agent
npm ci
npm test
npm run build

cd ../frontend
npm ci
npm test
npm run lint
npm run build

cd ..
node scripts/check-release-consistency.mjs
```

Production-shaped agent runtime:

```bash
cd agent
cp .env.example .env
# Configure private values locally. Never commit or paste real private keys.
npm run dev
```

Frontend environment is documented in `frontend/.env.example`. `VITE_THIRDWEB_CLIENT_ID` and the Supabase anon key are public client values; private signing/service keys must never use a `VITE_` prefix.

## Current limitations

- The controlled markets prove execution containment and Attestcoin verification, not natural market profitability.
- The demo faucet is intentionally finite and is not Sybil-resistant; it is appropriate for the hackathon demo, not public production distribution.
- The current runner is a single-worker hackathon service rather than a durable distributed execution queue.
- Public RPC, Attestcoin prover and model latency can interrupt a cycle. The treasury fails closed when evidence or market validation cannot be completed.
- The current source/destination markets are controlled. A production deployment would require substantially stronger economic-oracle assumptions in addition to cryptographic proof authenticity.

## Authoritative documentation

- `contracts/deployments/controlled-demo-schema-v1-lifecycle.json` — **current release/deployment source of truth**
- `docs/architecture/ARCHITECTURE_LOCK.md`
- `docs/CONTROLLED_DEMO_RUNBOOK.md`
- `docs/PRE_SUBMISSION_CHECKLIST.md`
- `contracts/deployments/controlled-demo-schema-v1.json` — historical schema-v1 evidence generation

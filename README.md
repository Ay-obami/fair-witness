# Fair Witness

[![CI](https://github.com/Ay-obami/fair-witness/actions/workflows/ci.yml/badge.svg)](https://github.com/Ay-obami/fair-witness/actions/workflows/ci.yml)

**Fair Witness is an Attestcoin-powered, non-custodial execution boundary for autonomous financial agents on Creditcoin.**

> **AI proposes. Deterministic policy authorizes. Treasury executes.**

An agent observes cross-chain market information, builds genuine Attestcoin proofs, evaluates a closed strategy set, and asks an AI only whether to `EXECUTE` or `WAIT`. The AI never owns treasury funds and never chooses arbitrary calldata, assets, venues, recipients, route, amount, policy, or replay state. A user-owned `FairWitnessTreasury` independently verifies the evidence and recomputes the policy-bounded action before execution.

## Product flow

```text
Email / embedded wallet
        ↓
Immutable mandate
        ↓
FairWitnessTreasuryFactory.createTreasury()
        ↓
User-owned schema-v1 treasury (starts PAUSED)
        ↓
Owner authorizes bounded Fair Witness agent
        ↓
Controlled test assets funded directly to treasury
        ↓
Owner enables AUTONOMOUS mode
        ↓
Factory-discovered continuous agent service
        ↓
Source observation → Attestcoin proofs → deterministic strategy candidate
        ↓
AI EXECUTE / WAIT
        ↓
Typed ProposalBuilder
        ↓
Treasury policy → reject or execute → on-chain attempt journal
```

The schema-v1 system supports exactly three strategies, with deterministic priority:

1. **Risk Reduction** — reduce WCTC exposure above an immutable ceiling.
2. **Rebalancing** — restore the two-asset portfolio toward a constructor-set target outside tolerance.
3. **Arbitrage** — reference strategy for verified cross-market price discrepancies.

It is not a generic trading terminal, bridge, hedge fund, HFT/MEV system, or unrestricted autonomous wallet.

## Attestcoin integration

Fair Witness uses Attestcoin as a core authorization input rather than a display oracle. The source-chain market observer emits pool-derived observations; the agent waits for Attestcoin availability, builds inclusion proofs, and locally verifies them. On Creditcoin, `VerifiedMarketFactValidator` independently verifies proof inclusion, source identity, event semantics and freshness before the treasury can authorize a proposal.

An API or database row saying `verified: true` cannot substitute for the proof path.

## Controlled public-testnet deployment

> **Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.**

| Component | Network | Address |
|---|---|---|
| Market observer | Sepolia | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Controlled V3 pool | Sepolia | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |
| Fixed Penguin adapter | Creditcoin testnet | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Attestcoin validator | Creditcoin testnet | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| Treasury factory | Creditcoin testnet | `0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd` |
| Demonstration treasury | Creditcoin testnet | `0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3` |

No sufficiently active comparable market was available across the supported public testnets, so the V3 markets are intentionally controlled. The **market conditions are synthetic; the source transactions, Attestcoin proofs, Creditcoin verification, deterministic policy checks, treasury execution and replay protection are real public-testnet operations.**

## Public evidence

Public receipts exist for all three strategy branches and an adversarial oversized Risk Reduction rejection:

- Risk Reduction execution: `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4`
- Rebalancing execution: `0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f`
- Arbitrage execution: `0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39`
- Oversized Risk Reduction rejection: `0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc`

The rejection is a first-class product property: a mistaken or malicious AI proposal may be journaled and rejected without moving protected capital.

## Productization status

The schema-v1 product path now includes:

- Thirdweb email/OTP embedded-wallet onboarding;
- a real mandate builder that calls `FairWitnessTreasuryFactory.createTreasury()`;
- per-user treasury ownership and factory-based discovery;
- owner-controlled agent authorization and pause/autonomous mode;
- a schema-v1 dashboard reading policy and balances directly from chain;
- a continuous schema-v1 runner (`agent/src/schemaV1ProductRunner.ts`) that discovers factory treasuries, publishes source observations, builds/verifies Attestcoin proofs, evaluates Risk Reduction → Rebalancing → Arbitrage, asks AI only `EXECUTE`/`WAIT`, builds typed proposals, and submits through `PolicySubmitter`;
- a bounded `ControlledDemoFaucet` contract that can fund only factory-created treasuries once, after it is separately deployed and funded;
- `/evidence` as the protocol-evidence surface rather than the primary product workflow.

The historical arbitrage-only generation remains in the repository for provenance and can be started explicitly with the legacy agent scripts. It is no longer the default agent runtime.

## Security boundary

The AI cannot:

- hold treasury funds or owner keys;
- select arbitrary assets, venues, routes, recipients, targets, or calldata;
- choose execution amount independently of deterministic strategy accounting;
- change strategy priority, policy, allocation targets, risk limits, slippage, freshness or replay rules;
- replace Attestcoin proof verification with an API/database assertion;
- replay an already consumed proposal/evidence path.

The treasury validates schema, commitments, automation state, enabled strategy, asset pair, immutable venue, deadline, slippage, policy hash, proposal replay, nonce replay, evidence replay, genuine Attestcoin evidence, market quality, portfolio state, exact permitted sizing, balance, execution rate and fixed-adapter execution.

## Repository layout

```text
contracts/  Foundry contracts, tests, deployment manifests and controlled test infrastructure
agent/      Schema-v1 continuous runner, strategy/proposal components, Attestcoin client and audit projection
frontend/   React self-service onboarding, mandate deployment, activation, dashboard and evidence UI
docs/       Architecture, deployment evidence, runbooks and phase handoffs
```

## Quickstart

```bash
cd contracts && ./install-deps.sh && forge test && forge build --sizes
cd ../agent && npm ci && npm test && npm run build
cd ../frontend && npm ci && npm test && npm run lint && npm run build
```

Production-shaped agent runtime:

```bash
cd agent
cp .env.example .env
# fill AGENT_SUBMIT_PRIVATE_KEY, SEPOLIA_OBSERVER_PRIVATE_KEY,
# CREDITCOIN_PROOF_BUILDER_URL and GEMINI_API_KEY
npm run dev
```

Frontend environment is documented in `frontend/.env.example`. `VITE_THIRDWEB_CLIENT_ID` is public. Never expose server/private keys through `VITE_` variables.

## Current operational limitations

- Controlled testnet liquidity proves mechanics and containment, not profitability or natural arbitrage.
- `ControlledDemoFaucet` is included in source but still requires a public-testnet deployment and funding before one-click test funding can be enabled with `VITE_DEMO_FAUCET_ADDRESS`.
- Supabase remains an optional, non-authoritative audit/discovery projection; chain state is authoritative.
- Public RPC, Attestcoin prover and model latency can interrupt a cycle. The runner catches tenant/cycle failures and the treasury fails closed.

## Authoritative documentation

- [`docs/architecture/ARCHITECTURE_LOCK.md`](docs/architecture/ARCHITECTURE_LOCK.md)
- [`contracts/deployments/controlled-demo-schema-v1.json`](contracts/deployments/controlled-demo-schema-v1.json)
- [`docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md`](docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md)
- [`docs/CONTROLLED_DEMO_RUNBOOK.md`](docs/CONTROLLED_DEMO_RUNBOOK.md)

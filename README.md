# Fair Witness

[![CI](https://github.com/Ay-obami/fair-witness/actions/workflows/ci.yml/badge.svg)](https://github.com/Ay-obami/fair-witness/actions/workflows/ci.yml)

Fair Witness is a trust-minimized execution boundary for autonomous financial agents.

> AI proposes. Deterministic policy authorizes. Treasury executes.

Attestcoin supplies verifiable cross-chain evidence; an AI may recommend `EXECUTE` or `WAIT`; a deterministic on-chain policy independently checks the action; an ASC treasury holds capital and executes only through one immutable adapter. Accepted, rejected, and execution-failed proposals are journaled for audit and replay.

The schema-v1 system supports exactly three strategies:

1. Arbitrage — a reference strategy for verified price discrepancies.
2. Rebalancing — restore a two-asset portfolio toward its immutable target outside tolerance.
3. Risk Reduction — reduce WCTC exposure above an immutable ceiling.

It is not a generic trading terminal, bridge, hedge fund, HFT/MEV system, or unrestricted autonomous wallet.

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

The treasury owner and registered agent are distinct. The treasury is paused outside supervised rehearsals. Assets and pools are fixed-supply, independently issued testnet demo infrastructure—not bridged, redeemable, or economically pegged assets.

## Evidence actually captured

Phase 10 captured one genuine schema-v1 Attestcoin-backed Risk Reduction execution:

- Sepolia source observation: `0x1c0e67ad9621ec5d23f061d330e1b7b41d69c66646a97358e1be09dfe42e408f`
- Sepolia confirmation: `0xf87e562164ca1f23dea01df67b0f907cd36f9e2b25d49f99133a74f43a906cbb`
- Creditcoin execution: `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4`
- Paused-policy rejection with unchanged capital: `0x6f75c57e0fa3618d25d0562eeab8c3fdf753467421c0303e0bed111f90751eb1`

Public-testnet schema-v1 receipts are now captured for controlled Arbitrage, Rebalancing, valid Risk Reduction, and an oversized Risk Reduction rejection. These demonstrate mechanics and containment only; they do not establish natural arbitrage or profitability. Exact evidence is in the frozen deployment manifest and `/demo`.

## Security boundary

The AI cannot:

- hold treasury funds or owner keys;
- select arbitrary assets, venues, routes, recipients, targets, or calldata;
- change policy, targets, risk limits, slippage, freshness, or replay rules;
- replace Attestcoin proof verification with API/database assertions;
- authoritatively calculate portfolio accounting or execution amounts.

The treasury recomputes the exact permitted direction and amount, validates genuine evidence through immutable Attestcoin precompiles, checks destination TWAP/spot/liquidity, enforces replay/rate/deadline/slippage/strategy limits, and executes atomically through its fixed adapter.

## Repository layout

```text
contracts/  Foundry contracts, tests, deployment manifests and controlled-market scripts
agent/      TypeScript strategy/proposal/audit components and controlled rehearsal scripts
frontend/   React UI, mandate and controlled-demo evidence pages
docs/       Locked architecture, deployment evidence, runbook and phase handoffs
```

The original arbitrage-only deployment remains in the repository as clearly historical legacy evidence. `agent/src/index.ts`, the older sign-up/viewer flow, and several historical documents still target that generation; they must not be pointed at schema-v1 addresses.

## Quickstart

```bash
cd contracts && ./install-deps.sh && forge test
cd ../agent && npm ci && npm test && npm run build
cd ../frontend && npm ci && npm test && npm run lint && npm run build
```

For the controlled demonstration, follow [`docs/CONTROLLED_DEMO_RUNBOOK.md`](docs/CONTROLLED_DEMO_RUNBOOK.md). The machine-readable deployment record is [`contracts/deployments/controlled-demo-schema-v1.json`](contracts/deployments/controlled-demo-schema-v1.json).

## Authoritative documentation

1. [`docs/architecture/ARCHITECTURE_LOCK.md`](docs/architecture/ARCHITECTURE_LOCK.md)
2. [`master_instruction.md`](master_instruction.md)
3. Latest [`docs/handoffs/PHASE_*_HANDOFF.md`](docs/handoffs/)
4. [`docs/architecture/MIGRATION_PLAN.md`](docs/architecture/MIGRATION_PLAN.md)

Historical documents are retained for provenance and carry supersession banners. Current deployment truth is in [`docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md`](docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md).

## Current limitations

- Controlled testnet liquidity proves mechanics, not profitability or natural arbitrage.
- The main continuous agent entrypoint remains legacy; schema-v1 demonstrations use the controlled scripts/runbook.
- Live Supabase migration/indexing awaits project credentials.
- Schema-v1 observer, adapter, validator, factory, and treasury source are verified on the Sepolia/Creditcoin Blockscout explorers. The hosted Vercel build has passed desktop and mobile fresh-browser rehearsals. Live audit-journal projection remains optional operational work.
- Public RPC and Attestcoin proof-builder latency can interrupt a rehearsal; the system fails closed and stays paused.

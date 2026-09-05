# Fair Witness — Current Reality (single source of truth)

_Last verified: 2026-09-05 (Tasks 3.6, 3.7, 3.11, 3.12 — each link verified against the
actual code/env, not copied). If anything here disagrees with a doc in this repo, this
file is the truth until that doc is updated; if a doc says something stronger than this
file, that doc is wrong._

## What this is

A **multi-tenant, custody-free, auditable trade-execution system** on **Creditcoin
testnet**. Each tenant gets their **own deployed `ASCTreasuryJournal`** (via the factory)
with their guardrails baked in as **constructor-set immutables** — the "even the owner
can't loosen this later" guarantee. An **off-chain LLM agent** proposes trades; the
**treasury contract** is the only thing that can move funds and independently enforces
every bound. Every successful execution is journaled on-chain with verifiable evidence;
the core pitch is **"an AI agent that can't lie about why it traded."**

## What is actually deployed and useable right now

| Thing | Current truth | Where it lives |
|---|---|---|
| **Chain / network** | Creditcoin **testnet** (CC3), Sepolia as the source chain | `agent/.env` (`CREDITCOIN_RPC_URL`, `SEPOLIA_RPC_URL`); `contracts/script/.stage-tenants.env` |
| **LLM / decision maker** | **Gemini only** (Google `generativelanguage` GoogleGenAI, `GEMINI_API_KEY`). **No provider-switch exists**; OpenAI/Mistral are a tracked *direction*, not a current option (see "Deliberately not"). | `agent/src/decisionEngine.ts`, `agent/.env` |
| **DEX (destination)** | **`MockDexRouter`** — a self-seeded mock constant-product router. **No PenguinSwap / real AMM** is used anywhere today. | `contracts/src/mocks/MockDexRouter.sol`; `contracts/script/deploy-factory.js` |
| **Assets** | **`MockERC20`** (creditcoin-side USDC-like + quote token), testnet-only, no value | `contracts/src/mocks/MockERC20.sol` |
| **Source price** | A **permissionless, demo-controlled** `PriceObservation.observePrice(uint256)` on Sepolia — **not a live market oracle**. Attestcoin proves the *observation happened*, not that the price was *real*. | `contracts/src/source-chain/PriceObservation.sol` |
| **Frontend mode** | **Live mode** (`VITE_DEMO_MODE=false`) on the deployed bundles — reads real CC3 chain data (guardrails, journal). Some built-in demo/mock data still exists for offline dev. | `frontend/.env`, `frontend/src/lib/config.ts` |
| **Hosting** | Live at **`https://fair-witness.vercel.app`** and **`https://ay-obami.github.io/fair-witness/`** | `frontend/` |

## Live instances

- Factory: `0x97c81D68BbCDb1A673b61176d60F071963Abe7f2`
- Tenant A: `0x13CACe3989b295048De47C68F32Ff3d844AC2026` (owner `0xd1D4…1C77`)
- Tenant B: `0xD66C607072df7dB98A75aEe81fCA4089462c60aB` (owner `0xa3fC…3a90`)
- Agent submit key: `0xB1D19F…654f` (rotated; holds gas only, zero token balance as required)

## What the agent does and doesn't do

- **Does**: watches Sepolia `PriceObservation`, builds Attestcoin proofs, calls Gemini
  (temperature 0 + seeded for determinism) for an act/don't-act decision, submits proofs
  to a tenant's treasury, journals executions on-chain.
- **Does not**: hold funds, execute trades directly, or loosen any contract bound. The
  contract independently re-checks every bound before any trade.

## Known limitations / honest gaps (link target for other docs)

See `docs/DESIGN.md` §9 ("What's still honestly not solved") for the maintained list:
destination-DEX-price asymmetry (single spot read, no attestation/TWAP — contained today
because the mock pool is trusted, but the contract doesn't know that and it must not be
pointed at a real externable pool until fixed); no admin withdraw (intentional,
load-bearing for custody-free); the Sepolia price is a demo input, not a market oracle;
and the JSON-reasoning hash-verification only works when a reasoning API is configured.

## Deliberately NOT true today (fix mis-claims elsewhere)

- ~~Provider allow-list with Gemini/OpenAI/Mistral~~ — **Gemini only** today.
- ~~PenguinSwap / real USDC / real AMM~~ — **mock DEX + mock tokens** are what's deployed.
- ~~`attestedAt` timestamp~~ — removed in Task 3.7 (observation moments are block heights).

## Reconciliation status (Task 3.12)

| Doc | Status |
|---|---|
| `docs/ARCHITECTURE_V2.md` | ⚠️ Stage-3 row mentions provider allow-list (Gemini/OpenAI/Mistral) — amend to "Gemini only" |
| `README.md` | ⚠️ "Gemini / OpenAI / Mistral" claim — fix to Gemini only |
| `docs/ROADMAP.md` | ⚠️ Claims + stale `/app` route — fix |
| `docs/HELP.md` | ⚠️ "Gemini, OpenAI, or Mistral" — fix to Gemini |
| `frontend/src/routes/Help.tsx` | ⚠️ Same claim — fix |
| `docs/PRD.md` | ⚠️ "PenguinSwap / Sepolia USDC" is false today; mock DEX reality — amend to reflect current reality |
| `docs/DESIGN.md` | ⚠️ Mentions PenguinSwap — verify/amend scope claim |
| `docs/DEPLOYMENT.md` | ⚠️ Mentions PenguinSwap — verify/amend |

## What's a real bug vs. a feature

- **Correct / intentional**: rigid immutable guardrails; no admin withdraw; mock DEX;
  Gemini-only today; rejections revert & aren't separately journaled.
- **Known/fixed**: see `DEVLOG.md` for the session-by-session record of every fix (incl.
 3.1/3.4/3.5/3.6/3.7/3.8/3.9/3.11).

## Deployment flow (canonical)

`deploy-factory.js` → `register-agent.js` → `index-tenants.js` → `update-abis.js`
(full runbood in `docs/DEPLOYMENT.md | Step-3).
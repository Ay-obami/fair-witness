# Fair Witness — Agent Handoff

Operational knowledge base for any agent (or human) continuing work on the Fair Witness
repo. Written 2026-09-07 as the deliverable of **Phase 0 (repository audit)** of the
master build plan, from primary evidence: direct contract reads, RPC queries against
live testnets, Blockscout API, fresh test runs, and git history. Nothing here is taken
on faith from READMEs or stale docs; every load-bearing claim carries a verification
label.

## Reading order

| File | What it covers |
| --- | --- |
| [PHASE-STATUS.md](PHASE-STATUS.md) | Where the master plan stands; the STOP gate before Phase 1 |
| [CURRENT_STATE.md](CURRENT_STATE.md) | The Phase 0 audit report: structure, architecture, flows, baselines, verdicts |
| [DEPLOYMENTS.md](DEPLOYMENTS.md) | Every VERIFIED deployed address, tx hash, block, and interface version |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Open defects + the three master-prompt STOP conditions |
| [DECISIONS.md](DECISIONS.md) | Why the system is the way it is (decision log with rationale) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component map, data flows, trust boundaries, interface-version drift |
| [RESEARCH.md](RESEARCH.md) | Phase 1 research agenda: what must be verified before design freeze |
| [TEST_MATRIX.md](TEST_MATRIX.md) | Baseline test state: what is covered, what is not |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Toolchain versions, env vars, RPC endpoints, third-party services |

## Operating constraints (binding)

1. **Verification labels.** Anything not proven this session is labeled `VERIFIED`,
   `UNVERIFIED`, or `NOT VERIFIED` — never blur these. Re-verify on-chain claims via
   RPC/Blockscout; never trust a README, a cached doc, or a previous session's say-so.
2. **No fabrication.** Never invent or "repair" an address, tx hash, or number. If the
   evidence gives a truncated value, record it as truncated or re-query.
3. **Runtime AI is Gemini.** The decision engine uses `@google/genai` +
   `gemini-flash-latest`. Do not swap, wrap, or "upgrade" it to another provider.
   (DeepSeek/Claude are coding assistants for this repo, not runtime components.)
4. **Security is not negotiable for shipping.** No weakening of guardrails, no removing
   of verification steps, no "temporarily" trusting untrusted input to make a demo work.
5. **Phase-gated execution.** Work proceeds one phase at a time with STOP checkpoints
   and completion reports between phases. Do not skip ahead.

## Quick facts

- Monorepo: `contracts/` (Foundry), `agent/` (Node 22 + TS), `frontend/` (React/Vite),
  `docs/`. No root package.json; each package builds/tests independently. CI runs all
  three (`.github/workflows/ci.yml`).
- Baselines (all fresh, 2026-09-07): `forge test` **33/33**, agent `vitest` **41/41**,
  `npm run build` (frontend) **clean**.
- Live demo path runs on **Creditcoin testnet** (chainId **102031**) with a **Sepolia**
  (chainId 11155111) source-price contract. Frontend is live on Vercel
  (https://fair-witness.vercel.app, CLI-deployed).
- The three master-prompt STOP conditions (mock DEX + mock tokens in the live path;
  no mainnet-grade liquidity; permissionless source price observation) are all
  **confirmed present** in the live path — see KNOWN_ISSUES.md. Fixing them is the
  point of the remaining phases.

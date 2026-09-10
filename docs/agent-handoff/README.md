# Fair Witness — Agent Handoff

## Current checkpoint — 2026-09-08 (read first)

[MASTER_INSTRUCTIONS.md](MASTER_INSTRUCTIONS.md) is the complete persistent
engineering instruction set. Handoff repair and local Phases 0–3 and 5 are complete;
Phase 4 has a tested local adapter but remains open at its live acceptance boundary.
No new-path contract has been deployed and no state-changing network transaction was
sent. The fresh fail-closed readiness audit and blockers are recorded in
[PHASE-4-READINESS.md](PHASE-4-READINESS.md). Read [LAST_SESSION.md](LAST_SESSION.md), the Phase 1 V2 freeze, and Phase 2–5
reports before relying on the qualified historical dossier below.

**Newest override:** the user selected a Sepolia-only source on 2026-09-08. Phase 1
is reopened because no Sepolia USDC/WCTC Uniswap V3 pool currently exists. Read
[SEPOLIA-ONLY-REASSESSMENT.md](SEPOLIA-ONLY-REASSESSMENT.md) before the older
mainnet-source reports; do not deploy chain key 3/mainnet configuration.

Required hierarchy and takeover reading order:

1. [MASTER_INSTRUCTIONS.md](MASTER_INSTRUCTIONS.md) — how the agent must work.
2. [CURRENT_STATE.md](CURRENT_STATE.md) — where the project currently is.
3. [LAST_SESSION.md](LAST_SESSION.md) — where the previous agent stopped.
4. [PHASE-STATUS.md](PHASE-STATUS.md) — phase completion/incompletion.
5. [DECISIONS.md](DECISIONS.md) — why decisions were made.
6. [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — broken/unresolved work.

Then read supporting records and inspect Git status/diff and actual source. Use
master §12 for instruction conflicts, §18 for evidence classifications and §68 for
the ten STOP conditions. Old VERIFIED labels do not prove current chain state.

At every session end, including interrupted or blocked work, update LAST_SESSION.md
with agent/date/phase/status, completed/pending work, exact last command/result,
changed files, test commands/results, deployment changes, transaction evidence,
failure/cause, discoveries, prohibitions and next exact action. Use UNKNOWN for
missing history; distinguish inherited changes from this session. Update
CURRENT_STATE.md and affected supporting records. Do not mark a phase complete
unless master §61 is satisfied. Keep handoff updates in version control, not only chat.

## Historical dossier (qualified by repair audit)

Operational knowledge base for any agent (or human) continuing work on the Fair Witness
repo. Written 2026-09-07 as the deliverable of **Phase 0 (repository audit)** of the
master build plan, from primary evidence: direct contract reads, RPC queries against
live testnets, Blockscout API, fresh test runs, and git history. Nothing here is taken
on faith from READMEs or stale docs; every load-bearing claim carries a verification
label.

## Historical supporting-document index

| File | What it covers |
| --- | --- |
| [PHASE-STATUS.md](PHASE-STATUS.md) | Where the master plan stands; the STOP gate before Phase 2 |
| [CURRENT_STATE.md](CURRENT_STATE.md) | The Phase 0 audit report: structure, architecture, flows, baselines, verdicts |
| [DEPLOYMENTS.md](DEPLOYMENTS.md) | Every VERIFIED deployed address, tx hash, block, and interface version |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Open defects + the three master-prompt STOP conditions |
| [DECISIONS.md](DECISIONS.md) | Why the system is the way it is (decision log with rationale) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component map, data flows, trust boundaries, interface-version drift |
| [PHASE-1-REPORT.md](PHASE-1-REPORT.md) | Phase 1 results + architecture-freeze decisions F1–F4, STOP status, claims inventory |
| [RESEARCH.md](RESEARCH.md) | Phase 1 research: gate questions R1–R7 now RESOLVED with VERIFIED evidence |
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

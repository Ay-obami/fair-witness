# Fair Witness

An attested custody-free arbitrage journal — BUIDL CTC 2026 Fall (Creditcoin AI track)
submission.

BUIDL CTC 2026 Fall — Creditcoin AI Track submission.

An autonomous cross-chain arbitrage system where an LLM-driven agent decides *whether*
to act, but never holds funds and never executes directly. All capital sits in an
on-chain treasury contract that enforces rigid, pre-committed bounds and executes
exclusively through a single Attestcoin-verified, replay-safe entry point. Every
execution — and every rejected attempt — is written to an on-chain journal that lets
anyone reconstruct exactly why a trade happened, with the underlying facts independently
verifiable against Sepolia.

**Core claim:** manipulation-resistant, custody-free, fully auditable autonomous
execution — explicitly *not* a speed-competitive arbitrage bot. See `docs/DESIGN.md` for
why, and `docs/PRD.md` for the full spec.

## Repo layout

```
contracts/   Foundry project — ASCTreasuryJournal.sol + tests
agent/       TypeScript agent runner (chain watcher, LLM decision, proof submission)
frontend/    React + Tailwind replay/audit viewer
docs/        PRD, design doc, deployment guide
DEVLOG.md    Running log of design decisions, pitfalls, and build status
```

## Status

**LIVE on both testnets.** Contracts, agent runner, and frontend are all deployed and
running against real networks:

- **Live demo (replay viewer, live mode):** https://ay-obami.github.io/asc-arbitrage-journal-demo/
- **Treasury on Creditcoin testnet:** `0x78C986079Ee1C8701a56EeD7303Ac2301403E1dD`
- **Price source on Sepolia:** `0x23433fcA0f35CC5e801b6888293B2B11017900c7`

Real Attestcoin-proven Sepolia transactions have triggered real executions on the
Creditcoin treasury; `npm run replay -- <actionKey>` reconstructs them end-to-end with a
genuine hash match against published off-chain reasoning; and an exact-calldata replay
attack was demonstrated live and rejected with `ActionAlreadyExecuted`. Full addresses,
tx hashes, and the honest list of what's mocked vs. real are in `DEVLOG.md` (session 7)
and `docs/DEPLOYMENT.md`.

Automated tests: 14 Foundry + 16 vitest, all passing. The on-chain price decoder handles
the **real** Attestcoin `encodedTransaction` envelope (`abi.encode(uint8, bytes[])` from
the `@gluwa/usc-sdk`) and was validated against genuine live proof payloads.

```bash
# Contracts
cd contracts && ./install-deps.sh && forge test

# Agent runner (unit tests only — needs no live network)
cd agent && npm install && npm test

# Frontend (demo mode — no live network needed)
cd frontend && npm install && npm run dev
```

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — full product requirements
- [`docs/DESIGN.md`](docs/DESIGN.md) — original architecture write-up (custody
  separation + replay-safe journal + honest latency handling)
- [`DEVLOG.md`](DEVLOG.md) — design decisions, pitfalls, and progress, kept up to date
  throughout the build

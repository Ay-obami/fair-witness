# Attested Custody-Free Arbitrage Journal

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

Contracts, agent runner, and frontend are all built and independently tested
(14 Foundry tests + 16 vitest tests, all passing). The on-chain price decoder now handles
the **real** Attestcoin `encodedTransaction` envelope (the `abi.encode(uint8, bytes[])`
format produced by the `@gluwa/usc-sdk`), so no code change remains between this repo and
a live end-to-end run — the remaining work is the **live testnet deployment** itself
(funded keys, real RPCs, a Gemini key), which is credential-gated, not code-gated. See
`DEVLOG.md` for the full journey (including the session-6 decode fix and its tests) and
`docs/DEPLOYMENT.md` for the 7-step deployment path.

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

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
(11 Foundry tests + 16 vitest tests, all passing) without live network access. One code
change is still needed before a real testnet run works end-to-end (on-chain price
decoding against the real Attestcoin `encodedTransaction` format) — see `DEVLOG.md` for
exactly what's open and `docs/DEPLOYMENT.md` for the full deployment path.

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

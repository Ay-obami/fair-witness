# Fair Witness

An attested custody-free arbitrage journal — BUIDL CTC 2026 Fall (Creditcoin AI track)
submission. Now **multi-tenant**: every user gets their own independently-deployed,
guardrail-immutable treasury contract via a permissionless factory.



## What this is (current reality)

Fair Witness is an autonomous cross-chain arbitrage system where an LLM-driven agent
decides *whether* to act, but never holds funds and never executes directly. In the
V2 multi-tenant pivot:

- **Every signup deploys a fresh, independent treasury contract** from the factory —
  their chosen guardrails (max trade size, slippage, drift, rate limit) are baked in
  as constructor-set immutables. No shared contract with mutable per-user settings, ever —
  not even the owner can loosen a bound later. That immutability is what makes the safety
  guarantee real.
- **Each instance is verified independently** — the factory emits a `TreasuryDeployed`
  event per instance; `contracts/script/index-tenants.js` scans those events into a
  registry so the dashboard/agent can enumerate tenants without a mutable registry contract.
- **The agent is multi-tenant**: one process loops over every indexed instance each poll
  cycle, reads that instance's OWN guardrails + DEX config live from-chain, evaluates
  only on facts that clear the tenant's bounds, and submits proofs to that instance only.


See [`docs/ARCHITECTURE_V2.md`](docs/ARCHITECTURE_V2.md) for the full architecture, and
[`DEVLOG.md`](DEVLOG.md) for the running honest status of what's real vs what's deferred



## Live on Creditcoin CC3 testnet

| Role | Address |
|---|---|---|
| Factory (permissionless, no admin) | `0x97c81D68BbCDb1A673b61176d60F071963Abe7f2` |
| Tenant A instance (5 USDC / 150bps / 80bps min gap / 6 per day) | `0x13CACe3989b295048De47C68F32Ff3d844AC2026` |
| Tenant B instance (10 USDC / 200bps / 120bps min gap / 3 per day) | `0xD66C607072df7dB98A75aEe81fCA4089462c60aB` |
| BASE_ASSET (USDC-like, 6 dp, **public mint**) | `0x0bFA6eF009f8739c727b292849029608bd6b115A` |
| Price source (Sepolia) | `0x23433fca0f35CC5e801b6888293B2B11017900c7` |

Real Attestcoin-proven Sepolia transactions have triggered real executions on the
Creditcoin treasuries; e.g. the `executeArbitrage` tx
`0xae01e705cc993a578c4a5da092241142750e82cffe7c858654111a82a358106b` (status
success, from the agent submit address, to Tenant A) — verifiable on Blockscout
at `https://creditcoin-testnet.blockscout.com`. An exact-calldata replay attack was
demonstrated live and rejected with `ActionAlreadyExecuted`. Full addresses, tx hashes,
and the honest list of what's mocked vs real: see `DEVLOG.md` (Sessions 8–9)
and `docs/DEPLOYMENT.md`.



## Routes (frontend/)

| Route | What |
|---|---|
| `/` | Landing page — honest pitch, live proof, how-it-works, scope, CTA |
| `/signup` | **Embedded-wallet sign-up** (Thirdweb, non-custodial: email → invisible wallet → pick guardrails once → deploy your own factory instance) |
| `/signup/done` | Confirmation page — reads your new instance's guardrails live from-chain + next step (fund it) |
| `/verify` | Replay & Audit Viewer (search-by-key, public transparency — the "verify this yourself" tool) |
| `/docs` | Plain-language help (non-technical) |

The old single-tenant Replay & Audit Viewer now lives at `/verify`; the root route is
the landing page. (The previously-listed Vercel/GH Pages mirrors were the pre-pivot
build; the pivot's hosted frontend redeploy is pending.)



## Repo layout

```
contracts/   Foundry project — ASCTreasuryJournal.sol + ASCTreasuryFactory.sol + tests
agent/       TypeScript agent runner (multi-tenant: polls every indexed instance per cycle)
frontend/    React + Tailwind SPA (landing, sign-up, verify, help)
docs/        PRD, design doc, V2 architecture, deployment guide, plain-language help
DEVLOG.md    Running log of design decisions, pitfalls, and build status
```



## Status (honest)

| Stage | Status |
|---|---|
| 1 — Factory + >=2 instances | ✅ live on CC3, verified on Blockscout |
| 2 — Embedded-wallet sign-up | 🔄 frontend built (`tsc`/`oxlint`/`vite` clean); browser E2E needs a real Thirdweb client ID |
| 3 — Multi-tenant agent service | ✅ live-verified end-to-end (receipt-checked) |
| 4a — On-chain tenant enumeration | ✅ shipped (`index-tenants.js` → `tenants.json`) |
| 4b/4c — Login-gated per-user dashboard (Supabase auth ↔ address) | ❌ external provisioning |
| 4d/5 — Hosted GH Pages redeploy | 🔄 landing+help built; deploy needs the SPA fallback config (now included) and GH Pages credentials |

**Honest caveats:** All funds are testnet USDC with no value. Both an agent submit key
and a Gemini key were committed to this repo early on and are flagged **must-rotate**
before any real funds (`docs/ROADMAP.md` → Security). The deterministic-LLM layer uses
Gemini / OpenAI / Mistral (Claude excluded — no seed parameter). The contract's own
independent bound-checking is the safety property — key-storage sophistication was a
deliberately cut scope item (`DEVLOG.md`)..



## Quickstart

```bash
# Contracts
cd contracts && ./install-deps.sh && forge test

# Agent runner (unit tests only — needs no live network)
cd agent && npm install && npm test

# Frontend (demo mode — no live network needed)
cd frontend && npm install && npm run dev
```

For a live deployment, run `docs/DEPLOYMENT.md` end-to-end (including the Stage 2
sign-up flow section). The frontend needs `VITE_THIRDWEB_CLIENT_ID` for real signups and
`VITE_DEMO_MODE=false` + the RPC/factory vars for live reads (see `frontend/.env.example`).



## Documentation

- [`docs/PRD.md`](docs/PRD.md) — full product requirements (pre-pivot single-tenant; the
  V2 pivot supersedes its deployment model, not its trust thesis)
- [`docs/DESIGN.md`](docs/DESIGN.md) — original architecture write-up (custody separation
  + replay-safe journal + honest latency handling)
- [`docs/ARCHITECTURE_V2.md`](docs/ARCHITECTURE_V2.md) — the multi-tenant pivot architecture;
  factory pattern, immutable guardrails, event-indexed enumeration, multi-tenant agent
- [`docs/HELP.md`](docs/HELP.md) — plain-language help for non-technical users
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — deployment guide for all stages
  (incl. the Stage 2 sign-up flow)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — forward-looking status + security/upgrade paths
- [`DEVLOG.md`](DEVLOG.md) — design decisions, pitfalls, and progress, kept up to date

---

*Every claim in this README is checked against the currently deployed reality — if something
looks aspirational, it's the honest caveats section (or the ROADMAP), not a hidden promise.*

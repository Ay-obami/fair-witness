# Architecture V2 — the multi-tenant pivot (Fair Witness)

> **Provenance / honesty note.** This document describes the V2 architecture as
> specified in the multi-tenant pivot brief. The brief's instruction was to base the doc
> on a full architecture writeup and "don't invent one"; no separate writeup beyond the
> brief's own locked-context section was provided at the time of writing, so this doc is
> derived from that locked context plus the project's existing design docs
> (`docs/DESIGN.md`, `docs/PRD.md`) and the working V1 implementation. Anything that is a
> design choice made here rather than dictated by the brief is flagged as such inline.

## 1. What changed, in one paragraph

V1 deployed **one** hardcoded `ASCTreasuryJournal` instance owned by the platform, with a
handful of rigid bounds compiled in as Solidity `constant`s. V2 makes the system
**multi-tenant**: a factory contract creates a **fresh, independent treasury deployment
per user**, with that user's guardrails — max trade size, slippage, drift, rate limit —
**baked in immutably via the instance's constructor arguments**. The single-tenant build
was "the platform runs one treasury"; V2 is "every user runs their own treasury, and no
one — not even the user who deployed it — can loosen its bounds after the fact."

## 2. The non-negotiable constraint

> **No shared contract with mutable per-user settings, ever.**

The project's credibility rests on the guarantee that *"even the owner can't loosen this
later."* That guarantee only survives the pivot if per-user constraints are **immutable
per instance**. Two ways this could silently break:

- A single shared treasury keyed by user ID with owner-settable per-user knobs — a
  privileged party (the platform, a compromised owner key, a buggy admin function) could
  change a user's bounds in place. **Forbidden.**
- Per-user constraints stored in the *factory* or *some other registry* rather than the
  instance itself — mutable, centralized, and invisible to a verifier looking at the
  instance. **Forbidden.**

The only acceptable shape is the one this pivot commits to: **each instance is a
self-describing contract** whose guardrail values are constructor-set `immutable` fields,
readable by anyone on-chain, and unchangeable for the life of the deployment. If a user
genuinely wants different constraints, the answer is the same as it always was in V1: a
**new deployment**, not a reconfiguration.

## 3. Architecture

```
                          Fair Witness V2 (multi-tenant)

  Sign-up (Stage 2)                     Factory (Stage 1)
  ┌──────────────┐        createTreasury(owner, guardrails)
  │ user / email │ ─────────────────────────────────────────────►  ASCTreasuryFactory
  └──────────────┘                                                    │  ┌─────────────────────────────┐
                                                                     │  │ canonical chain config:      │
  every deployment is a fresh, independent                          │  │ verifier / dex / base / quote │
  ASCTreasuryJournal with the user's guardrails                     │  │ / price-contract addresses    │
  stored as constructor immutables                                  │  └─────────────────────────────┘
                                                                     ▼
                                          ┌──────────────────────────────────────────────────┐
   User A ──► ASCTreasuryJournal_A       │  deposit →  agent service (Stage 3)              │
               immutable: maxTradeSize,  │  polls every active tenant's instance in one      │
               slippage, drift,          │  loop, submits proofs per user against THAT user's │
               rateLimit…                │  contract only.                                   │
                                          └──────────────────────────────────────────────────┘
   User B ──► ASCTreasuryJournal_B
               (different guardrails —
                two instances never share
                state, storage, journal,
                epoch counters)
```

### 3.1 Components

| Component | Role | Stage |
|---|---|---|
| `ASCTreasuryJournal` (refactored) | The treasury shape. Bounds moved from `constant`s to constructor-set `immutable`s via a `Guardrails` struct. Everything else (dual-proof verification, rigid-bound execution, replay-safe journal, **no admin escape hatch**) is unchanged from V1. | 1 |
| `ASCTreasuryFactory` | Deploys a fresh `ASCTreasuryJournal` per call with caller-supplied guardrails; emits `TreasuryDeployed(treasury, owner, …guardrails)`. Holds the platform's canonical chain configuration (verifier precompile, DEX router, base/quote assets, source price contract) so every tenant instance is bound to the same trusted infrastructure the V1 system was verified against. | 1 |
| Thirdweb embedded wallet (non-custodial) | Email/social sign-up → invisible embedded wallet for the user; user deploys *their own* instance through it and deposits into it. No pooled/custodial balances. | 2 |
| Multi-tenant agent service | Loops over every active user's config each poll cycle; submits proofs against each user's own instance; platform-owned LLM key, provider allow-list (Gemini, OpenAI Chat Completions, Mistral; Claude excluded). | 3 |
| Supabase | Auth (user ↔ contract-address mapping), human-readable reasoning, activity feed, rejection capture (a revert unwinds the on-chain journal write, so rejections are stored here with their specific reason). | 3 |
| Per-user dashboard | Login-gated, plain-language activity for *your own* contract, with the verified-success vs agent-reported-rejection distinction rendered visibly differently. | 4 |
### 3.2 The guardrail surface (`ASCTreasuryJournal.Guardrails`)

All seven values are constructor-set `immutable`s on every instance. V1's
`constant` values are preserved as the factory's/reference deployment's defaults.

| Field | V1 default | Meaning |
|---|---|---|
| `maxTradeSize` | `5e6` (5 USDC @ 6dp) | per-trade capital cap |
| `maxSlippageBps` | `150` (1.5%) | max tolerated quote slippage |
| `minArbWidthBps` | `80` | width floor — don't act on attestation-lag noise |
| `maxDriftBps` | `100` | max drift between source and confirm proofs |
| `maxConfirmGapBlocks` | `20` | how stale the confirm proof may be |
| `maxActionsPerEpoch` | `6` | rate limit — caps blast radius per epoch |
| `epochLength` | `1 days` | rate-limit window |

`MAX_TRADE_SIZE`, `MAX_SLIPPAGE_BPS`, `MAX_DRIFT_BPS`, and `MAX_ACTIONS_PER_EPOCH` are
the four constraints the pivot brief names explicitly; `minArbWidthBps`,
`maxConfirmGapBlocks`, and `epochLength` are parameterized too because they are the same
kind of rigid bound and leaving *some* bounds shared-but-fixed while parameterizing
others would make the per-tenant "shape" claim ambiguous. This is a flagged design choice,
not something the brief dictated.

### 3.3 Decisions made in this stage (flagged as ours, not dictated)

1. **All seven bounds parameterized**, per §3.2.
2. **Factory is permissionless** — `createTreasury` is callable by anyone, so the
   Stage-2 sign-up flow can deploy on the user's behalf (via their embedded wallet) without
   any platform-side gating. The factory itself has no owner and no admin surface.
3. **CREATE, not CREATE2.** Stage 1 uses plain `CREATE`: simplest possible deployer, no
   salt bookkeeping, and instance addresses are determined purely by factory nonce history.
   CREATE2 (deterministic per-user addresses, idempotent sign-up retries) is a clean
   drop-in upgrade and is noted in `ROADMAP.md` as an upgrade path rather than built now.
4. **Guardrail validation lives in both places**: the treasury constructor rejects
   zero/nonsensical values (so an instance can *never exist* with invalid bounds, even
   deployed outside the factory), and the factory pre-flights the same check for a clean
   revert before burning the deployer's gas.
5. **Legacy single-tenant instance stays untouched.** The V1 treasury at
   `0x78C986079Ee1C8701a56EeD7303Ac2301403E1dD` remains live and is *not* managed by the
   factory. The pivot is additive; nothing in V2 moves V1 funds or repoints V1 components.

## 4. Tenant lifecycle (the 5-stage arc)

1. **Sign up** (Stage 2): email/social login → Thirdweb embedded wallet (non-custodial,
   no seed phrase exposure) → user picks their guardrails.
2. **Deploy** (Stage 2): `factory.createTreasury(userWallet, guardrails)` → fresh,
   independent instance owned by the user; `TreasuryDeployed` event is the on-chain record
   of the tenancy.
3. **Fund** (Stage 2): user deposits `BASE_ASSET` (testnet USDC-like) into their own
   instance. Funds are held by the instance; neither the platform, the factory, nor the
   agent ever holds them.
4. **Act** (Stage 3): the multi-tenant agent polls, evaluates, and submits proofs per
   user, against each user's own instance; success and rejections land in Supabase
   (rejections have no on-chain journal counterpart — a revert unwinds the write).
5. **Read** (Stages 4–5): the user's dashboard shows *their* activity in plain language,
   with verified-execution rows (checkable against the on-chain `decisionHash`) visibly
   distinguished from agent-reported rejections.

## 5. What does NOT change from V1 (the trust backbone)

- **Custody separation.** Only `executeArbitrage` can move an instance's funds; the agent
  has zero fund access; there is **still no owner/admin escape hatch** on the instance.
  Because each instance is independently deployed and self-contained, this property now
  holds *per tenant* rather than once.
- **Dual-proof staleness handling.** Two Attestcoin proofs, drift-checked on-chain.
- **Replay-safe journal.** `factKey`/`actionKey`/`decisionHash` design is unchanged, so
  the Stage-4 dashboard's verified-success rows retain their on-chain checkability.
- **Latency honesty.** `minArbWidthBps` / `maxConfirmGapBlocks` are still judgment values
  that a production deployment must re-derive from measured attestation latency — now per
  tenant rather than per platform.

## 6. Key management model (as of the end of Stage 1)

| Actor | Key | Where it lives |
|---|---|---|
| Tenant (user) | their embedded wallet (Stage 2) / explicit wallet | instance `owner` (initialOwner) — can register/deregister submitters for their own instance |
| Platform agent | one submit key per platform (or per tenant, Stage 3 decision) | platform secrets management; **never git** |
| Factory deployer | ordinary deployer key | used only to publish the factory + demo instances; no post-deployment power (permissionless factory) |

Stage 3 introduces a platform-owned LLM key + ordinary cloud-KMS-grade submit keys, and
deliberately **cuts** Turnkey for this timeline (the safety property comes from the
contract's own independent bound-checking, not key-storage sophistication) — see
`DEVLOG.md` stage-1/3 entries and `ROADMAP.md`.

## 7. Stage-1 "done when" checklist (as documented in the brief)

- [ ] Factory contract deployed to Creditcoin testnet.
- [ ] At least two independent instances deployed through it with different constraints.
- [ ] Both instances verified independently on a block explorer (not just "deploy script
  exited 0").

See `DEVLOG.md` → "Session 8 / Stage 1" for addresses, transactions, and the verification
method.
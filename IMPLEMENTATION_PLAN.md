# Fair Witness — Implementation Plan

Status: living handoff document. Update this file as phases complete so any
agent picking up the work mid-stream knows what's done and what's next.

This document has three parts. **Recommended execution priority: Part 3,
then Part 2, then Part 1** — protocol/economic correctness matters more
than UI polish, even though Part 1 is written first in this document for
narrative/historical reasons.

- **Part 1 — Frontend UI overhaul** (Phases 0-2): bugs, structure, design
  system, new pages.
- **Part 2 — Contract & documentation hardening**: two specific fixes agreed
  on from the initial critique pass (rejected-attempts copy correction,
  destination-price disclosure) plus code-debt/reentrancy/CI/reasoning-store
  items.
- **Part 3 — Protocol & agent correctness**: findings from a second-opinion
  security/correctness review, verified against the actual code before
  inclusion. Covers replay-key derivation, source-price authenticity,
  fund-mobility/settlement, economic correctness, evidence-model
  completeness, deployment/doc drift, and an expanded adversarial test suite.

All three parts can be worked in parallel by different people if needed —
they touch mostly non-overlapping files — but if sequencing one at a time,
do Part 3 first.

---

# Part 1 — Frontend UI overhaul

## Context

You are working in the existing Fair Witness repo (`frontend/`, `agent/`,
`contracts/`). This is a hackathon-scale project — one Foundry contract, one
TypeScript agent runner, one React + Tailwind frontend, no existing indexer.

Work through the phases below **in order**. Do not start Phase 2 work until
Phase 0 and Phase 1 are implemented and verified. After each phase: run
`npm run build`, fix TypeScript/lint errors, check every route on desktop and
mobile, and update the "Progress log" section at the bottom before moving on.

**Reuse existing implementation wherever possible. Do not rewrite working
blockchain integration just to redesign the UI. Do not fabricate data, fake
verification states, or invent contract capabilities that don't exist.**

## Design tokens

Extend `frontend/src/index.css`'s existing `@theme` block — do not remove or
rename the existing `ledger` / `verified` / `alert` tokens, add to them.

| Token | Value | Use |
|---|---|---|
| Background | `#0B0D0F` | page background |
| Surface | `#15181B` | cards |
| Elevated surface | `#1D2125` | modals, popovers, nested panels |
| Border | `#262B30` | hairlines |
| Primary text | `#E8E6E1` | body copy |
| Secondary text | `#9BA1A8` | muted/supporting copy |
| Copper (new) | `#C98A3E` | agent decision, primary CTAs/buttons |
| Copper highlight (new) | `#E1A95F` | hover state on copper elements |
| Verified / allowed (existing `verified-500`) | `#4CAF6D` | status only — verified, allowed, success |
| External evidence (new) | `#5B9BD5` | independently-verifiable / Sepolia evidence contexts |
| Rejected / enforced (existing `alert-500`) | `#B5482F` | status only — rejected, constraint-enforced |

**Rule:** copper is for actions and agent-decision UI. Teal (`verified`) and
amber (`alert`) are reserved strictly for status — stop reusing `verified-500`
for buttons like "Get started" / "Sign up."

## Status model

Never collapse an action to `SUCCESS` / `FAILED`. Track five independent
dimensions:

- **Decision:** `EXECUTE` / `SKIP`
- **Authorization:** `ALLOWED` / `REJECTED`
- **Execution:** `CONFIRMED` / `REVERTED` / `NOT EXECUTED`
- **Verification:** `VERIFIED` / `UNVERIFIED`
- **Journal:** `RECORDED` / `NOT RECORDED`

A rejection is a **successful security outcome**, not an error — label and
style it accordingly ("the system prevented the proposed action," "this
rejection was recorded in the journal"), never as a generic error state.

**Never fabricate a verified/live state.** If data isn't available, show
`UNVERIFIED` or `UNAVAILABLE`, not a fake green check.

## Phase 0 — bugs and structural fixes

No new pages. Do this first.

1. Fix `frontend/src/routes/Home.tsx` — the literal `/* Scope section */` text
   currently renders on the page. Wrap it as a real JSX comment:
   `{/* Scope section */}`.
2. Delete `frontend/src/App.tsx` — dead code, not imported anywhere, a
   duplicate of `Verify.tsx` under the wrong title.
3. Extract `frontend/src/components/Layout.tsx` (shared nav + footer) and use
   it in every route: `Home`, `Help`, `Verify`, `Dashboard`, `SignUp`,
   `SignUpDone`. Standardize nav items and order across all of them — pick one
   canonical set instead of each page defining its own.
4. Add a catch-all route (`path="*"`) in `main.tsx` with a real `NotFound`
   page component, styled consistently with the rest of the app.
5. Add a top-level `ErrorBoundary` component wrapping `<Routes>` in
   `main.tsx`.
6. Replace `frontend/public/favicon.svg` — it's currently the default Vite
   generator placeholder (purple/blue blob, `#863bff`/`#7e14ff`/`#47bfff`),
   which directly contradicts the "forensic-ledger, not generic
   indigo/purple SaaS" rationale already documented in `index.css`. Design a
   real mark using the palette above.
7. Apply the extended token set everywhere: copper for actions/CTAs, teal
   strictly for verified/success, amber strictly for rejected/enforced, the
   new blue for external-evidence contexts.

**Note:** the "every rejected attempt is written to an on-chain journal"
copy claim (README, hero, Honest Scope) also needs correcting — see
**Part 2, Task B** below. Apply it in this same pass if convenient; it's not
gated on anything else in Phase 0.

---

# Part 2 — Contract & documentation hardening

Two specific fixes from the full-project critique, agreed as follows:
rejected attempts are **intentionally** not journaled (a real product
decision, not a bug) — so the fix is correcting the copy that claims
otherwise, not building the feature. The destination-chain price gap is a
**real, currently-low-risk gap** — the fix here is disclosure now, plus a
tracked implementation gate before any real-DEX cutover.

Independent of Part 1 — do in either order.

### Task A — disclose the destination-chain price gap in `docs/DESIGN.md`

This has already been written into the local working copy of
`docs/DESIGN.md` in this session. When applying this plan to the actual
repo, insert the following paragraph into **§9 "What's still honestly not
solved"**, as a new bullet immediately after the existing bullet that ends
"...that's the actually-true, actually-defensible claim."

Insert verbatim:

```markdown
- **The destination-chain (Creditcoin DEX) price is read live, in the same transaction as execution, with no attestation and no TWAP.** The source-chain price gets real protection — two independent Attestcoin proofs plus a drift check across a block gap. `_quoteCreditcoinDexPrice()` gets none of that: it's a single spot `getAmountOut` call on `DEX_ROUTER`, read and acted on in the same tx. That's an asymmetry the "manipulation-resistant" claim doesn't currently cover. Today the risk is contained rather than absent — `DEX_ROUTER` is our own self-seeded mock pool (no real USDC/WCTC liquidity existed on Creditcoin testnet; see the PenguinSwap finding in `DEVLOG.md` session 7), so there's no external party positioned to manipulate it, and `MAX_TRADE_SIZE` plus the per-epoch rate limit already cap the blast radius even in the worst case. But the contract code itself doesn't know the pool is trusted-by-construction, and nothing here changes automatically the day `DEX_ROUTER` points at a real, publicly-tradeable pool. **Do not point this contract at a real, externally-tradeable DEX pool until this is closed.** The fix that best matches the codebase's existing pattern: mirror the source side's dual-proof-with-block-gap design on the destination leg too — snapshot the destination price in a "propose" step, then re-read and compare drift in a later "execute" step, instead of reading it once, live, mid-transaction. A pool-native TWAP is a viable alternative if the real router turns out to be Uniswap-V2-style (PenguinSwap is reportedly V3-style per DEVLOG, which would need its own oracle module, not a drop-in TWAP read).
```

- [x] Applied to `docs/DESIGN.md` §9 (2026-09-05)

### Task B — correct the rejected-attempts journaling claim

The contract intentionally does not journal rejected attempts (they revert;
only executions get a structured `JournalEntry`). Find and correct every
place that claims otherwise:

- `README.md` — the line describing "every execution — and every rejected
  attempt — is written to an on-chain journal."
- `frontend/src/routes/Home.tsx` — hero copy and the "Honest scope" section
  (same claim, same phrasing pattern).
- Check `docs/PRD.md` and `docs/ARCHITECTURE_V2.md` for the same claim and
  correct there too if present.

Replacement language (adapt per context, keep the meaning exact):

> "Every execution is written to an on-chain journal. Rejected attempts
> revert on-chain and are visible as failed transactions, but aren't
> separately journaled — your own limits already did their job."

- [x] `README.md` corrected — ground-truth 2026-09-05: **no such line exists in
      README** (the plan's README item was a false positive); no change needed
- [x] `frontend/src/routes/Home.tsx` corrected (BEATS[03] + the hero's "every
      action is … journaled" phrasing; the Honest-scope section never made the claim)
- [x] `docs/PRD.md` / `docs/ARCHITECTURE_V2.md` checked and corrected if needed
      (PRD §1 corrected; ARCHITECTURE_V2 §4 already stated it correctly)

### Task C — tracked: destination-price hardening (not yet implemented)

Implementation of the fix described in Task A's disclosure — not required
before Part 1 UI work, **required** before `DEX_ROUTER` points at any real,
externally-tradeable pool.

- [ ] Not started — mirror source-side dual-proof-with-block-gap pattern on
      the destination leg (propose → execute, see Task A disclosure for
      detail), or implement a pool-native TWAP if the real router is
      confirmed Uniswap-V2-style.

### Task D — dead code cleanup in `ASCTreasuryJournal.sol`

Two pieces of vestigial code, both now confirmed dead given Task B's
decision that rejections are intentionally not journaled:

- `ActionType.REJECTED_STALE` and `ActionType.REJECTED_NARROW` enum values
  are declared but never constructed anywhere in the contract.
- `event ArbitrageRejected(bytes32 indexed factKey, string reason);` is
  declared but never emitted anywhere.

Both currently suggest to a reader/auditor that on-chain rejection tracking
exists when it doesn't — remove them for clarity, or add a one-line comment
explaining they're intentionally unused placeholders if there's a reason to
keep them for a future version.

Also in `_boundedTradeSize`:
```solidity
uint256 size = scaled > MAX_TRADE_SIZE ? MAX_TRADE_SIZE : scaled;
if (size > MAX_TRADE_SIZE) revert TradeSizeExceedsMax();
```
The `revert` branch is unreachable — `size` is already clamped to
`MAX_TRADE_SIZE` on the line above, so it can never exceed it. Either
remove the dead check, or replace it with a check that actually does
something (e.g. asserting `scaled` isn't unreasonably large before the
clamp, to catch a future change to the scaling formula that breaks the
invariant silently).

- [x] `ActionType.REJECTED_STALE` / `REJECTED_NARROW` removed or documented
- [x] `ArbitrageRejected` event removed or documented
- [x] `_boundedTradeSize` dead revert branch fixed

### Task E — add `ReentrancyGuard` to `executeArbitrage`

The current manual ordering (state flags set before the external DEX call)
is correct and already protects against reentrancy in practice — this task
doesn't change that, it adds a second, explicit layer so correctness doesn't
depend solely on maintaining that ordering by hand. Import OpenZeppelin's
`ReentrancyGuard`, inherit it alongside `Ownable`, and add `nonReentrant` to
`executeArbitrage`. Low effort, standard pattern, no behavior change under
normal operation.

- [x] `ReentrancyGuard` added to `ASCTreasuryJournal.sol`

### Task F — add CI

There is currently no `.github/workflows/` directory in the repo — the 14
Foundry + 16 vitest tests referenced in the README are only ever run
locally, with no automated proof they pass on the current commit. For a
project whose core pitch is "verify it yourself," this is a real,
cheap-to-close credibility gap. Add a workflow that runs on every push/PR:

- `forge test` in `contracts/`
- `npm test` in `agent/`
- `npm run build` in `frontend/` (build check; add `npm test` here too if/when
  frontend tests exist)

Add the resulting status badge to `README.md`.

- [x] `.github/workflows/ci.yml` added, running contracts + agent tests + frontend build
- [x] CI badge added to `README.md`

### Task G — tracked: reasoning store durability (not yet implemented)

`agent/src/reasoningStore.ts` persists off-chain reasoning to a local
flat-file directory (`.reasoning-store/`) only. This is a durability risk,
not a trust risk: the on-chain `decisionHash` is permanent, but if the host
running the agent loses that directory, the reasoning it points to is gone
forever and the hash becomes a permanent pointer to nothing.

Proposed fix, chosen to avoid reopening the original "no IPFS, no DB unless
time allows" decision: mirror-write each payload to a new Supabase table
(e.g. `reasoning_payloads`, keyed by `decisionHash`) in `ReasoningStore.put()`,
alongside the existing local file. Supabase is already integrated in this
project (`frontend/src/lib/supabase.ts`, existing `user_instances` migration)
and already on a free tier — this adds redundancy with no new service and no
new cost. The local file stays the fast/primary path; Supabase is backup
only. If Supabase involvement here is unwanted, the fallback is periodically
committing `.reasoning-store/` to a private git repo instead — no new infra
at all, just a scheduled script.

- [ ] Not started — mirror-write reasoning payloads to Supabase (or git
      backup) alongside the existing local flat-file store.

---

## Progress log

_(Update this section as work lands — phase/task, date, what changed, what's
still open.)_

- Phase 0: not started
- Phase 1: not started
- Phase 2: not started
- Part 2 Task A: ✅ 2026-09-05 — verbatim destination-price disclosure bullet
  inserted into `docs/DESIGN.md` §9, immediately after the
  "...actually-defensible claim" bullet
- Part 2 Task B: ✅ 2026-09-05 — PRD §1 + Home.tsx (BEATS[03] + hero phrasing)
  corrected with the agreed replacement language; ground-truth found the README
  item was a false positive (no such line) and ARCHITECTURE_V2 §4 already stated
  it correctly
- Part 2 Task C: not started
- Part 2 Task D: ✅ 2026-09-05 — enum now ARBITRAGE-only (rationale comment in
  place), `ArbitrageRejected` removed, unreachable `TradeSizeExceedsMax` branch
  + error removed; `agent/src/keys.ts` enum mirror updated. The frontend's
  `types.ts`/`ReplayCard.tsx` REJECTED_* display cases left as-is
  (display-defensive; Phase 1 owns that UI rework)
- Part 2 Task E: ✅ 2026-09-05 — OZ v5.7 `ReentrancyGuard` inherited,
  `nonReentrant` on `executeArbitrage`
- Part 2 Task F: ✅ 2026-09-05 — `.github/workflows/ci.yml` (forge test +
  agent vitest + frontend build; `lib/` committed as plain files so no
  submodule step; `npm ci` against committed lockfiles) + README badge
- Part 2 Task G: not started
- Part 3: in progress (see Progress log at end of Part 3 for per-task status)

---

# Part 3 — Protocol & agent correctness

Sourced from a second-opinion security/correctness review, cross-checked
against the actual repo before inclusion here. Two items from that review
were adjusted or declined — see the notes below before starting.

**Editorial notes, read first:**

- The visual palette recommended in that review (`#0B0D0F` / `#C98A3E` /
  etc.) is not independent corroboration — it's the same palette already
  defined in this document's Part 1 design tokens. No new information
  there; nothing to reconcile.
- That review's item 2.4 recommends making rejected attempts "first-class
  persisted records" on-chain. **This is not being adopted.** Rejected
  attempts are intentionally not journaled — a deliberate product decision,
  not a bug (see Part 2, Task B). The correct fix remains the copy
  correction already tracked there, not a new persistence feature.
- Item 2.1 ("replay protection can be bypassed") describes a real property
  of the code, but it is not an undiscovered bug — `ASCTreasuryJournal.sol`'s
  own comments and `DEVLOG.md` already name the `decisionNonce` trust
  boundary explicitly as an off-chain safety property. The fix below is
  still worth doing (it removes the trust assumption entirely rather than
  just documenting it), but treat it as **hardening a known boundary**, not
  patching a hidden critical vulnerability.
- Item 2.3 ("funds can become permanently trapped") conflates two different
  things. No-admin-withdraw is an intentional, already-documented trade-off
  in `DEVLOG.md`, load-bearing for the custody-free claim — don't reverse it
  by adding an unrestricted `onlyOwner` withdraw. The part that **is** a
  genuine, undisclosed gap is that there's no reverse-direction trade path
  at all, so funds that convert to `QUOTE_ASSET` have no way back through
  normal strategy operation either. **Decision: fix this via real
  round-trip arbitrage (Task 3.3), not a settlement/withdrawal lifecycle.**

### Task 3.1 — Harden replay-key derivation

Verified in `ASCTreasuryJournal.sol`: `actionKey` is derived from `factKey`,
`ActionType`, `msg.sender`, and a caller-supplied `decisionNonce`. Since the
contract doesn't verify the nonce is deterministically derived, two
different registered agents (or the same agent with a different nonce)
could each execute against the same underlying fact — bypassing the
"one execution per fact" intent, even though each individual execution is
still bounded by the normal guardrails.

- [x] Derive `actionKey` from `keccak256(abi.encode(address(this), factKey, ActionType.ARBITRAGE))` —
      remove `msg.sender` and `decisionNonce` from the on-chain uniqueness
      source. If per-run idempotency still needs a nonce for off-chain
      bookkeeping, keep it there, but don't let it affect on-chain identity.
      _(Done 2026-09-05: contract + `agent/src/keys.ts` + `tenantRunner.ts`
      updated in lock-step; the nonce stays an off-chain-derived, on-chain-
      ignored calldata field so crash/retry calldata stays deterministic.)_
- [ ] If multiple legitimate executions per fact are ever intended, commit
      all economically relevant action parameters into the key instead of
      just fact + type.
- [x] Add tests: same fact + different nonce must not both execute; same
      fact + different registered agent must not both execute.

### Task 3.2 — Label source-price authenticity honestly

Verified: `PriceObservation.observePrice(uint256 price)` is permissionless
and accepts any value — already partially disclosed in the contract's own
comment ("NOT a real price oracle"), but the product narrative elsewhere
doesn't consistently reflect that this is a self-controlled demo input, not
an independent market fact.

- [ ] On the `/status` page (Part 1, Phase 2, item 17) explicitly label the
      source price as demo-controlled, not a live market oracle.
      _(No `/status` route exists yet — that page is Part 1 Phase 2 item 17.
      The label currently lives on the Home hero (beat 02), README, and HELP;
      carry it into the status page when built.)_
- [x] Audit README/hero/docs copy for any phrasing that implies the source
      price is independently verified market truth rather than an attested
      *observation of a value someone supplied*. Attestcoin proves the
      observation happened; it doesn't prove the value was real. Say that.
      _(Done 2026-09-05: Home hero beat 02, README, and HELP now state this.)_
- [x] Longer-term (not required now): a real DEX-state-derived source price
      adapter, tracked as a roadmap item, not a near-term task.
      _(Done 2026-09-05: tracked in docs/ROADMAP.md known-limitations.)_

### Task 3.3 — Fund-mobility: implement round-trip arbitrage

Real, undisclosed gap: execution is one-directional (`BASE_ASSET →
QUOTE_ASSET` only, verified in the contract), with no reverse-direction
trade and no withdrawal function. Funds that convert to `QUOTE_ASSET`
currently have no path back to `BASE_ASSET` through any normal,
non-privileged means. This is separate from the (correct, keep-as-is)
decision not to add an admin withdraw.

**Decision made: implement real round-trip arbitrage** (not a settlement/
withdrawal lifecycle). Generalize the destination-chain leg so the treasury
can trade in either direction — `BASE_ASSET → QUOTE_ASSET` or
`QUOTE_ASSET → BASE_ASSET` — depending on which way the observed gap
actually runs, rather than being hardcoded to a single direction. This is
the more product-honest fix: it makes "arbitrage" mean an actual completed
cycle, and it solves fund-mobility as a side effect without ever needing an
admin withdraw path.

Note on architecture: the current "source" (Sepolia `PriceObservation`) is a
price fact, not a tradable venue — there's no real liquidity to execute a
matching leg against on that side (see Task 3.2). So this isn't an atomic,
same-transaction two-leg trade across two markets; it's the destination
treasury being able to trade **either direction** against the destination
DEX as the gap flips over time, which is the realistic form "round-trip"
takes given the current architecture. True dual-venue execution would
require the source chain to become tradable too — that's a separate,
larger scope item, not part of this task.

This task and **Task 3.5 (explicit direction encoding)** must be done
together — direction has to be determined and validated before the correct
swap path can be chosen.

- [x] Decision made: (a) round-trip arbitrage
- [x] Generalize `executeArbitrage`'s DEX leg to accept and execute either
      direction, chosen by which way `arbWidthBps` indicates the opportunity
      runs (see Task 3.5 for the direction-encoding mechanics).
- [x] Apply guardrails (max trade size, slippage) symmetrically regardless
      of which asset is being sold in a given execution.
- [x] Update the agent's decision engine to propose a direction, not just an
      act/skip boolean.
- [x] Copy fix: once this ships, "arbitrage" is an accurate description
      again. Until it ships, keep describing the current one-way flow as
      "verifiable, custody-constrained cross-chain execution" rather than
      "arbitrage," which implies a completed cycle that doesn't exist yet.
- [x] Add tests: execution in both directions, correct guardrail application
      per direction, and that direction is never inferred incorrectly from
      the gap sign.
      _(All five done 2026-09-05: `executeArbitrage` takes a caller-proposed
      `TradeDirection`, validated on-chain against the sign of
      (destPrice − confPrice) — the opposite direction reverts with
      `WrongTradeDirection`. `_executeTrade` runs either leg; the symmetric
      cap (BASE-denominated exposure ≤ MAX_TRADE_SIZE) is asserted per
      direction. Agent proposes direction deterministically via
      `directionFor(confPrice, destPrice)`, never an LLM judgment; journal
      payload and replay viewer carry it. Tests: `test_ExecutesSellDirection`,
      buy-path balance assertions, `test_RevertOnWrongTradeDirection` (both
      directions + corrected-retry). Round-trip now exists, so "arbitrage" is
      an accurate description again.)_

### Task 3.4 — Net-profitability guard

Verified as a real gap: guardrails check gross arbitrage width and bounded
trade size, but nothing accounts for fees, slippage, or gas cost against the
opportunity. A gross-positive gap can still be net-unprofitable.

- [x] Add a `MIN_NET_EDGE_BPS`-style guardrail (or equivalent) that nets out
      estimated fees/slippage/gas from the gross gap before approving
      execution.
- [x] Add tests for opportunities that pass gross width but fail net
      profitability.

### Task 3.5 — Encode trade direction explicitly

`_bpsGap()` computes a symmetric percentage gap and loses which direction
the opportunity actually runs. **This is now a hard prerequisite for Task
3.3**, not just a related improvement — round-trip arbitrage can't choose
the correct swap path without it.

- [x] Encode source/destination direction explicitly rather than inferring
      it from an absolute gap.
- [x] Reject execution in a direction the treasury's current policy/strategy
      doesn't support.
- [x] Add wrong-direction rejection tests.
      _(Done 2026-09-05: signed `TradeDirection` proposal validated on-chain —
      direction-aware edge math with per-direction denominators replaces the
      old absolute `_bpsGap` inference; `WrongTradeDirection` reverts for the
      unsupported direction; `test_RevertOnWrongTradeDirection` covers both
      directions plus a corrected-retry assertion.)_

### Task 3.6 — Strengthen proof/confirmation validation

Not independently verified line-by-line against the current contract in
this session — plausible and consistent with the rest of this review's
accuracy, but confirm against the current code before implementing.

- [x] Verify `confirmProof.chainKey` equals `sourceProof.chainKey` where
      that relationship is required.
- [x] Verify `_decodePriceObservation` checks `bytes4(data)` equals
      `observePrice(uint256).selector` before decoding, rather than
      assuming the shape.
- [x] Expand journal/proof records to include: source chain identifier,
      source block height, source tx hash, confirmation block height,
      confirmation tx hash, destination execution tx hash — enough to
      independently reconstruct evidence without out-of-band information.

### Task 3.7 — Fix timestamp semantics

`attestedAt` is currently set at execution time, conflating three distinct
moments: when the source was observed, when it was confirmed, and when
execution actually happened.

- [x] Track source-observed time, confirmation-observed time, and
      destination-execution time as separate fields.
- [x] Prefer block/transaction identifiers over timestamps alone for
      deterministic evidence where possible.

### Task 3.8 — Trade-size rounding and constructor validation

- [x] `_boundedTradeSize()` can round down to zero under some guardrail
      combinations — add explicit non-zero validation (or constrain at
      configuration time so this combination can't occur).
      _(Done 2026-09-05: zero-size is reachable only for `maxTradeSize ∈ {1,2,3}`
      — `scaled = maxTradeSize·w/(minW·4)` floors to `maxTradeSize/4` at the min
      width — so `validateGuardrails` now rejects `maxTradeSize < 4` at
      construction time; the factory pre-flight inherits it automatically.)_
- [x] The factory validates verifier/router/asset/price-contract addresses
      and guardrails; direct `ASCTreasuryJournal` construction doesn't fully
      mirror that validation. Add the same non-zero dependency checks
      directly to the contract's constructor, or centralize validation so
      it can't drift between the two paths.
      _(Done 2026-09-05: constructor zero-address gate added, `InvalidChainConfig`,
      mirroring the factory.)_

### Task 3.9 — Guard `renounceOwnership`

Real, cheap, standard fix: `Ownable.renounceOwnership()` is still available.
If called after an agent is registered, the agent stays authorized forever
with no owner left able to deregister it.

- [x] Wrong-direction execution is rejected (Task 3.5)
- [x] Override `renounceOwnership` to revert, or require an explicit
      finalization step (e.g. deregistering all agents first) before
      allowing it.

### Task 3.10 — Decision-commitment completeness

The hashed reasoning payload currently commits to a subset of fields
(observed gap, prices, rule, rationale, timestamp) but not the full decision
context.

- [ ] Include the ACT/DECLINE outcome itself and full decision context in
      the committed hash, not just the inputs that led to it.

### Task 3.11 — Deployment script cleanup

Not independently verified in this session — check before deleting
anything.

- [x] Check whether `Deploy.s.sol` still uses an old constructor signature
      that doesn't match the current `Guardrails`-based constructor.
- [x] Check whether `deploy-creditcoin.js` references `isRegisteredAgent`
      where the contract actually exposes `registeredAgents`.
- [x] Pick one canonical deployment path (likely the factory-based flow, if
      that's the current intended architecture) and delete or clearly mark
      the others as legacy/reference-only.
- [x] Regenerate ABI artifacts deterministically as part of the canonical
      deploy flow.

### Task 3.12 — Documentation reconciliation

- [ ] Create one short "Current Reality" doc (or a section at the top of
      `README.md`) stating current, actual status: LLM provider (Gemini
      only — despite architecture/help docs mentioning OpenAI/Mistral), DEX
      (`MockDexRouter` — despite PRD language referencing PenguinSwap/real
      USDC), demo-mode default, and known limitations (link to `DESIGN.md`
      §9).
- [ ] Align `PRD.md`, `ROADMAP.md`, `DEVLOG.md`, and the in-app Help/docs
      page against that single source of truth — fix stale `/app` route
      references in `ROADMAP.md` specifically.

### Task 3.13 — Expanded adversarial + invariant test suite

Extends Part 2 Task F (CI). Add these as new test cases once the
corresponding fixes above land — most are meaningless to write before the
underlying fix exists:

- [x] Same fact + different nonce does not execute twice (Task 3.1)
- [x] Same fact + different registered agent does not execute twice (Task 3.1)
- [x] Wrong-direction execution is rejected (Task 3.5)
- [x] Invalid/cross-chain-mismatched confirmation proof is rejected (Task 3.6)
- [x] Opportunity below net profitability (after fees) is rejected (Task 3.4)
- [ ] Zero-computed trade size is rejected (Task 3.8)
- [ ] Every successful fund movement corresponds to exactly one journal entry
- [ ] Trade size never exceeds `maxTradeSize`; slippage never exceeds `maxSlippageBps`
- [ ] Guardrails remain immutable across the contract's lifetime
- [x] `renounceOwnership` cannot leave a registered agent permanently unremovable (Task 3.9)

## Part 3 progress log

- Task 3.1: ✅ 2026-09-05 — `actionKey` now `keccak256(abi.encode(address(this),
  factKey, ARBITRAGE))`; `msg.sender` + `decisionNonce` removed from on-chain
  identity. Lock-step updated: `agent/src/keys.ts`, `agent/src/tenantRunner.ts`
  pre-flight, `agent/test/keys.test.ts`. Both new on-chain tests pass; both
  existing replay tests still pass (now strictly stronger).
- Task 3.2: ✅ 2026-09-05 (copy audit) — Home hero, README, and HELP state the
  Sepolia source price is demo-controlled, not an independent oracle; the
  real-adapter item is tracked in docs/ROADMAP.md. The `/status`-page label
  itself is deferred until Part 1 Phase 2 builds that page.
- Task 3.3: ✅ 2026-09-05 — round-trip arbitrage shipped (see Task 3.3's
  checked list for the full summary; 26 contract tests / 40 agent tests pass).
- Task 3.4: done 2026-09-05 — contract gate `MIN_NET_EDGE_BPS=25` (gross must clear per-instance floor + reserve); agent mirror: `netEdgeBps`/`edgeBps` return net so the LLM reasons about the tradeable edge; regression test `test_RevertWhenGrossWindowClearsFloorButNotNetEdge` (90bps gross vs 105 required); forge 27/27, vitest 40/40, tsc clean
- Task 3.5: ✅ 2026-09-05 — direction encoded explicitly (see Task 3.5's
  checked list for the full summary).
- Task 3.6: done 2026-09-05 — premises re-verified against code first (all
  three real, as suspected). `ChainMismatch` now reverts before any
  verification work is spent; `_decodePriceObservation` validates
  `OBSERVE_PRICE_SELECTOR` (length alone no longer implies shape);
  `JournalEntry` carries source chainKey/blockHeight/txIndex + confirm
  blockHeight/txIndex. The destination execution tx hash is deliberately NOT
  a struct field — the EVM cannot observe its own tx hash; it is documented
  as the receipt hash of the tx emitting `ActionJournaled` for that
  actionKey. Frontend decodes the 13-field struct tolerantly (legacy
  8-field fallback for the two live pre-3.6 instances); committed agent +
  frontend ABIs regenerated from the forge artifact (13 fields asserted);
  forge 30/30, agent vitest 40/40, frontend build + oxlint clean.
- Task 3.7: done 2026-09-05 — `attestedAt` REMOVED from JournalEntry (it was
  fabricated: set to execution `block.timestamp` while claiming to mark
  attestation). The observation moments are recorded as the verifier-attested
  `sourceBlockHeight`/`confirmBlockHeight` (Task 3.6) — deterministic block
  identifiers, which this task explicitly prefers over timestamps, and the
  only honest option: a Creditcoin contract cannot read a Sepolia block's
  timestamp, and a timestamp inside the permissionless observation call would
  be untrusted self-reported input. `actedAt` remains the single
  destination-execution time. Struct now 12 fields; ABIs regenerated with a
  12-field assertion; ReplayCard and the agent's replay CLI show block
  heights instead of the fake timestamp. One latent 3.6 miss caught here:
  the 3.6 ABI regen had silently rewritten the agent's ABI JSONs from
  artifact-objects to bare arrays, breaking 4 `.abi` call sites that vitest
  never exercised at runtime (all mocked) — consumer sites now use the array
  directly; forge 30/30, agent vitest 40/40 + tsc clean, frontend
  build + oxlint clean.
- Task 3.8: ✅ 2026-09-05 — constructor now mirrors the factory's zero-address
  dependency gate (`InvalidChainConfig`); `maxTradeSize < 4` rejected in
  `validateGuardrails` (see Task 3.8 checkbox note for the rounding analysis).
- Task 3.9: ✅ 2026-09-05 — `renounceOwnership` overridden to revert
  (`CannotRenounceOwnership`); owner-control test added.
- Task 3.10: not started (scoping note: the on-chain contract only ever sees
  executions — rejections revert — so "the ACT/DECLINE outcome in the committed
  hash" needs re-scoping to the agent-side reasoning payload first)
- Task 3.11: done 2026-09-05 — BOTH flagged premises verified (see Task 3.11
  checkboxes; the first was worse than stale: a clean `forge build` FAILED on
  `Deploy.s.sol` (6-arg constructor vs current 7-arg `Guardrails`), i.e. the repo
  could not build from fresh and CI would fail on a new runner — local passes were
  riding a stale cached artifact). Canonical path is the factory flow;
  `Deploy.s.sol` + `deploy-creditcoin.js` deleted (git history keeps them).
  NEW: `contracts/script/update-abis.js` — deterministic client-ABI regeneration
  from forge artifacts with loud structural gates (JournalEntry 12-field list,
  executeArbitrage/createTreasury/TreasuryDeployed presence); documented as step 4
  of the DEPLOYMENT.md Step-3 runbook, which was rewritten from the legacy
  single-treasury flow to the canonical factory flow.
- Task 3.12: not started
- Task 3.13: 4 of 10 items done (same-fact-different-nonce ✓,
  same-fact-different-agent ✓, renounceOwnership ✓, wrong-direction
  rejection ✓); the rest gated on their fixes


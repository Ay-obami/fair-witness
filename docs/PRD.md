# PRD: Fair Witness

*(an attested custody-free arbitrage journal)*

**BUIDL CTC 2026 Fall — Creditcoin AI Track**

---

## 1. Overview

An autonomous cross-chain arbitrage system for Creditcoin where an LLM-driven agent decides *whether* to act, but never holds funds and never executes directly. All capital sits in an on-chain ASC treasury that enforces rigid, pre-committed bounds and executes exclusively through a single Attestcoin-verified, replay-safe entry point. Every execution — and every rejected attempt — is written to an on-chain journal that lets anyone reconstruct exactly why a given trade happened, with the underlying facts independently verifiable against Sepolia.

**Core claim being demonstrated:** manipulation-resistant, custody-free, fully auditable autonomous execution — explicitly *not* a speed-competitive arbitrage bot.

---

## 2. Goals / non-goals

**Goals**
- Prove the ASC only ever moves funds through one verify-gated, journaled function (custody separation is a testable architectural property, not a design intention).
- Prove replay-safety under a simulated crash/retry.
- Prove the audit trail is tamper-evident (on-chain `decisionHash` matches independently-retrieved off-chain reasoning).
- Ship a live, working demo on public testnets (Sepolia + Creditcoin testnet) with a working integration to the Attestcoin Block Prover precompile.

**Non-goals**
- Not competing on execution speed with real MEV/arbitrage bots.
- Not a production-grade AMM — relies on PenguinSwap (Creditcoin testnet) rather than custom DEX math.
- Not solving the general "cross-chain rehypothecation" or full historical proof-of-reserve problem — out of scope for this submission.
- Not attempting bidirectional cross-chain execution — Attestcoin's read-only, one-directional nature is a stated constraint, not a bug to work around.

---

## 3. Locked spec & stack decisions

| Decision | Choice | Rationale |
|---|---|---|
| Source chain | Sepolia only | Simplest for a solo 3–4 week build; avoids doubling integration surface |
| Destination DEX (Creditcoin side) | **PenguinSwap** (Creditcoin testnet) | Official, already-live Creditcoin DEX — stronger judging narrative than a mock AMM, lower contract risk (reuse audited swap logic instead of writing bonding-curve math) |
| Trade asset | **Sepolia USDC** (Circle faucet: 20 USDC / address / chain / 2h) | Real recognizable stablecoin reads better to judges than a mock token; faucet throughput is sufficient once `MAX_TRADE_SIZE` is scaled to demo-appropriate amounts (single-digit USDC, not thousands) |
| Decision layer | **LLM makes the act/don't-act call**, within the contract's rigid numeric bounds | Per your choice — see §7 for the determinism handling this requires |
| LLM provider | **Google Gemini** (AI Studio free tier) — no card required, native structured/JSON output, ~1,500 req/day | No Anthropic API key available; Gemini is the strongest free-tier fit for structured decision output. Groq flagged as a fallback if latency becomes a bottleneck |
| Contracts | Solidity / Foundry | Matches your existing background directly |
| Agent runner | TypeScript, `@gluwa/usc-sdk` | Matches SDK's native language; you're already comfortable with TS |
| Demo deliverable | CLI (agent logs) **+** minimal frontend (replay/audit viewer) | Per your choice |

---

## 4. Actors

- **Agent Runner (off-chain, TypeScript process).** Polls Sepolia, calls Gemini for the act/don't-act decision, generates proofs via `ProofBuilder`, submits to the ASC. Holds a low-privilege key with **zero token balance/allowance** — pays gas only.
- **ASCTreasuryJournal (Creditcoin smart contract).** Holds all treasury funds. Sole authority to move them. Verifies proofs via the Block Prover precompile (`0x0FD2`). Enforces rigid bounds. Writes the journal.
- **Replay Viewer (frontend, read-only).** Given an `actionKey`, reconstructs and displays the full attestation → decision → action chain, including the on-chain/off-chain hash match check.
- **Judge / reviewer.** Consumes the CLI logs live, then inspects specific past actions via the Replay Viewer.

---

## 5. Functional requirements

### FR1 — Fact detection
The agent runner shall poll a designated Sepolia price-observation contract (or PenguinSwap-comparable pair, simulated on Sepolia via a toy pair contract if no natural pair exists) and detect price observations.

### FR2 — LLM-gated decision
On detecting a price gap, the agent shall query Gemini with the observed source price, the current PenguinSwap quote, and the fixed rule set, and receive a structured (JSON) act/don't-act decision plus a natural-language rationale.
- The LLM call **must** be made with `temperature: 0` and a fully deterministic prompt (no timestamps, no randomness in the input) so that a retry of the *same underlying fact* reliably reproduces the *same* decision — this is required for FR5 (replay safety) to hold when the decision-maker is a non-deterministic-by-default LLM.
- The contract does not trust the LLM's decision alone — it independently re-checks the numeric bounds (§6) regardless of what the LLM concluded. The LLM can only say "don't act" more conservatively than the contract would require; it cannot loosen the contract's bounds.

### FR3 — Dual-proof verification
Before executing, the contract shall verify two Attestcoin proofs: the original price-observation proof, and a second, later confirmation proof, per the drift-check design (§6).

### FR4 — Rigid-bounds execution
The contract shall execute the trade only if all bounds in §6 are satisfied, regardless of the LLM's recommendation.

### FR5 — Replay safety
Resubmitting a proof set + decision for a fact already acted upon shall be a no-op (rejected on-chain, and short-circuited off-chain before gas is spent where possible).

### FR6 — Journaling
Every execution (and, for demo purposes, every rejection) shall be logged with enough information to reconstruct the full causal chain.

### FR7 — Replay viewer
Given an `actionKey`, the frontend shall display: the source fact (with a link to the Sepolia explorer for independent verification), the retrieved off-chain reasoning, a live hash-match confirmation against the on-chain `decisionHash`, and the exact action executed.

### FR8 — Custody invariant
No function in the ASC other than the single gated execution entry point shall be capable of moving treasury funds.

---

## 6. Non-functional requirements / rigid bounds (initial values — confirm after week-1 latency benchmarking)

```solidity
uint256 public constant MAX_TRADE_SIZE = 5e6;          // 5 USDC (6 decimals) — demo-scaled, not production
uint256 public constant MAX_SLIPPAGE_BPS = 150;          // 1.5%
uint256 public constant MIN_ARB_WIDTH_BPS = 80;          // must exceed measured attestation-lag noise floor
uint256 public constant MAX_DRIFT_BPS = 100;              // between source proof and confirm proof
uint256 public constant MAX_CONFIRM_GAP_BLOCKS = 20;      // how stale the confirm proof may be
uint256 public constant MAX_ACTIONS_PER_EPOCH = 6;
```
`MIN_ARB_WIDTH_BPS` and `MAX_CONFIRM_GAP_BLOCKS` are placeholders — **week 1 includes measuring actual Sepolia-attestation-to-Creditcoin-verification wall-clock latency** and setting these from real numbers, not guesses (this was flagged as a hard requirement in the earlier technical constraints review).

---

## 7. Determinism requirement (LLM-specific — new since the decision layer choice)

Because the LLM now makes the actual call rather than a pure rules engine, replay-safety (FR5) depends on the LLM being effectively deterministic for a given fact. Concretely:
- `temperature: 0`, fixed system prompt, fixed few-shot examples (if any) — versioned and included in the repo.
- The agent runner **caches** the LLM's decision keyed by `factKey` locally, so a crash-and-restart re-derives the same decision from cache rather than re-querying Gemini (belt-and-suspenders against the small residual non-determinism even top-p=0/temperature=0 settings can have across provider-side changes).
- `decisionNonce` is still derived from `(factKey, actionType, srcPrice, destPrice)` per the earlier design — **not** from the LLM's raw output text, so a harmless wording difference in the LLM's rationale between two calls doesn't accidentally change the nonce and break replay-safety.

---

## 8. System architecture

```
Sepolia (toy price contract / USDC pair)
        │  polled read-only
        ▼
Agent Runner (TS, @gluwa/usc-sdk, no fund custody)
        │  observed prices + fixed rules
        ▼
Gemini API (temp=0, structured JSON decision + rationale)
        │  decision + decisionHash (cached by factKey)
        ▼
ASCTreasuryJournal.sol  (Creditcoin, USC/EVM)
        │  verify() x2 via 0x0FD2 → rigid bounds check → execute via PenguinSwap → journal write
        ▼
PenguinSwap (Creditcoin testnet)          Journal storage (on-chain)
                                                    │
                                                    ▼
                                        Replay Viewer (frontend, read-only)
```

---

## 9. Data model

```solidity
struct JournalEntry {
    bytes32 factKey;
    bytes32 actionKey;
    uint64  attestedAt;
    uint64  actedAt;
    address agent;
    bytes32 decisionHash;
    ActionType actionType;
    bytes actionPayload;   // abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps)
}
mapping(bytes32 => bool) public executedActions;
mapping(bytes32 => JournalEntry) public journal;
bytes32[] public journalIndex;
```

Off-chain reasoning store (simple KV — file-based or a lightweight DB is fine for the hackathon; no need for IPFS unless time allows): `decisionHash -> { observedGapBps, sourcePrice, confirmPrice, llmRationale, rule, timestamp }`

---

## 10. Acceptance criteria (map directly to Foundry tests — build these before the agent runner)

1. No function other than `executeArbitrage` can move treasury funds (fuzzed call-surface test).
2. `token.balanceOf(agentAddress) == 0` invariant holds across a fuzzed sequence of calls.
3. Identical proof + nonce submitted twice → second call reverts.
4. Deterministically-re-derived nonce from a simulated crash/retry → second call reverts (not just literally-identical calldata).
5. `confirmProof` outside `MAX_DRIFT_BPS` of `sourceProof` → reverts.
6. Arb width under `MIN_ARB_WIDTH_BPS` → reverts.
7. `MAX_ACTIONS_PER_EPOCH + 1`th valid call in an epoch → reverts.
8. Journal `decisionHash` for a successful execution matches `keccak256` of the stored off-chain reasoning payload.

---

## 11. Timeline (3–4 weeks, solo)

- **Week 1:** Toy Sepolia price contract(s) deployed. Single-proof `verifyAndEmit()` working end-to-end. Measure real gas + attestation latency → finalize §6 constants. Confirm PenguinSwap testnet pool/pair availability for your asset; seed liquidity if needed.
- **Week 2:** `ASCTreasuryJournal.sol` complete. All 8 Foundry tests from §10 passing before moving on.
- **Week 3:** Agent runner (polling, Gemini integration with temp=0 + caching, `ProofBuilder` usage, dual-proof submission). Replay viewer (minimal frontend).
- **Week 4:** Buffer, adversarial live-demo rehearsal (show a stale/manipulated/duplicate proof getting cleanly rejected), documentation, gas/latency numbers written up honestly.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| PenguinSwap testnet lacks liquidity for your pair | Budget week-1 time to seed a small pool yourself; fall back to a toy pair contract on Creditcoin testnet only if genuinely blocked |
| Gemini free-tier rate limits (~1,500/day) hit during heavy testing | Cache decisions by `factKey` (already required for determinism, doubles as rate-limit mitigation); switch polling interval up during dev, down for demo |
| Attestation latency higher than expected, no arb window survives it | This is itself a valid, honest finding — document it and adjust `MIN_ARB_WIDTH_BPS` and the framing ("here's the measured latency floor this architecture requires") rather than hiding it |
| Non-EVM confusion — confirm Sepolia is definitely supported as an Attestcoin source chain | Call `ChainInfo.getSupportedChains()` on day one, per earlier constraints review |

---

## 13. Judging-criteria mapping

- **Working integration code** → live Sepolia + Creditcoin testnet deployment, real `verifyAndEmit()` calls, visible on both explorers.
- **Technical documentation** → this PRD + the earlier design doc's honest-limitations sections, condensed into the submission README.
- **Novelty / differentiation** → custody separation + replay-safe journal + LLM-gated-but-contract-bounded execution, explicitly scoped away from speed-competitive arbitrage and from the existing Oracle-Free Council pattern (payment/execution auditability angle, not a reasoning "council").

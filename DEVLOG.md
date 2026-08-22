# Development Log

Running record of design decisions, pitfalls, and status. Updated as the build
progresses — see `docs/PRD.md` for the spec this build follows and `docs/DESIGN.md`
for the original architecture write-up.

---

## Status snapshot

**Last updated:** Build session 5 (deployment docs — build complete for this sandbox's scope)

| Component | Status |
|---|---|
| Contracts — interfaces | ✅ Done |
| Contracts — `ASCTreasuryJournal.sol` core | ✅ Done |
| Contracts — mocks (verifier, DEX, ERC20) | ✅ Done |
| Contracts — acceptance tests (8 from PRD §10) | ✅ Done — 11/11 passing (8 required + 3 bonus) |
| Contracts — deploy scripts | ✅ Done |
| Contracts — toy Sepolia `PriceObservation.sol` | ✅ Done |
| Agent runner (TypeScript) | ✅ Done — full poll→decide→prove→submit loop + replay CLI |
| Agent runner unit tests | ✅ Done — 16/16 passing, incl. cross-language hash parity vs `cast` |
| Frontend (React + Tailwind replay viewer) | ✅ Done — demo mode (mock data) + live mode, builds clean |
| `docs/DEPLOYMENT.md` | ✅ Done — 7-step copy-paste guide for a machine with real RPC/API access |
| Live testnet deployment | ⬜ **Cannot be done from this sandbox** — no RPC/API access. Follow `docs/DEPLOYMENT.md` from a normal machine. |
| **Top open risk:** on-chain price decoding vs real `encodedTransaction` envelope | ⬜ Unresolved — blocks step 4 of deployment. See session-3 SDK research entry. |

**Everything that could be built, tested, and verified without live network access is
done.** 27 automated tests total (11 Foundry, 16 vitest), all passing. Two structural
integration risks remain open and are documented, not hidden: the real
`encodedTransaction` decoding (blocking), and PenguinSwap's unconfirmed real ABI
(probably fine, needs a 10-minute check). Both have a clear, actionable next step in
`docs/DEPLOYMENT.md`.

---

## Environment notes (sandbox-specific — irrelevant on a normal dev machine)

- This build environment's network is allowlisted to package registries + GitHub only.
  No general RPC access, no Attestcoin/Creditcoin endpoints, no Gemini API, no Circle
  faucet. Everything here is built and tested locally/mocked; live deployment happens
  from your machine using the scripts and docs this repo ships with.
- **Pitfall: Foundry's default solc auto-download was blocked** (`binaries.soliditylang.org`
  not reachable from this sandbox). Worked around by downloading `solc-static-linux`
  v0.8.24 directly from the `ethereum/solidity` GitHub release assets (that host **is**
  allowlisted) and pinning `foundry.toml`'s `solc` field to the local binary path. This
  pin is sandbox-specific — remove it on a normal machine, or leave it, it still works if
  the binary is present.

---

## Design decisions

### Decision: `INativeQueryVerifier` interface is a reconstruction, not a confirmed ABI
The public Attestcoin/Creditcoin docs describe the verification *mechanism*
(Merkle inclusion + continuity proof, checked via precompile `0x0FD2`) but no canonical
Solidity interface/ABI for that precompile was found during the earlier research pass.
`src/interfaces/INativeQueryVerifier.sol` is our best-effort reconstruction of that
surface (`verify` / `verifyAndEmit`, taking `MerkleProof` + `ContinuityProof` structs),
built to match the shape implied by the reference `ASCMinter.sol` pattern and the
`usc-sdk`'s proof-building API. **This is the single highest-risk unknown in the whole
project** — flagged explicitly in the interface file itself. Week 1 of real deployment
work (per the PRD) must confirm this against the actual precompile ABI or SDK-generated
bindings before anything here is trusted for a live integration.

### Decision: dual-proof staleness handling lives in the contract, not just the agent
`executeArbitrage` requires *two* Attestcoin proofs (an original observation +
a later confirmation) and enforces `MAX_DRIFT_BPS` / `MAX_CONFIRM_GAP_BLOCKS` on-chain,
not just as agent-side heuristics. This was a deliberate choice: putting the staleness
check in the contract means it holds even if the agent runner has a bug, matching the
project's core "custody separation only means something if the rigid bounds are actually
rigid" argument from the design doc.

### Decision: bounds are `constant`, not owner-settable
`MAX_TRADE_SIZE`, `MIN_ARB_WIDTH_BPS`, etc. are Solidity `constant`s, not
owner-adjustable storage variables. This is intentional, not an oversight — an
owner-adjustable bound reintroduces a privileged-party trust assumption that undercuts
the "the agent can't be trusted but the bounds can" argument. Trade-off: if the real
measured attestation latency (from week-1 benchmarking) requires different values, the
contract must be **redeployed**, not reconfigured. That's the correct trade for a system
whose main selling point is that its bounds can't quietly change.

### Decision: no admin withdraw/sweep function on `BASE_ASSET`/`QUOTE_ASSET`
There is deliberately no `onlyOwner` function that can move treasury funds outside
`executeArbitrage`. This is load-bearing for the "custody-free, complete audit trail"
claim from the design doc — if an admin escape hatch existed, the journal's completeness
claim would be false. The real-world consequence (documented here so it isn't a surprise
later): if funds ever need to be recovered for a reason outside normal arbitrage
(e.g., decommissioning the project after the hackathon), the only path is deploying a
new contract and explicitly, publicly migrating — there is no quiet admin pull. Worth
saying explicitly in the submission docs as a *feature*, not a limitation.

### Decision: price-observation decoding assumes a fixed, self-controlled ABI
`_decodePriceObservation` assumes the source-chain transaction's calldata is
`abi.encode(uint256 price, uint8 status)` after a 4-byte selector. This only works
because we control the toy Sepolia price-observation contract ourselves (see PRD's
"toy source-chain price contracts", week 1). A production version pointed at an
arbitrary real DEX's swap event would need a per-source-contract decoder — explicitly
out of scope here, and noted in the contract's own comments so it isn't mistaken for a
general-purpose decoder later.

### Finding: `@gluwa/usc-sdk` is a real, published npm package — pulled its actual source
Session 3 had npm registry access, so rather than keep guessing at the SDK's shape, I
downloaded `@gluwa/usc-sdk@0.18.0` directly (`npm pack`) and read its real TypeScript
source and ABIs. Two significant findings, one reassuring and one that changes scope:

**Good news:** `src/interfaces/INativeQueryVerifier.sol`'s reconstruction (from session 1)
matches the real precompile almost exactly — same struct names (`MerkleProof`,
`MerkleProofEntry`, `ContinuityProof`), same `verify`/`verifyAndEmit` function names, same
overload pattern for single-vs-batch. The real block prover precompile address is
`0x0000000000000000000000000000000000000FD2`, confirming the earlier docs research. The
`ChainInfo` precompile is a **separate** address, `0x...0FD3` — worth not conflating the
two when someone later wires up `getSupportedChains()`.

**Real API surface (agent runner will use these directly, not hypothetical wrappers):**
- `proofProvider.service.ProofBuilder(chainKey, builderUrl)` — `.getProof(transactionHash)`
  (keyed by **tx hash**, not blockHeight/txIndex as earlier pseudocode assumed — corrected
  in the agent runner code), `.getBatchProof(hashes[])`, and its own
  `.waitUntilHeightAttested(chainKey, targetHeight, ...)` which polls the *proof builder
  service's* cache — separate from `chainInfo.PrecompileChainInfoProvider`'s own
  same-named method, which checks the on-chain precompile directly. These can disagree
  (proof-builder-cache lag vs on-chain truth) — the agent runner should treat the proof
  builder's version as "can I fetch a proof yet" and the ChainInfo precompile's version as
  "is it actually attested on-chain," and not assume they're interchangeable.
- `blockProver.PrecompileBlockProver(rpcProvider)` — `.verifySingle(...)` (read-only
  `staticCall`) and `.verifyAndEmitSingle(signer, ...)` (real tx, returns
  `ContractTransactionResponse`).
- `chainInfo.PrecompileChainInfoProvider(rpcProvider)` — `.getSupportedChains()`,
  `.getSupportedChainByKey(chainKey)`. **This answers the earlier open question** from the
  design doc about Solana/non-EVM support: the SDK's `ChainInfo` type includes a
  `chainEncoding` field per chain, implying multiple encodings are modeled, but the only
  encoder shipped in this SDK version is `encoding/abi/v1.ts` (EVM-style). Whether a
  Solana-compatible encoding exists is still not confirmed from the package alone — the
  PRD's "call `getSupportedChains()` against the live testnet on day one" step is still the
  right move, this just narrows what to look for.

**Scope-changing finding: `encodedTransaction` is not a simple custom payload.**
`encoding.abi.abiEncode(tx, receipt)` takes real ethers.js `TransactionResponse` +
`TransactionReceipt` objects and produces a full raw-transaction-envelope encoding,
decodable on-chain via a companion `EvmV1Decoder` ABI
(`decodeCommonTxFields`, `decodeReceiptFields`, `decodeTransactionType0/1/2`, found in
`utils/evmV1DecoderAbi.json`) — **not** the simple `abi.encode(uint256 price, uint8
status)` payload `ASCTreasuryJournal._decodePriceObservation` currently assumes. Extracting
a specific field (like a price) from that envelope for a given source contract is what the
SDK's `QueryBuilder` (`.setAbiProvider()`, `.eventBuilder()`,
`.addFunctionSignature()`/`.addFunctionArgument()`) is for.

**Consequence, stated plainly:** `_decodePriceObservation` in `ASCTreasuryJournal.sol` is
a **placeholder that will not work against a real Attestcoin proof** as currently written.
Fixing it means either (a) writing an on-chain decoder that calls into the real
`EvmV1Decoder` functions and extracts the right calldata/event offset for our specific toy
price contract, mirroring whatever `QueryBuilder` computes off-chain, or (b) a narrower
hackathon-scoped shortcut: use `QueryBuilder` off-chain to pre-compute exactly which byte
offsets in the encoded transaction hold the price, and hardcode a minimal on-chain slice
matching that fixed layout for our own toy contract only (not general-purpose, but
honest and correctly scoped for a demo against a contract we control). This is now the
single largest piece of real integration work left, ahead of anything in the agent runner
or frontend, and should be tackled in week 1 alongside the gas/latency benchmarking, using
a real Sepolia testnet transaction end-to-end before building anything else on top of it.


Surfaced while writing `script/Deploy.s.sol`, worth stating explicitly since it's easy to
misread: the treasury's `BASE_ASSET` is capital that already lives on Creditcoin (however
it got there — a separate, non-Attestcoin bridge/on-ramp, out of scope for this project).
The Sepolia USDC price the agent observes is used purely as an **external price signal**
to compute the arbitrage condition against PenguinSwap's on-Creditcoin quote — Attestcoin
never moves the USDC itself, consistent with its one-directional, read-only nature. If
this project's submission docs describe the flow, this distinction should be stated
explicitly: "we verify a fact about a price observed on Sepolia; we trade Creditcoin-side
capital in response" — not "we bridge USDC from Sepolia," which Attestcoin cannot do and
this contract does not attempt.



1. **Foundry's solc auto-download blocked in this sandbox** — see Environment notes above.
2. **Natspec comment parser chokes on a literal `@gluwa/usc-sdk`** in a `///` doc comment
   — Solidity's doc-comment parser treats any `@word` as a custom tag attempt and errors
   if it doesn't recognize it. Fixed by rewording to avoid a leading `@` in prose within
   doc comments. Minor, but worth remembering for any future doc comments referencing
   npm-scoped package names.
3. **Stack-too-deep in `executeArbitrage`** — too many local variables (proof data,
   decoded prices, computed bounds) for the legacy codegen path. Fixed by enabling
   `via_ir = true` in `foundry.toml`. Slightly slower compiles, no behavior change.
4. **PenguinSwap's real ABI unconfirmed** — same category of risk as the verifier
   interface. `IDexRouter` assumes a standard Uniswap-V2-style `getAmountOut` /
   `swapExactTokensForTokens` surface, which is the common pattern but not confirmed
   against PenguinSwap's actual deployed contract (no network access to check from this
   sandbox). Flagged in the interface file; must be confirmed in week 1.
5. **`ethers` type-identity mismatch between our install and `usc-sdk`'s bundled types**
   — TypeScript rejected passing our `ethers.JsonRpcProvider` into
   `PrecompileBlockProver`/`PrecompileChainInfoProvider` constructors, even though only
   one `ethers` package is actually installed (`find node_modules -name ethers` confirms
   this). Root cause: TypeScript treats classes with private fields as nominally typed,
   so the SDK's bundled `.d.ts` (compiled against `ethers@^6.15.0`'s private-field brand)
   structurally differs from our installed `6.17.0`'s brand even though they're
   behaviorally identical at runtime. Worked around with an explicit
   `as unknown as ConstructorParameters<...>[0]` cast at the two call sites, documented
   inline. Worth re-checking whether this still reproduces if `usc-sdk` or `ethers`
   versions are bumped later.
6. **Test fixture used malformed Ethereum addresses** — `ethers` v6 rejected them
   outright as invalid. Fixed by generating real addresses via
   `ethers.Wallet.createRandom().address` instead of hand-typing placeholder hex.

---

## Test suite (contracts)

11 tests, all passing (`forge test`): the 8 required acceptance criteria from PRD §10,
plus 3 bonus tests (unverified-proof rejection, unregistered-caller rejection, and the
happy-path execution the others build on).

Mapping to PRD §10:
1. `test_NoOtherFunctionCanMoveFunds` → #1 (custody invariant, probes for escape hatches)
2. `testFuzz_AgentNeverHoldsFunds` → #2 (fuzzed over 1–6 sequential executions)
3. `test_RevertOnExactReplay` → #3
4. `test_RevertOnDeterministicNonceRetryAfterSimulatedCrash` → #4
5. `test_RevertOnExcessiveDrift` → #5
6. `test_RevertOnNarrowArbitrageWindow` → #6
7. `test_RevertOnEpochRateLimitExceeded` → #7
8. `test_JournalDecisionHashMatchesOffchainReasoning` → #8

**Gas numbers from this sandbox's mock verifier** (`forge test --gas-report`):
`executeArbitrage` averages ~423k gas (range ~30k on early-revert paths up to ~461k on a
full successful execution with two mock `verifyAndEmit` calls + a DEX swap). **This
number is not trustworthy for the real system** — the mock verifier's `verifyAndEmit` is
a single storage read, while the real Attestcoin precompile does actual Merkle +
continuity proof verification, which the docs describe as gas-optimized native execution
but with no published benchmark found during research. Treat ~423k as a floor, not an
estimate, and get the real number in week 1 against actual testnet proofs before
finalizing `MAX_ACTIONS_PER_EPOCH` or worrying about per-tx cost.

**Test design note:** criterion #1 (custody invariant) is tested by probing for common
"escape hatch" function selectors (`withdraw`, `sweep`, `emergencyWithdraw`, etc.) via
low-level calls and confirming none resolve — this is a reasonable proxy given the
contract's small, fully-reviewed function surface, but it is not an exhaustive
call-surface fuzzing tool. If the contract grows in a later iteration, this test should
be revisited rather than assumed to still cover the full surface.

---

## Agent runner (TypeScript) — what was built

- `config.ts` — env var loader with fail-fast validation.
- `keys.ts` — deterministic `factKey`/`decisionNonce`/`actionKey` derivation, written to
  mirror `ASCTreasuryJournal.sol`'s on-chain math field-for-field.
- `sepoliaWatcher.ts` — read-only Sepolia event polling. No wallet, no private key.
- `attestcoinClient.ts` — thin wrapper around the real, confirmed `@gluwa/usc-sdk`
  exports (`proofProvider.service.ProofBuilder`, `blockProver.PrecompileBlockProver`,
  `chainInfo.PrecompileChainInfoProvider`).
- `decisionEngine.ts` — Gemini (`@google/genai`) decision layer, `temperature: 0` +
  fixed `seed` + local cache for determinism (PRD §7).
- `reasoningStore.ts` — file-based KV for off-chain reasoning, keyed by `decisionHash`.
- `dexPriceReader.ts` — read-only PenguinSwap/router price quoting + `bpsGap` helper.
- `submitter.ts` — the only module that ever calls `executeArbitrage`; includes the
  pre-flight (gas-saving, not safety-critical) replay check.
- `index.ts` — the actual poll → decide → prove → submit loop, tying everything together.
- `replay.ts` — CLI: `npm run replay -- <actionKey>` reconstructs the full chain and
  prints the on-chain/off-chain hash-match check.

**Test suite (16/16 passing, `npx vitest run`):** covers `keys.ts` determinism —
including a cross-language ground-truth check computed independently via Foundry's
`cast keccak(abi-encode(...))`, asserting the TypeScript implementation produces
byte-for-byte identical output to the Solidity math it's meant to mirror, which is about
as strong a confidence check as is possible without a live chain — the reasoning store's
tamper-evidence property (`verifyHash` catching a modified payload), and the `bpsGap`
math against the exact fixture values used in the Foundry suite. No live network or real
LLM calls required, matching the PRD's "no live network needed" requirement for this
test tier.

**Known limitation carried over, not yet resolved:** `attestcoinClient.buildProof()`
returns the real SDK's `encodedTransaction` (`txBytes`) untouched, but
`ASCTreasuryJournal._decodePriceObservation` still can't correctly parse that real
envelope (see the session-3 SDK research entry above) — the agent runner is honestly
built end-to-end, but the full pipeline won't work against a live proof until that
contract-side decoding gap is closed. This is the single most important thing to tackle
before attempting a real testnet run.

---

## Frontend — what was built

React + Vite + Tailwind v4 (via `@tailwindcss/vite`, no separate config file needed).
Deliberately not a generic indigo/purple SaaS palette — a dark "forensic ledger"
aesthetic (near-black slate, monospace data, one teal "verified" accent, one amber
"alert" accent), matching the audit-tool nature of the actual product.

- `lib/types.ts` — mirrors the on-chain `JournalEntry` struct and the agent's
  `ReasoningPayload` type exactly. Note: had to convert `ActionType` from a TS `enum` to
  a `const` object + union type — Vite's template ships `erasableSyntaxOnly: true` in
  `tsconfig.app.json`, which rejects real TS enums since they compile to runtime code
  rather than being purely erasable. `agent/src/keys.ts` uses a real `enum` for the same
  concept without issue since its `tsconfig.json` doesn't set that flag — worth knowing
  the two tsconfigs in this repo don't accept identical syntax.
- `lib/mockData.ts` — three illustrative sample entries, not fetched from anywhere: a
  clean verified execution, a **deliberately tampered** reasoning payload (proves the
  mismatch detector actually catches something, not just always green), and a
  decisionHash with no retrievable reasoning (proves the UI shows an honest
  "unverifiable" state instead of guessing).
- `lib/contractReader.ts` — the live counterpart, reads a real journal entry via `ethers`
  and performs the same re-hash check. Flagged inline: `VITE_REASONING_API_URL` has to
  point at something that can actually serve the agent's local
  `agent/src/reasoningStore.ts` file-based payloads over HTTP — that gap is left
  explicitly open rather than papered over, tracked in `docs/DEPLOYMENT.md`.
- `lib/dataProvider.ts` — single switch point between mock and live data, controlled by
  `VITE_DEMO_MODE`.
- `components/`: `SearchBar` (with demo-mode quick-pick chips), `ReplayCard` (the three
  fact/decision/action sections), `VerdictBadge`, `DataRow`.

**Verification performed:** `tsc -b` clean, `npm run build` clean (453KB JS / 13KB CSS
gzipped to ~156KB/3.5KB), and a smoke test serving the production build via
`vite preview` + `curl` confirming the HTML/CSS assets actually serve with 200s. No
automated component tests were added for the frontend — given the remaining time budget,
priority went to the higher-risk contract/agent logic (which has real correctness
properties to verify) over UI rendering (which is comparatively low-risk and
visually self-evident when run). If time allows later, the mismatch-detection path
(`VerdictBadge` given `status={false}`) is the one component worth a real test, since
it's the one place a UI bug could silently hide a real problem.

---

## What's left (tracking against the PRD)

- [x] Foundry acceptance tests — the 8 tests from PRD §10 (custody invariant, replay
      safety incl. simulated crash/retry, drift/width rejection, rate limiting, journal
      hash-match)
- [x] Foundry deploy script
- [x] Agent runner (TypeScript) — full loop, real SDK integration, replay CLI
- [x] Agent runner unit tests
- [x] Frontend — demo mode + live mode, builds clean
- [x] `docs/DEPLOYMENT.md` — 7-step guide, including the reasoning-store-serving gap
      called out explicitly rather than left implicit
- [ ] **Resolve on-chain price decoding against the real `encodedTransaction` envelope**
      — the one item that requires code changes, not just infrastructure/config, before
      a live run works end-to-end. See "Scope-changing finding" above and
      `docs/DEPLOYMENT.md`'s "Before you start" section.

## Closing note for whoever picks this up next

This was built end-to-end (contracts → agent → frontend → deployment docs) in a
sandbox with no live network access, verifying every non-obvious claim against real
sources rather than guessing: the SDK's actual npm package, `forge`/`cast` as
ground-truth for Solidity math, and an actual production build + smoke test for the
frontend. Every real gap found along the way is logged above with what was tried, what's
still open, and where to pick it up — not smoothed over. The single highest-value next
session is resolving the `encodedTransaction` decoding gap using a real Sepolia
transaction, per `docs/DEPLOYMENT.md` step 1; everything else in this repo is ready to
build on top of that once it's solved.

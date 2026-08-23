# Development Log

Running record of design decisions, pitfalls, and status. Updated as the build
progresses — see `docs/PRD.md` for the spec this build follows and `docs/DESIGN.md`
for the original architecture write-up.

---

## Status snapshot

**Last updated:** Build session 7 — **LIVE on both testnets.** Two real Attestcoin-proven
executions on Creditcoin testnet, replay CLI verified with hash match, adversarial replay
rejected live, frontend + reasoning store on GitHub Pages.

| Component | Status |
|---|---|
| Contracts — interfaces | ✅ Done — `INativeQueryVerifier` **confirmed correct against the SDK's real precompile ABI** (session 7) |
| Contracts — `ASCTreasuryJournal.sol` core | ✅ Done — deployed & executing live |
| Contracts — mocks (verifier, DEX, ERC20) | ✅ Done — mock DEX is also the live demo DEX (see session 7 PenguinSwap finding) |
| Contracts — acceptance tests (8 from PRD §10) | ✅ Done — 14/14 passing (8 required + 6 bonus) |
| Contracts — deploy scripts | ✅ Done — `Deploy.s.sol` (forge script; note: broken on Creditcoin, see session 7 pitfall 5) + `deploy-creditcoin.js` (used for the real deployment) |
| Contracts — toy Sepolia `PriceObservation.sol` | ✅ Done — **live on Sepolia** `0x2343…00c7` |
| Contracts — real `encodedTransaction` decode | ✅ Done — **validated against a genuine live proof** (session 7: real txBytes match the implemented format) |
| Agent runner (TypeScript) | ✅ Done — **ran live end-to-end**: poll → attest → prove → LLM → submit → executed |
| Agent runner unit tests | ✅ Done — 16/16 passing |
| Frontend (React + Tailwind replay viewer) | ✅ Done — **live on GitHub Pages**, live mode reading real chain data |
| `docs/DEPLOYMENT.md` | ✅ Done — all 7 steps executed for real in session 7 |
| Live testnet deployment | ✅ **DONE** — addresses + tx hashes in the session-7 entry below |

**Automated tests:** 30 total (14 Foundry, 16 vitest), all passing. Remaining open item
(production-grade only): real PenguinSwap V3 integration to replace the demo's seeded
constant-product pair — documented with concrete integration notes in session 7.

---

## Environment notes

The original build environment (sessions 1-5) had an allowlisted network (package
registries + GitHub only) with this consequence:

- No general RPC access, no Attestcoin/Creditcoin endpoints, no Gemini API, no Circle
  faucet. Everything in those sessions was built and tested locally/mocked; live
  deployment was always meant to happen from a normal machine using the scripts and docs
  this repo ships with.
- **Pitfall (original sandbox only): Foundry's default solc auto-download was blocked**
  (`binaries.soliditylang.org` not reachable). Worked around by pinning `foundry.toml`'s
  `solc` to a manually-downloaded binary. **Session 6 ran on a normal dev machine**, so
  that pin was removed (commit `84ab86c`) and forge now auto-manages solc 0.8.24; the pin
  note below is preserved for historical context.

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


### Session 6 — the decode gap is now closed in code (real-envelope decoding, no offsets)

This build session ran on a normal dev machine with unrestricted network (GitHub + npm
registries), unlike the original sandbox — which also let me remove the solc path pin from
`foundry.toml` (see Environment notes update below). I re-pulled `@gluwa/usc-sdk@0.18.0` and
re-read `src/encoding/abi/v1.ts` and `src/utils/evmV1DecoderAbi.json` as ground truth, then
implemented the on-chain decoder. This is the resolution of the session-3 "Scope-changing
finding" above; it supersedes the "placeholder will not work" warnings in the old code.

**What `abiEncode(tx, receipt)` actually produces (confirmed, not assumed):** an ABI
encoding of `(uint8 txType, bytes[] chunks)` where each chunk is itself independently
ABI-encoded, i.e. `abi.decode`-able — it is NOT a fixed-offset blob that needs the
`EvmV1Decoder` library or byte-offset math to parse. The layouts that matter:
- chunk[0] is ALWAYS the common tx fields `(uint64 nonce, uint64 gasLimit, address from,
  bool toIsNull, address to, uint256 value, bytes data)` — identical for tx types 0-4.
- the LAST chunk is ALWAYS the receipt fields `(uint8 receiptStatus, uint64 receiptGasUsed,
  LogEntry[] logs, bytes logsBloom)` — `receiptStatus` is EIP-658 success/failure.
- the middle chunk(s) are type-specific (gas fields, access list, signature) and are never
  read by this decoder.

**Implementation (option (a) from session 3, minus the external dependency):**
`_decodePriceObservation` now does `abi.decode(encodedTransaction, (uint8, bytes[]))`,
decodes chunk[0] for `toIsNull`/`to`/`data` and the last chunk for `receiptStatus`, rejects
malformed inputs (`MalformedEncodedTransaction`) and proofs about any contract other than
the newly-added `PRICE_CONTRACT` immutable (`WrongObservationSource`), and reads the price
as the 32 bytes after the 4-byte `observePrice(uint256)` selector via a tiny inline
`mload` (Solidity's `data[4:]` slice syntax only applies to calldata arrays). Success is
`receiptStatus == 1` — an honestly-attested but REVERTED source tx is rejected by design.

**Why the new `PRICE_CONTRACT` immutable:** previously the decoder trusted any calldata
that happened to look like a price; with the real envelope decodable, binding the proof's
`to` field to the treasury's own source contract makes the system self-describing and
closes the "proof about someone else's contract" hole. Constructor gains a
`priceContract_` arg (deploy script env `PRICE_CONTRACT_ADDRESS`).

**Test-suite change (the other half of this task):** `TestBase.sol`'s proof helpers no
longer build the simplified mock payload. They now build the real envelope byte-for-byte
per v1.ts (chunk 0 common fields, chunk 1 for tx types 0/1/2, chunk 2 receipt), so the
on-chain decoder is exercised against the exact shape a live Attestcoin proof carries.
Added three tests: type-0 (legacy) envelope executes; verified proof to the wrong contract
reverts `WrongObservationSource`; verified proof of a reverted source tx reverts
`UnderlyingTxNotSuccessful`. Foundry suite: 14/14 passing (was 11/11).

**Honest limits:** this proves the decoder against the real-format encoding structurally,
not against a genuine live Sepolia proof + real precompile verification — that is exactly
deployment steps 1-2, which need live RPC access and a funded deployer key. Also updated
the agent's checked-in `abi/ASCTreasuryJournal.json` to match the new bytecode.

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
- [x] **Resolve on-chain price decoding against the real `encodedTransaction` envelope** —
      done in session 6: `_decodePriceObservation` now decodes the real
      `abi.encode(uint8, bytes[])` envelope and the test fixture builds real-shaped proofs
      (see the session-6 entry above). (What was previously the sole blocking *code* item
      is now closed; live validation of the decoder against a real Sepolia proof is part
      of deployment steps 1-2 below.)
- [x] **Live testnet deployment** (deployment steps 1-7 in `docs/DEPLOYMENT.md`) — DONE
      in session 7. Real Sepolia transaction proven via Attestcoin, executed on the
      deployed treasury on Creditcoin testnet; replay CLI reconstructs it end-to-end with
      a genuine hash match; an exact-calldata replay attack was demonstrated live and
      rejected with `ActionAlreadyExecuted`; frontend + reasoning store are live on GitHub
      Pages. See the session-7 entry for every address and tx hash.

### Session 7 — LIVE on Sepolia + Creditcoin testnet (the whole thing actually ran)

This session executed `docs/DEPLOYMENT.md` end-to-end with real credentials. Every claim
below was verified independently (block explorer, on-chain reads), not assumed from
exit codes.

**Step-1 confirmations against live networks (all previously-unconfirmed items resolved):**
- `getSupportedChains()` on Creditcoin testnet returns exactly two chains:
  **chainKey=1 = Sepolia (chainId 11155111, chainEncoding=1)** and chainKey=3 = Ethereum
  mainnet. The agent's `SOURCE_CHAIN_KEY=1` was correct. chainEncoding 1 is the ABI-v1
  encoding — the exact format the session-6 decoder implements, confirmed live.
- Precompiles at `0x0FD2`/`0x0FD3` are live (empty code as expected for precompiles; the
  ChainInfo one answers queries).
- **The reconstructed `INativeQueryVerifier` is CONFIRMED CORRECT**: the SDK's packaged
  `block_prover.json` declares single-proof `verify(uint64,uint64,bytes,tuple,tuple)` /
  `verifyAndEmit(...)` with tuple structs `(root bytes32, siblings (bytes32,bool)[])` and
  `(lowerEndpointDigest bytes32, roots bytes32[])` — byte-for-byte what this repo guessed.
  The "single highest-risk unknown" from earlier sessions is closed.
- **PenguinSwap reality check (changed the plan):** PenguinSwap on Creditcoin testnet is a
  Uniswap-V3-family deployment (Positions-NFT, SwapRouter = Universal Router with
  `swapExactTokensForTokens(uint256,uint256,address[],address)` — no deadline param, NO
  `getAmountOut`; pricing lives in QuoterV2). Critically, the V3 factory has **no
  USDC/WCTC pool at any fee tier**, so there was no real liquidity to trade against.
  Per PRD §12's sanctioned fallback, the demo trades against a deployed constant-product
  pair (the already-tested MockDexRouter) instead. Real-integration notes for production:
  adapt `IDexRouter` to the Universal Router's 4-param swap + QuoterV2 quoting.

**Deployed addresses (Creditcoin testnet, chainId 102031):**

| Contract | Address |
|---|---|
| baseAsset (USDC-like, 6dp) | `0x0bFA6eF009f8739c727b292849029608bd6b115A` |
| quoteAsset (MQT, 6dp) | `0x6A97b1913Bca9d17A57cAae1F6b5C1885bE1DAA1` |
| MockDexRouter (seeded 1M:1M) | `0x8D40f9D47886f21223357874e1a99a22DD4f9E5e` |
| **ASCTreasuryJournal** | **`0x78C986079Ee1C8701a56EeD7303Ac2301403E1dD`** |
| Verifier precompile | `0x0000000000000000000000000000000000000FD2` |

Source side (Sepolia): toy `PriceObservation` at
`0x23433fcA0f35CC5e801b6888293B2B11017900c7`
(tx `0x2fa1507c5a3c99c71c85c9e79e43ef99f9511f56a79d4b16cac8bc0177981734`).

Agent submit key: `0x2404Ed7251fAecb2981886BA1d2A88060D4ef3d2`. **Custody separation was
verified live, twice: zero USDC / zero MQT / zero allowances BEFORE going live, and again
after two successful executions moved treasury funds.**

**Live executions (real Attestcoin-proven Sepolia txs → treasury execution):**
1. actionKey `0x5e2ce2608dc59700b771ce9682d14633045e3d403ddc581f65b783ebc0fbdf0b`,
   tx `0x9173c2dfb57a62153ee5556d2c4318c123ba8a59f1686dd2257f738e60ecc7bb`
2. actionKey `0x51f8be425fbf5be6deba4cc0a9b3fb6ef62d12d90721d06173f175395b8ead1c`,
   tx `0xef59182181ef6de4584595e3ad4d75e5bba41d96c2cd5bd15f25d6e408285cee`

Both visible on Creditcoin Blockscout (status success, method selector `0xc296ff5e` =
executeArbitrage). Treasury went 1000 → 995.94 USDC, receiving MQT each time. `npm run
replay -- <actionKey>` reconstructs both end-to-end with **✅ HASH MATCH** against the
off-chain reasoning payloads. The first proof's live `txBytes` literally begins
`0x…02 0x…40` — `abi.encode(uint8(2), bytes[])`, confirming the decoder's format against
a genuine proof.

**Adversarial demo (step 7):** the EXACT calldata of execution #1 was replayed from the
same agent key (`scripts/adversarial-replay.js`). Result: mined-but-reverted, raw revert
data `0x6d41cd6c` → decoded **`ActionAlreadyExecuted`**. Replay-safety demonstrated live,
matching the Foundry tests.

**Frontend + reasoning store:** live at
**https://ay-obami.github.io/asc-arbitrage-journal-demo/** (GitHub Pages, branch
`gh-pages`, built with relative base; reasoning payloads under `/reasoning/<hash>.json`
on the same origin — stable URL, CORS-clean, no tunnel dependency). Live mode reads the
real treasury via its embedded env values.

**Live-found pitfalls (all fixed in visible fix-up commits):**
1. *Agent dropped candidates before attestation* — `getProof()` 404s while the source
   block is inside Sepolia's reorg window and `pollLatest()` never revisits → added
   `waitUntilReady(sourceBlock)` before the source proof (commit `0dbc363`).
2. *Gemini model rejected for newly-issued keys* — `gemini-2.5-flash` returns
   "no longer available to new users" (and the error's suggested `gemini-3.6-flash`
   doesn't exist); `.env` now uses the stable `gemini-flash-latest` alias. Also added a
   bounded retry for transient 503/429 in `decisionEngine.ts` after a fully-paid-for
   candidate died on a free-tier 503 (commit `b5a2e53`).
3. *ProofBuilder axios timeout too tight* — raised to 30s after a prover latency spike
   killed a cycle (`attestcoinClient.ts`).
4. *Observation txs intermittently Out-of-gas* — Sepolia base-fee moves between ethers'
   estimate and inclusion left some `observePrice` txs mined-but-reverted (confirmed via
   Blockscout receipts showing "Out of gas", calldata intact); fixed with an explicit
   generous gasLimit in `scripts/fire-observations.js` (commit `b4a1382`).
5. *`forge script` does not work on Creditcoin testnet* — fails with
   "`prevrandao` not set" header validation regardless of --legacy; deployments were done
   with an ethers.js script instead (`contracts/script/deploy-creditcoin.js`). Plain
   `forge create` works fine on Sepolia.

**Honest limits of the live demo:** the destination DEX is the project's own seeded
constant-product pair (PRD §12 fallback), not PenguinSwap — see the Step-1 finding above;
prices are self-reported into our own toy source contract (by design — trust comes from
Attestcoin inclusion + rigid bounds, not from access control); quick-tunnel hosting proved
unreliable on this network so GitHub Pages is used instead; the agent keeps cycling live,
so later executions beyond the two listed above are expected.

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

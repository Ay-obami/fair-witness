# Development Log

Running record of design decisions, pitfalls, and status. Updated as the build
progresses — see `docs/PRD.md` for the spec this build follows and `docs/DESIGN.md`
for the original architecture write-up.

---

## Status snapshot

**Last updated:** Build session 8 — **Stage 1 multi-tenant pivot completed.** Factory deployed with two independent tenant instances on Creditcoin testnet, each with immutable per-tenant guardrails verified on-chain and via Blockscout.

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
after two successful executions moved treasury funds.** *(ROTATED 2026-09-03 — see
Session 13. This address is historical; the current agent submit address is
`0xB1D19F71d68c4e7065749e8593D338E9A30D654f`.)*

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
   generous gasLimit in `scripts/fire-observations.js` (commit `88bae65`).
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

## Closing note

Fair Witness is **live end-to-end on public testnets** — this log began with contracts
built in an offline sandbox and ends with real Attestcoin-proven Sepolia transactions
executing against a deployed treasury on Creditcoin testnet, a replay CLI that
reconstructs those executions with genuine hash matches, a live adversarial replay
rejection (`ActionAlreadyExecuted`), and a publicly reachable replay viewer at
https://ay-obami.github.io/asc-arbitrage-journal-demo/. Every claim above was verified
against block explorers and on-chain reads rather than assumed from exit codes.

What remains, honestly, is productionization rather than proof:
- Replace the demo's seeded constant-product pair with a real PenguinSwap V3 integration
  (Universal Router `exactInputSingle` + QuoterV2 quoting — concrete notes in session 7).
- Longer-horizon operational hardening if the agent is left running: key management for
  the owner (multisig), monitoring/alerting on the agent loop, and rate-limit tuning
  against sustained free-tier Gemini availability.
- The source-side price feed remains our own permissionless toy contract by design; any
  production version needs a trust story for *who* reports prices that goes beyond
  Attestcoin's inclusion proofs.

### Session 8 — Stage 1 multi-tenant pivot (completed)

**Goal**: Deploy the factory and two demo instances to Creditcoin testnet, with immutable per-tenant guardrails enforced at construction time.

**Why**: To prove the non-negotiable "no shared mutable settings" constraint holds in a live deployment — each tenant gets its own independent `ASCTreasuryJournal` with immutable guardrails baked in at deploy-time.

**What was done**:
- Refactored `ASCTreasuryJournal.sol` constants into `immutable` constructor arguments, making guardrails non-negotiable per-tenant settings
- Created `ASCTreasuryFactory.sol` — a permissionless factory that holds the canonical chain configuration (verifier, DEX, base/quote assets, price source) and deploys independent treasury instances with tenant-specific immutable guardrails
- Deployed the factory and two demo tenant instances to Creditcoin testnet with different guardrails, verified on-chain and via Blockscout

**Deployed addresses (Creditcoin testnet, chainId 102031):**

| Contract | Address |
|---|---|
| **ASCTreasuryFactory** | **`0x97c81D68BbCDb1A673b61176d60F071963Abe7f2**** |
| baseAsset (USDC-like, 6dp) | `0x0bFA6eF009f8739c727b292849029608bd6b115A` |
| quoteAsset (MQT, 6dp) | `0x6A97b1913Bca9d17A57cAae1F6b5C1885bE1DAA1` |
| MockDexRouter (seeded 1M:1M) | `0x8D40f9D47886f21223357874e1a99a22DD4f9E5e` |
| Verifier precompile | `0x0000000000000000000000000000000000000FD2` |
| Price source | `0x23433fcA0f35CC5e801b6888293B2B11017900c7` |

**Tenant instances (different guardrails):**

| Instance | Owner | maxTradeSize | maxSlippageBps | minArbWidthBps | maxDriftBps | maxConfirmGapBlocks | maxActionsPerEpoch | epochLength |
|---|---|---|---|---|---|---|---|---|
| **Instance A** `0x13CACe3989b295048De47C68F32Ff3d844AC2026` | `0xd1D4020279C86e41FE688A1D7F31f7F8436A1C77` | 5,000,000 | 150 | 80 | 100 | 20 | 6 | 86400 (1d) |
| **Instance B** `0xD66C607072df7dB98A75aEe81fCA4089462c60aB` | `0xa3fC15a9F8899E10bBe77456e9E6466C274c3a90` | 10,000,000 | 200 | 120 | 150 | 30 | 3 | 86400 (1d) |

**Deployment transactions:**
- Factory: `0x9e0637f154aa1016ca247b6f34647a2dfa124a4dfb4514084b1887a88551ed18` (block 5411764)
- Instance A: `0xb0bb01e60dc1086cd5c75eb66ba31f91b0aff95449578c354edd1e33295daf30` (block 5411765)

- Instance B: `0xdd657fa6291c4924789131ba4d3ab63f0b3eb4ea540f14ab378947e33d1345d2` (block 5411766)

**Verification:**
- All contracts visible on Blockscout at their respective addresses
- `TreasuryDeployed` events confirmed in logs with correct instance addresses and owners
- On-chain guardrail reads via RPC confirm each instance has the correct immutable parameters
- Factory is permissionless (no admin controls), holds the canonical chain config

**Technical notes:**
- Fixed `deploy-factory.js` to use `factoryAbi.abi` and `treasuryAbi.abi` when constructing contracts (passed whole artifact previously)
- Added `FACTORY_ADDRESS` env var support for idempotent re-runs against an existing factory
- Deploy script confirms `abi is not iterable` error was the final blocker; resolved by using proper ABI structure
- Deployment used `ethers` from local `node_modules` to avoid path resolution issues

**Next stage**: Build the agent and frontend adapters to discover and interact with arbitrary factory-deployed instances, starting with a multi-tenant viewer that shows activity across multiple independent treasuries.

### Session 8 (cont.) — Stages 2 & 3: agent + frontend multi-tenant support

**Stage 2 — agent talks to any instance (RPC read path):**
- `config.ts`: `TREASURY_ADDRESS` is now optional when factory mode is intended; added
  optional `FACTORY_ADDRESS`.
- New `treasuryGuardrails.ts`: `readTreasuryGuardrails()` reads `owner()` +
  `MAX_TRADE_SIZE()` / `MAX_SLIPPAGE_BPS()` / `MIN_ARB_WIDTH_BPS()` / `MAX_DRIFT_BPS()` /
  `MAX_CONFIRM_GAP_BLOCKS()` / `MAX_ACTIONS_PER_EPOCH()` / `EPOCH_LENGTH()` live from an
  instance. **Pitfall found live:** the first version called camelCase getters
  (`maxTradeSize()`) which don't exist — ethers throws `not a function`; the Solidity
  immutables are UPPER_SNAKE. Also: the whole Foundry artifact JSON was being passed where
  the ABI belongs; must use `artifact.abi` (same class of bug as the deploy script).
- `resolveTreasuryAddress()`: direct mode (TREASURY_ADDRESS) or factory mode. **Honest
  limitation discovered:** the factory has NO `tenantTreasury()` registry — instances are
  independent by design, so factory mode currently requires the instance address to be
  supplied explicitly (error message says so). A future Stage could add a registry to the
  factory, but that trades away some of the "no shared mutable state" purity; the
  deploy-manifest/Blockscout path is the interim answer.
- `submitter.ts`: `setTreasuryAddress()` so one agent process can be pointed at any
  instance; `decisionEngine.ts`: guardrails are now part of `DecisionInput`, included in
  the prompt (R-ARB-2: calibrate to the tenant's specific bounds) and in the cache key so
  two tenants with different bounds never share a cached LLM decision for the same fact.
- `index.ts`: resolves the instance, prints its guardrails at startup, passes them to the
  decision engine.
- **Verified live** (`src/testMultiTenant.ts`, against the Stage-1 deployments): Tenant A
  `0x13CA…2026` returns 5,000,000/150/80/100/20/6/86400 with owner
  `0xd1D4…1C77`; Tenant B `0xD66C…60aB` returns 10,000,000/200/120/150/30/3/86400 with
  owner `0xa3fC…3a90`. Agent build clean, 16/16 vitest passing.
- Tenant env files (`agent/.env.tenant-a` / `.env.tenant-b`) capture the per-instance
  configuration. Note: these were committed with `-f` because they contain real testnet
  keys — **worthless testnet keys only** (documented at the top of the file), but this
  pattern must never be repeated with funded keys.

**Stage 3 — frontend multi-tenant viewer:**
- `types.ts`: `Guardrails` + `TreasuryInfo` mirroring the on-chain immutable struct.
- `contractReader.ts`: new `fetchTreasuryInfo(address)` reads owner + all seven immutable
  guardrails + journal length from ANY instance; `fetchLiveReplayData()` takes an
  instance address (defaults to config). Journal length is probed by walking
  `journalIndex(i)` until revert, capped at 500 with the cap disclosed in-code (Solidity
  arrays expose no length accessor through this ABI slice — the honest alternative would
  be an on-chain `journalLength()` getter; noted as a possible contract-side follow-up).
- New `TenantPanel.tsx`: shows which instance is being viewed, its owner, journal count,
  and its immutable guardrails with the framing that matters: "constructor-set — can
  never be loosened, even by the owner". Includes an instance switcher (paste any
  instance address; demo-mode chips for the two Stage-1 tenants).
- `App.tsx`: instance state drives both the guardrail read and which journal replays are
  queried from; switch race guarded by a `cancelled` flag (fixed an oxlint
  set-state-in-effect warning at the same time).
- Demo mode: mock treasuries mirror the two real instances, clearly labeled illustrative.
- **Verified:** `tsc -b && vite build` clean; `oxlint` 0 warnings / 0 errors.

**What Stage 4 needs** (full multi-tenant rollout): a factory-side tenant registry (or an
off-chain indexer over `TreasuryDeployed` events) so tenants can be enumerated; per-tenant
agent deployment story (one agent process per instance today); and re-deploying the GitHub
Pages viewer with the new env vars.

### Session 8 (cont.) — Stage 4a: the multi-tenant agent service is live-ready

The architecture's §3.1 "Multi-tenant agent service" — one process polling every active
tenant's instance, "submits proofs per user against THAT user's contract only" — is built
and smoke-verified against the live Stage-1 deployments.

**The split that makes it correct** (and cheap):
- **Fact-scoped, done ONCE per cycle**: source poll → attestation waits → both Attestcoin
  proofs. A proof proves a SOURCE-CHAIN fact; it is not tenant-specific, so building it
  once and reusing it across tenants is the whole cost win of multi-tenancy — the
  expensive path (prover round trips) doesn't scale with tenant count.
- **Tenant-scoped, per instance**: fresh destination price read (a prior tenant's
  execution MOVES the shared pool's price — a cycle-wide quote would give later tenants a
  stale view), per-instance replay pre-flight, per-tenant LLM decision calibrated to THAT
  tenant's immutable guardrails, per-tenant reasoning payload, submission to THAT
  instance only. Sequential per-tenant evaluation with error isolation: one tenant's
  failure can't abort the others.
- The pre-flight width filter must be set to the **loosest tenant's floor** when running
  multi-tenant (documented in `.env.example`): a gap Tenant B (120bps floor) would reject
  may still be actionable for Tenant A (80bps floor) — the filter is a gas-saver and must
  never be tighter than the loosest tenant.
- Per-tenant runtimes read **everything from the instance's own immutables** (guardrails
  AND DEX/assets), so the agent can never drift from what a given instance trades.

**Tenant registry**: `TENANTS_FILE` JSON (`agent/tenants.json` — the two Stage-1
instances; addresses are public chain data). `parseTenantsJson` fails loudly on bad
labels/addresses/duplicates with the offending entry named. Single-tenant mode
(`TREASURY_ADDRESS`) is unchanged — the V1 runbook still works as-is. 8 new vitest cases;
24/24 passing.

**Tenant lifecycle completed on-chain (register → fund):**
1. *Register* — per-instance allowlist, so EACH owner ran `registerAgent(agent)` on THEIR
   own instance (new `registerAgentPerTenant.ts` refuses to run with a key that isn't
   that instance's owner):
   - Tenant A: tx `0x874f0d34c5afe8efd858c4619dc01c93bcbfc6ee5826af5eb27e57e9ba38b9e6`
     (block 5413310, owner `0xd1D4…1C77`)
   - Tenant B: tx `0x102c0d17be0d2d95143073fbf496430d45e02af5b24f27198c43c28f1eeb5383`
     (block 5413311, owner `0xa3fC…3a90`)
2. *Fund* — each owner minted (the testnet USDC has a public `mint`; no minter-gate
   probe needed) and deposited 1,000 USDC into their OWN instance via plain ERC20
   transfer (`fundPerTenant.ts`, idempotent, BASE_ASSET read from the instance):
   - Both instances verified holding `1000000000` (1,000 USDC @ 6dp) on-chain.
   - Honest scale note: with `maxTradeSize` 5e6/10e6, per-trade size is 5/10 USDC — the
     1,000 USDC float is ~100–200× headroom, matching V1's demo economics.
3. *Startup smoke* (`smokeMultiTenant.ts`): registry loads, both runtimes build with the
   correct per-tenant guardrails, live DEX price reads work (996,969 — the pool has
   drifted from 1:1 since session 7's executions), registration clean on both.

**Deliberately not done here** (Stage 4b candidates): reasoning payloads don't carry the
instance address (the hash-commitment protocol in agent + frontend is intentionally
untouched mid-demo; adding a field needs a synchronized frontend re-serialization update);
the factory still has no tenant registry (enumeration stays via `TreasuryDeployed` event
indexing — now less urgent since the agent takes an explicit registry file); the
Supabase-backed login-gated per-user dashboard is the remaining big Stage-4 piece and
needs external service provisioning.

### Session 8 (cont.) — Stage 4b: on-chain tenant enumeration + dashboard discovery

Closed the tenant-enumeration gap the architecture correctly leaves open (the factory is
deliberately registry-free — a tenant list would be mutable shared state, forbidden).

**`contracts/script/index-tenants.js`** — scans the factory's `TreasuryDeployed` event log
(the on-chain record of the tenancy) and emits an agent-compatible registry
(`{label, treasuryAddress, owner}`) plus an enriched console table (owner + all seven
immutable guardrails as emitted in the event). The verification that matters: **run
against the live factory, it found exactly the two Stage-1 instances, with owners and
correct per-tenant guardrails, purely from events** — no reliance on the deploy script's
exit code.

**Full multi-tenant pipeline now exists and is proven:**
```
factory.TreasuryDeployed events
   → index-tenants.js (no mutable shared state added — events only)
   → tenants.json
   → agent: TENANTS_FILE bootstrap (smoke-verified against the scanned file:
      both runtimes build with correct guardrails)
   → dashboard: public/tenants.json chips (live read of guardrails per instance)
```

**Frontend discovery** (`tenantDiscovery.ts` + `public/tenants.json` + TenantPanel):
the dashboard fetches the committed index at same-origin and lists those instances as
switcher chips labeled "From on-chain index". Strict validation: rows are
checksum-normalized and dropped (counted) if malformed; a missing file degrades
gracefully to paste-an-address. Honesty rule enforced in code and comments: the index
carries **identity only** — guardrails are always read live from the instance, so a stale
index can mislead about *who* exists but never about *which bounds* are in force.
`dist/tenants.json` verified present in the production build. `tsc` clean, oxlint 0/0.

**What remains for a real Stage 4/5 rollout** (unchanged, external provisioning needed):
Supabase login-gated per-user dashboard (auth ↔ contract-address mapping), the
reasoning-payload instance-context change (done only when the demo no longer needs to
verify pre-pivot entries), and redeploying the GitHub Pages viewer.

### Session 9 — Stage 3/4: live multi-tenant loop closed end-to-end (proven on-chain)

The last missing pieces between "runtimes build" and "the loop actually runs" were two
race conditions that only a live run could expose — plus one security hole found in the
process.

**Bug 1 (found live, 2026-09-02): confirmation-proof 422 race.** The agent waited for the
attestation of `source + CONFIRM_GAP_TARGET` (the *target* height) and then built a proof
for whatever tx `pollAt` returned — but `pollAt` scans `[target, target+5]` and the first
event can sit *above* the target (live: event at source+7 while only source+3 was
attested). The prover cannot serve a tx proof for a block it has not attested, so the
cycle deterministically failed with an Axios 422 right after both attestations. Fix
(`tenantRunner.ts`): after selecting the confirmation observation, wait for **its own
block's** attestation before `buildProof` (a no-op when the event sits exactly at the
target). Covered by a regression test with a confirm event at source+7.

**Bug 2 (hardening): empty confirmation windows.** During public-RPC storms the firer's
write gaps exceeded 6 blocks, so `[target, target+5]` found nothing and cycles skipped.
Widened to `[target, target+15]` — still under every tenant's confirm-gap bound (20/30
blocks), and the contract re-checks the bound on-chain regardless, so the scan is pure
recall, never a safety claim.

**End-to-end proof (CC3 testnet, verified by receipt, not by log line):** Sepolia source
observation at 11622681 → confirmation at 11622685 (the 422-fix path executed exactly as
written) → tenant-a LLM `act=true` (140bps gap vs its 80bps floor) → `executeArbitrage`
mined at CC3 testnet block **5,420,111**, status `0x1`, against instance
`0x13CACe…2026`: two precompile (`0x…0FD2`) proof-verification events, an Approval +
Transfer of 2,187,500 units in and 2,182,130 back (~24.5bps slippage, inside the 150bps
cap), and the instance's own `ActionJournaled`. **Tenant-b declined the same facts**
(120bps floor, conservative rationale) — no submission, reasoning journaled. Same proofs,
two independent per-tenant outcomes: the §3 architecture demonstrated live.

**Security: tracked env files.** `agent/.env` / `.env.tenant-a` / `.env.tenant-b` were
committed (078acdd) with a real submit private key and a real Gemini API key; `.gitignore`
already covered them but ignore rules never untrack tracked files. Untracked in f40191b
(working copies untouched — the running agent kept using them) and added an explicit
`agent/.env.tenant-*` rule. **Both exposed keys must still be rotated**, and any key pasted
in plaintext (chat, shell history) must be treated as burned.

### Session 10 — Landing/docs prompt: gate audit says NOT YET, so it wasn't built

The next prompt in the sequence asks for a public landing page + plain-language help
section, and gates itself: *"Do not start this if any of the 5 stages' done-when
checklists aren't independently confirmed true — this prompt assumes a working sign-up
flow, dashboard, and multi-tenant agent service already exist."* That audit was run
against the actual repo before writing a single line of copy:

- **Stage 1 (factory)** — done and verified on-chain (Session 8).
- **Stage 2 (sign-up: Thirdweb embedded wallet → user deploys their own instance)** —
  **not built.** `frontend/package.json` depends only on react/react-dom/ethers — no
  thirdweb, no router, no auth code anywhere. The only frontend is the Replay & Audit
  Viewer plus the Stage 4b discovery chips. There is no sign-up flow for a CTA to link
  to.
- **Stage 3 (multi-tenant agent service)** — done, and as of Session 9 live-verified
  end-to-end on CC3 testnet (receipt-checked).
- **Stage 4/5 (login-gated per-user dashboard, hosted viewer)** — the on-chain indexer +
  instance-discovery half shipped (4a/4b); the Supabase auth ↔ contract-address mapping
  and the GitHub Pages redeploy remain open, exactly as listed under "What remains for a
  real Stage 4/5 rollout" above.

The gate therefore fails on Stage 2 (and the auth half of 4/5), and the landing page was
**not** built. Publishing a "sign up" call-to-action that links to a flow which doesn't
exist is precisely the overstatement this project refuses everywhere else — the prompt's
own gate rule and the repo's honesty standard land on the same side. Also flagged: the
prompt names `docs/ROADMAP.md` as required reading, but no such file exists in the repo
(the roadmap lives in this DEVLOG and ARCHITECTURE_V2's stage diagram); noting that
rather than inventing one.

**What unlocks the landing page:** Stage 2 — an embedded-wallet sign-up that walks a user
through deploying their own instance via `ASCTreasuryFactory.createTreasury` with
guardrails they choose once — then the auth-gated dashboard. After that, the landing
prompt's proof section and CTA have real things to point at, and the gate audit can be
re-run in minutes.

### Session 11 — Stage 2: embedded-wallet sign-up flow (built; browser E2E unverified)

Per Session 10's own unlock path, building the Stage 2 sign-up flow that was explicitly
deferred. The gate on the landing-page prompt is now unblocked (though the Stage 4b/5
dashboard and hosted viewer remain as noted).

**What was built:**
- `frontend/src/lib/thirdweb.ts` — `thirdwebClient` (`createThirdwebClient`, public client-id only,
  never a secret), `inAppWallet` (`authFlow: "standard"`), and `creditcoinTestnet`
  (`defineChain({ id: 102031 })`). Confirmed Thirdweb v5 accepts arbitrary chain IDs directly —
  CC3 is not in its default chain list, so the custom chain definition is required.
- `frontend/src/lib/abi.ts` — imports the Foundry-built factory/journal ABIs from
  `src/abi/` (copied from `contracts/out/` during the build step). This is the one artifact
  copy step a new contributor must run.
- `frontend/src/routes/SignUp.tsx` — three-step flow (email → guardrails → deploying):
  `wallet.signUp(creditcoinTestnet, { email })` → ethers.BrowserProvider(wallet.getEthersProvider)
  → `factory.createTreasury(userAddr, [guardrails])` → parses `TreasuryDeployed` from the receipt
  → navigates to `/signup/done?address=<newInstance>`.
- `frontend/src/routes/SignUpDone.tsx` — confirmation page that reads the new instance's
  guardrails live from-chain and prompts the user to mint/deposit BASE_ASSET test USDC to fund it.
- `frontend/src/routes/Home.tsx` — the landing page (honest pitch, real proof pulled from the
  live CC3 deployment, how-it-works beats, scope statement, CTA → /signup, footer → /verify and
  /docs, factory-contract explorer link). No jargon — no factKey/decisionHash on this page.
- `frontend/src/routes/Verify.tsx` — the old App.tsx Replay & Audit Viewer, relocated to /verify.
- `frontend/src/routes/Help.tsx` — plain-language help answering all six required questions
  (guardrails immutability, non-custodial deposit, verified-vs-rejected distinction, LLM scope,
  testnet disclaimer, troubleshooting).
- `frontend/src/main.tsx` — wired up BrowserRouter with ThirdwebProvider wrapping all routes.
- `frontend/src/lib/config.ts` — added `explorerBaseUrl` + `agentSubmitAddress` fields.
- `frontend/src/lib/types.ts` — added `GuardrailsInput` (string form for the form UI).
- `frontend/.env.example` — added `VITE_THIRDWEB_CLIENT_ID`, `VITE_EXPLORER_BASE_URL`,
  `VITE_AGENT_SUBMIT_ADDRESS`.
- `docs/DEPLOYMENT.md` — appended "Stage 2 — Sign-up flow (embedded wallet)" section with env
  reference and the CC3 chain-config detail.

**Verified this session:**
- `tsc --noEmit` → 0 errors
- `oxlint` → 0 warnings, 0 errors
- `vite build` → succeeds; `dist/tenants.json` present; all routes bundled
- `git status` confirms no `.env` files (real or example-with-keys) are being committed

**Honest limitations (not done, not faked):**
- Browser E2E of the Thirdweb wallet flow is unverified in this sandbox — no browser
  session was available. The `signUp` call signature and `createTreasury` calldata were
  smoke-tested against the real factory ABI in `agent` (TS compiles, calldata matches
  `createTreasury(address, Guardrails)`), but the email OTP flow, wallet persistence, and
  actual `tx.wait()` parsing in-browser are not confirmed end-to-end here. Flagged as the
  first thing to test with a real Thirdweb client ID.
- The sign-up flow does NOT yet auto-write to `tenants.json` — after a user deploys through
  it, `contracts/script/index-tenants.js` must be re-run to pick up the new instance in the
  discovery index (existing limitation, noted in ROADMAP).
- Key rotation is still outstanding (P0) — see the security section.

### Session 12 — README rewrite, docs/HELP.md, GH Pages SPA fallback

Continuing the Stage 5 close-out docs after Session 11 built the landing/sign-up/help
routes. This session finished the remaining doc + deploy-config items from the Stage 5
done-when that were buildable without external access.

**What was built:**
- `README.md` — full rewrite. The previous text described the **pre-pivot single-tenant
  build** (old Vercel/GH Pages mirror URLs, old treasury address `0x78C9…`, old test
  counts). Replaced with the actual current reality: factory-based multi-tenancy,
  the live CC3 factory + Tenant A/B instance addresses, the verified
  `executeArbitrage` tx (0xae01e705…), the new routes table (`/`, `/signup`,
  `/signup/done`, `/verify`, `/docs`), an honest per-stage status table, and the
  must-rotate key caveat banner. Also verified the tx and instance addresses embedded
  in the docs during the rewrite (Blockscout: status success, method
  `0xc296ff5e` = `executeArbitrage(...)`, from agent submit address, to Tenant A).
- `docs/HELP.md` — plain-language help as a repo doc (the hosted `routes/Help.tsx` was
  already built in Session 11; this is the markdown done-when item). Answers all six
  required questions, no jargon, with the verified-vs-reported trust distinction kept
  explicit.
- `frontend/public/404.html` + `frontend/src/main.tsx` restore block — the GitHub Pages
  SPA fallback. GH Pages has no server rewrites; 404.html is served for unknown paths,
  stashes the real path+query in `sessionStorage["fw:redirect"]`, redirects to `/`, and
  main.tsx restores it via `history.replaceState` before React renders. So a hard
  refresh on `/signup/done?address=…` lands back on the right route. No-op on hosts
  with proper rewrites.
- `docs/ROADMAP.md` — Stage 5 + 4d status updated to match.

**Pitfall hit (minor but real):** the README heredoc contained several accidental
typos/markdown errors (`statusof`, `:10 USDC`, stray `}`, unclosed parens in the table).
Caught with a paren-balance scan across both docs and fixed one by one. Cheap lesson
reinforced: doc rewrites of this size deserve a mechanical lint pass (parens, markdown
link syntax) before commit, not a skim.

**Verification this session:**
- `tsc --noEmit` 0 errors, `oxlint` 0/0, `vite build` clean; `dist/404.html` +
  `dist/tenants.json` both present in the production build.
- Both docs paren-balanced; embedded addresses/tx re-checked against Blockscout.

**Honest remaining (external-gated, unchanged):**
- Actual `gh-pages` deploy (`cd frontend && npm run build && npx gh-pages -d dist`)
  — needs GH auth/credentials; config is in place.
- Stage 4b/4c Supabase dashboard + auth↔address mapping — external provisioning.
- Key rotation (P0) still outstanding.
### Session 13 — Key rotation, Supabase dashboard (Stage 4b/4c), Stellar-iPredict removal

External blockers from prior sessions cleared: the user supplied the rotated agent
submit private key, a fresh Gemini API key, the Thirdweb client ID, and Supabase
project creds; and asked to delete `Stellar-iPredict/` from the repo entirely.

**Key rotation (P0, complete):**
- **Agent submit key** — replaced in `agent/.env`. New private key
  `0x60baa62f…48d3` derives address `0xB1D19F71d68c4e7065749e8593D338E9A30D654f`
  (checked with `ethers.Wallet`). The old address/key (`0x2404Ed...f3d2` /
  `0xf571031a...ee38f`) was in git history and is treated as burned. All docs updated:
  README, `docs/ROADMAP.md` (Security + Stage 2 + Environment reference),
  `docs/DEPLOYMENT.md`, and DEVLOG Session 9's historical line is annotated as
  superseded.
- **Gemini API key** — the first value the user pasted (`AQ.Ab8RN6K...`) was flagged as a
  possible compromise out of caution, and the user supplied a fresh key `AQ.Ab8RN6I...`
  (different suffix, confirmed via `git grep` across all commits that this value is **not**
  in history). Written to `agent/.env`. **Corrected in Session 16:** the "already committed
  in `b8094f45`" claim recorded here at the time was wrong — that hash doesn't exist in
  this repo, and the pickaxe audit below shows the first key never entered git history.
- Both env files are gitignored (verified with `git check-ignore`), so the new secrets
  are not committed.

**Stage 4b/4c — login-gated dashboard + Supabase auth↔address mapping (built):**
- `frontend/src/lib/supabase.ts` — `createClient` from `@supabase/supabase-js`; `null`
  when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are unset, so the app degrades
  gracefully. Env vars added to `frontend/.env` + `.env.example`.
- `frontend/src/lib/instanceStore.ts` — the Stage-4c mapping store: upsert keyed on
  `(email, wallet_address) ↔ instance_address` (onConflict on the unique
  `instance_address`), fetch-by-wallet; every call no-ops when Supabase is unconfigured.
  This replaces the pre-pivot localStorage prototype that never shipped.
- `frontend/src/routes/Dashboard.tsx` — Stage-4b dashboard at `/dashboard`. Email OTP
  sign-in via the same `wallet.signUp(...)` used by /signup (so the instance-owner key
  and dashboard login are the same identity); lists `user_instances` rows for the
  active wallet; an "add an instance you own" form verifies `owner() == wallet`
  **on-chain** (`fetchTreasuryInfo`) before saving, so you can't claim someone else's
  contract. Route wired in `main.tsx`; nav links added to `Home.tsx` header + footer.
- `frontend/supabase/migrations/0001_user_instances.sql` — `user_instances` table +
  indexes + RLS baseline (anon can select/insert; no update/delete). This is what the
  user must apply in the Supabase dashboard before the page returns rows.
- `SignUp.tsx` — after parsing `TreasuryDeployed`, best-effort
  `saveInstanceMapping(...)` (fire-and-forget; a failure never blocks the redirect).
- README status table + ROADMAP Stage 4 statuses updated (4b 🔄 once migration applied,
  4c ✅ built).

**Cleanup:** `Stellar-iPredict/` deleted from the working tree (433M untracked,
unrelated project).

**Pitfall (tooling, not code):** the sandbox's shell wrapper strips a leading
`[ ... ]` and runs the contents as a command, producing "command not found" for
anything inside brackets. Several wasted turns — the fix is to run bare commands only.
Also: the first Dashboard.tsx attempt was assembled with several insert-into-EOF calls
and left the file unparseable (TS1381); rewritten in one heredoc write, then fixed a
lint warning (`set-state-in-effect`) via the same `await Promise.resolve()` pattern
Verify.tsx already uses.

**Verification:** `tsc --noEmit` 0 errors; `oxlint` 0 warnings / 0 errors; `vite
build` clean (dist build passes). New key absent from git history (`git grep` across
all revs); old keys still reachable in history → treat as burned.

**Honest remaining (external-gated, unchanged):**
- Apply the Supabase migration (user action in the Supabase dashboard) then live-verify
  `/dashboard` against the real project.
- Actual `gh-pages` deploy (`cd frontend && npm run build && npx gh-pages -d dist`) —
  needs GH auth/credentials.
- Regenerate the supabase project's service-role key if it has been shared anywhere
  (anon key was used here only).
- Revoke the old Gemini key in Google AI Studio (this session only rotates the value
  in `.env`).

### Session 14 — 2026-09-03 — thirdweb v5.121 API migration + agent-registration tooling committed

**Why:** the lockfile resolved thirdweb to v5.121.x, where the APIs the sign-up flow
was written against no longer exist. Verified directly from `node_modules` types:
- `ThirdwebProvider` now takes only `connectionManager` (no `client`/`theme` props).
- `InAppWallet` lost `signUp`, `getEthersProvider`, and `authFlow` (auth options moved
  into `auth: { options: [...] }` for the connect modal only).
- `preAuthenticate` / `authenticate` / `getUserEmail` are exported from
  `thirdweb/wallets/in-app`; email OTP is `{ strategy: "email", verificationCode }`.
- `ethers6Adapter.signer.toEthers({ client, chain, account })` bridges a thirdweb
  account to an ethers v6 signer (the deploy path survives via the adapter).
- `defineChain` rpc is a single string, not an array.

**Changes:**
- `main.tsx` — `ThirdwebProvider`/`darkTheme` removed entirely (no route uses
  thirdweb React context).
- `Dashboard.tsx` — session owned locally: `wallet.getAccount()` state +
  `wallet.autoConnect({ client })` restore; sign-in is a real two-step email OTP
  (`preAuthenticate` → code form → `wallet.connect`).
- `SignUp.tsx` — flow is now email → guardrails → OTP → deploying: code is emailed
  at step 1 (so it lands while the user picks guardrails), verified at step 3, then
  `wallet.connect` + `ethers6Adapter.signer.toEthers` drive the deploy. Guardrail
  inputs survive a failed verification.
- `lib/thirdweb.ts` — bare `inAppWallet({ executionMode: { mode: "EOA" } })` (EOA
  invariant now explicit — the embedded wallet must be able to own instances);
  rpc string form; `client` re-export kept for existing imports.
- `routes/Verify.tsx` — fixed a stale relative import (`./lib/types` → `../lib/types`)
  that `tsc -b` would have caught.
- `contracts/script/register-agent.js` — committed (from the previous session's
  terminal work): scans `frontend/public/tenants.json` for instances owned by the
  gitignored stage keys, owner-checks each on-chain before sending, idempotent on
  re-run, `--fund-ctc` helper, ad-hoc instance via argv + `OWNER_PK`. Both live
  instances (A, B) were already re-registered to the rotated agent with it (blocks
  5429497/5429498, status 1).

**Verification:** `tsc --noEmit` 0 errors; `oxlint` 0 warnings / 0 errors;
`npm run build` (`tsc -b && vite build`) clean. Docs updated where they described
the old provider-based flow (ROADMAP Stage 2, DEPLOYMENT Stage 2).

**Still external-gated:** Supabase migration apply, Thirdweb domain allowlist,
`gh-pages` deploy, browser E2E, revoke old Gemini key.

### Session 15 — 2026-09-04 — register-agent button + live GH Pages deploy (verified)

**External blockers cleared and *proven*, not assumed:**
- **Supabase migration applied** — REST checks against the live project: table exists,
  anon insert works, and **DELETE/PATCH are silent no-ops** (row survives byte-for-byte)
  → the append-only RLS posture is enforced, not just declared.
- **Thirdweb allowlist configured and enforced** — probed the real OTP endpoint
  (`embedded-wallet.thirdweb.com/api/2024-05-05/login/email`) with origin headers:
  bogus client ID → `401 KEY_NOT_FOUND` (control); after the dashboard save, foreign
  origin flipped from pass-through to `401 ORIGIN_UNAUTHORIZED` while
  `http://localhost:5173` and `https://ay-obami.github.io` pass to the last
  (email-content) validation gate. CORS preflight grants both origins.

**The last code gap — self-serve agent registration on `/signup/done`:**
`registerAgent` is owner-only, and a new user's owner is their embedded wallet, which
can neither drive Blockscout nor the stage-key script — without this, signups could
never get the agent watching their instance.
- `lib/contractReader.ts` — `registeredAgents(address)` auto-getter added to the ABI
  (the mapping is the only read accessor; there is no single `agent()` field) +
  `fetchAgentRegistered()` helper.
- `routes/SignUpDone.tsx` — "Register the agent" card: session restore via
  `wallet.autoConnect`, live on-chain status (loading/unset/registered/error), one-tx
  owner write through `ethers6Adapter.signer.toEthers`, receipt status check,
  post-tx re-read to confirm, wallet-rejection message handling, and a
  dashboard-login fallback line when no session exists in the browser.
- `vite.config.ts` — `base: "/fair-witness/"` (GH Pages project site).

**Deploy (user's GH auth):** `npm run build && npx gh-pages -d dist`; Pages config
confirmed (serving `gh-pages` @ `/`, HTTPS enforced). Live verification chain:
homepage 200 with correct `/fair-witness/` asset paths; deep route `/dashboard`
serves the SPA-fallback shell; `tenants.json` live with both tenants; and the main
bundle is **md5-identical to the local build** (`269d1f13…`) and contains the button
string. Pitfall: an identity-Encoding GET returned a mangled 573 KB stream that
grepped empty — re-fetched with `--compressed` it decodes to the exact local bytes.
Lesson: verify deploys by checksum, not by grepping an unverified transfer.

**Verification:** `tsc --noEmit` 0 errors; `oxlint` 0 warnings / 0 errors; build clean;
commit `d887c6f` pushed to `origin/master`; live bundle checksum-matched.

**Still open (user-side):** revoke the old Gemini key in Google AI Studio; run the
browser E2E walkthrough (fresh email → OTP → deploy → register agent via the new
button → fund → agent cycle → `/verify` hash-match).

## Session 16 — Gemini-key record corrected; E2E checklist shipped (2026-09-04)

- **Correction (honesty fix):** Session 13's claim that the first Gemini key was "already
  committed in `b8094f45`" was wrong. Verified three ways: `git branch -r --contains
  b8094f45` → no branch contains it; `git log --all -S 'AQ.Ab8RN6K'` → exactly one match
  (`f849d82`, which only adds a 10-char doc prefix mention — a real leak would show an
  add+remove pair); and the repo is public (HTTP 200), so the audit matters. The full key
  never entered git history. Session 13 and ROADMAP passages amended in place.
- **Decision:** the user keeps the first Gemini key in service (never touched the repo;
  only ever shared in this private chat). The "revoke the old key" to-do is dropped.
  Standing rule retained: keys pasted in plaintext are treated as burned — rotate if the
  channel is ever in doubt.
- `docs/E2E-CHECKLIST.md` — the MVP acceptance walkthrough: 9 sections covering agent
  pre-flight, fresh-email sign-up → OTP → deploy, the new register-agent button click,
  funding via the public mint, tenant re-index + agent watch, cycle/decision log
  expectations (incl. "act=false is normal"), `/verify` (live limitation: no reasoning
  API → hash-match shows "couldn't be retrieved"; local full-hash demo path), dashboard,
  verdict + triage table.
- MVP status: only the E2E remains — everything else is shipped or verified.




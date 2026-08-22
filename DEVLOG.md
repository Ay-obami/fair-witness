# Development Log

Running record of design decisions, pitfalls, and status. Updated as the build
progresses — see `docs/PRD.md` for the spec this build follows and `docs/DESIGN.md`
for the original architecture write-up.

---

## Status snapshot

**Last updated:** Build session 2 (contracts test suite complete)

| Component | Status |
|---|---|
| Contracts — interfaces | ✅ Done |
| Contracts — `ASCTreasuryJournal.sol` core | ✅ Done |
| Contracts — mocks (verifier, DEX, ERC20) | ✅ Done |
| Contracts — acceptance tests (8 from PRD §10) | ✅ Done — 11/11 passing (8 required + 3 bonus) |
| Contracts — deploy scripts | 🔜 Next |
| Agent runner (TypeScript) | ⬜ Not started |
| Frontend (React + Tailwind replay viewer) | ⬜ Not started |
| Live testnet deployment | ⬜ Not started — requires real RPC/API access outside this sandbox |

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

### Decision: BASE_ASSET is Creditcoin-side capital, not literally bridged Sepolia USDC
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

## What's left (tracking against the PRD)

- [x] Foundry acceptance tests — the 8 tests from PRD §10 (custody invariant, replay
      safety incl. simulated crash/retry, drift/width rejection, rate limiting, journal
      hash-match)
- [ ] Foundry deploy script (`script/Deploy.s.sol`) with clear placeholders for real
      Sepolia/Creditcoin-testnet addresses
- [ ] Agent runner (TypeScript): chain watcher, Gemini decision client (temp=0 +
      factKey-keyed cache, per PRD §7), `ProofBuilder` integration point, deterministic
      nonce derivation, submitter, pre-flight replay check
- [ ] Agent runner unit tests (mocked LLM + mocked chain reads — no live network needed)
- [ ] Frontend: React + Tailwind replay viewer, reading journal entries and reconstructing
      the fact → decision → action chain, with the on-chain/off-chain hash-match check
- [ ] `docs/DEPLOYMENT.md` — copy-paste deployment steps for a machine with real
      Sepolia/Creditcoin RPC + Gemini API access
- [ ] Final DEVLOG pass once all of the above lands

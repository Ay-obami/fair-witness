# Development Log

Running record of design decisions, pitfalls, and status. Updated as the build
progresses — see `docs/PRD.md` for the spec this build follows and `docs/DESIGN.md`
for the original architecture write-up.

---

## Status snapshot

**Last updated:** Build session 1 (contracts phase)

| Component | Status |
|---|---|
| Contracts — interfaces | ✅ Done |
| Contracts — `ASCTreasuryJournal.sol` core | ✅ Done |
| Contracts — mocks (verifier, DEX, ERC20) | ✅ Done |
| Contracts — acceptance tests (8 from PRD §10) | 🔜 Next |
| Contracts — deploy scripts | ⬜ Not started |
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

---

## Pitfalls encountered

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

## What's left (tracking against the PRD)

- [ ] Foundry acceptance tests — the 8 tests from PRD §10 (custody invariant, replay
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

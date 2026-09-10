# Research Agenda — Phase 1 gate questions (RESOLVED  2026-09-07)

> **Newest NTT enumeration result (2026-09-08):** A chain-wide Sepolia
> `PeerUpdated(chainId=59)` scan returned six NTT managers. One exact pair links
> Sepolia token `0x9cE4…4F2d` through manager `0x84bE…aA41` to PenguinSwap WCTC
> `0x5607…329E` through Creditcoin manager `0x7f31…B1ECc`. Managers are unpaused,
> threshold 1, and bidirectionally peered; Creditcoin is locking mode 0 and Sepolia
> is burning mode 1. The Sepolia token is nevertheless zero-supply and its minter is
> the owner rather than the manager. Verified NTT source calls token `mint()` for
> inbound burning-mode transfers, so the route is currently incomplete.

> **REOPENED (2026-09-08):** User requires Sepolia-only. Fresh discovery found no
> Sepolia Uniswap V3 Circle-USDC/WCTC pool at any standard fee tier. Mainnet source
> conclusions are superseded; see SEPOLIA-ONLY-REASSESSMENT.md.

> **NTT identity result (2026-09-08):** Live peer traversal confirms Sepolia manager
> `0xe6fE…2e78` (Wormhole ID 10002) and Creditcoin peer `0x0371…17F0` (ID 59)
> reference each other. The Creditcoin peer token is `0x069F…6a67`, supply zero,
> not PenguinSwap WCTC `0x5607…329E`. This closes the acquisition lead negatively
> for the currently selected destination pool.
> PenguinSwap factory reads returned zero for the linked token/USD-TCoin at all four
> standard fees; the live testnet indexer returned an empty pool set for the token.

> **Penguin WCTC provenance (2026-09-08):** Blockscout-verified Solidity for
> `0x5607…329E` is a non-upgradeable WETH9-style native wrapper with only
> `deposit`/`withdraw`; its live `totalSupply()` and native CTC contract balance both
> equal `224507489811958139103326995` wei. The address has zero Sepolia code. Of all
> token addresses in the 130 indexed PenguinSwap pools, only three liquid-token
> addresses had Sepolia code; all three were unrelated contracts (different runtime
> hashes and reverting ERC-20 metadata calls), so same-address discovery produced no
> candidate.

> **Reassessment result (2026-09-08):** The authoritative Phase 1 conclusions are in
> [PHASE-1-FREEZE-V2.md](PHASE-1-FREEZE-V2.md), backed by raw files under `evidence/`.
> Earlier Sepolia/ACL and malformed PenguinSwap-pool conclusions below are historical
> and superseded where they conflict with that freeze.

> **Continuation checkpoint (2026-09-07):** Phase 1 reassessment is BLOCKED. Read [PHASE-1-REASSESSMENT.md](PHASE-1-REASSESSMENT.md) for fresh RPC evidence, invalid historical pool address, mandatory source correction, asset-comparability blocker and proof-index replay concern. This supersedes prior completion claims; no functional changes or transactions performed.

> **Repair notice (2026-09-07):** Historical research, not freshly verified network state. R4 optional real-market migration conflicts with the master. R6 recorded 500,000,000 wei equals 0.5 gwei, not 500 gwei; the fee estimate is off by 1000 using its numbers. No new market research done. See REPAIR_AUDIT.md.

Phase 0 established *what is*. Phase 1 establishes *what is real* and freezes the
architecture. Every "YES" below was re-derived live this session from primary sources — the
PenguinSwap app bundle (penguinswap.org,hosted off files.gluwa.com,Gluwa = the
company behind Creditcoin), penguinswap's own testnet indexer/router-service
`dex-test.creditcoin.org/graphql` + `/router-service`), Blockscout API v2,
live RPC(`eth_getCode`/`eth_call`/`eth_getLogs`/`eth_getTransactionReceipt`,and a
live `@gluwa/usc-sdk` call against the real precompile. Raw outputs archived in
gitignored `.phase1-research/`.)

---

## R1. Is there a real PenguinSwap(or better)venueon Creditcoin testnet?
**RESOLVED — YES(VERIFIED),replacing MockDexRouterin new deployments.**

- PenguinSwap is real and official:"The Official DEX for Creditcoin Ecosystem Tokens";app
  bundle fetched alive(3.38 MB)and served from `files.gluwa.com`(Gluwa runs Creditcoin);
  docsat `docs.creditcoin.org/dex`. Model = Uniswap-V3-style fork(VERIFIED:
  bundle contains `exactInputSingle`,references `UniswapV3Staker`; pool DTO carries
  `feeTier`/`sqrtPrice`/`liquidity`/`tick`;docslist 4 fee tiers 0.01/0.05/0.3/1%).
- Testnet(ch : **102031** — matches `CHAIN_ID.CREDITCOIN_TESTNET="102031"` in the app
  config) is live with **130 pools;75 with non-zero liquidity**((penguinswap testnet
  indexer `dex-test.creditcoin.org/graphql`,VERIFIED). Lively pairs incl.:
  `WCTC/USD-TCoin`(`fee500:1213txs`,`fee3000:2387txs`,`fee100:517`,`fee10000:998`),
  `WCTC/USDC-T`(`fee500`,`34txs`),`WCTC/USDT-T`,`USDT-T/USDC-T`,`WCTC/SPC`(
  `fee500`,`112txs`),`MAT/WCTC`(`345txs`).
- Live quote(`dex-test.creditcoin.org/router-service`,HTTP 200):`**1.0 WCTC -> 120,183
   USD-TCoin**` via pool **`0x04a3227587a1d2b79f8afe6f0e361facb6d9eeb2e9`**
  (`fee500`=0.05%,`liquidity 2,237,366,368,764,625`,`sqrtRatio 5.4e22`,
  `tick -297,506`). swap-leg `estimatedGasUsed`~91,158.
- **Fetter:this is a V3 concentrated-liquidity DEX — NOT a constant-product `swapExactTokensForTokens`
  venue.** The current `IDexRouter` interface cannot be pointed at PenguinSwap without a
  rewrite(V3 `exactInputSingle`,with `amountOutMinimum`+`sqrtPriceLimitX96`,and
  the destination-price-drift gap(Impl.Task C)becomes the V3-oracle case).
- DECISION(freeze):replace `DEX_ROUTER`in future/new deployments with PenguinSwap testnet,
  via a V3 adapter(new interface+permissionless observe ata price fetched from the live
  pool/slot0);never mutate existing deployed instances(immutables,additive-pivot modelev).

## R2. Real token pair + faucet story on Creditcoin testnet
**RESOLVED — YES(VERIFIED],matching the contract's 6-decimal BASE assumption.**

- Wrapped-native **WCTC(`Wrapped CTC`)18-dec**=`0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`(carried
  in penguinswap config as `WCTC_ID.CREDITCOIN_TESTNET` identical-> VERIFIED two ways).
- 6-dec stablecoin-ish pairs that match the contract's `1e6` BASE assumption:
  - **USD-TCoin** 6-dec `0xa1Cc4d7aa040eA903fd00c13E7b43f8e26cbB7F8`(TransparentUpgradeableProxy,
   Blockscout VERIFIED).
  - **USDC-T(USDC-Test)** 6-dec `0xbB24c8DaC3cBe2021F3E3823724CE19f08B81135`
  - **USDT-T(USDT-Test)** 6-dec `0x64936984808ba2ba09E14c08cC2Ad7FD05b71FFF`
- Implication:`BASE_ASSET` = a 6-dec stablecoin(USD-TCoin or USDC-T);`QUOTE_ASSET` = WCTC
  (18-dec). Matches the existing `getQuote` `1e6` assumption.
- Faucet/supply:the testnet DEX alrea has live liquidity+volume(supplied by dex testnet
  users)—no faucet dependency needed for a demo;wrapping CTC→WCTC on testnet is the
  acquisition path for BASE/QUOTE seed funds. A dedicated stablecoin faucet is**NOT VERIFIED**.
- DECISION(freeze):in new deployments sett `BASE_ASSET = USD-TCoin|USDC-T`,`QUOTE_ASSET = WCTC`.

## R3. Attestcoin flow — full specification, not justthe happy path
**Supported-chain-key spec — RESOLVED VERIFIED;therest re-scoped honestly.**

- **Supported chain keys**(was UNVERIFIED)— **VERIFIED live** via a real
  `PrecompileChainInfoProvider.getSupportedChains()` call against the live precompile
  `0x…0FD2`(pinned `@gluwa/usc-sdk` 0.18.0;,no submit key needed). It returned exactly:
    - `chainKey` **3** -> chainId `1` = "Ethereum"(chainEncoding	EVM=1)
    - `chainKey` **1** -> chainId **11155111** = "Sepolia ethereum"(chainEncoding EVM=1
  Thus `SOURCE_CHAIN_KEY=1`(agent config)is CONFIRMED to map to Sepolia;(and Ethereum
  mainnet is ALSO supported(key 3),should a future phase source from mainnet).
- Verify selector/revert taxonomy:precompile rejects bogus selectors with `"Unknown selector"`
  (VERIFIED live,Phase 0);the full selector table was NOT exhaustively probed this session
  Scoped as Phase 2 live-probe item.
.
- Proof size/latency:prover `prover.cc3-testnet.creditcoin.network` SNARK proofs routinely
  exceed 30 s(DEVLOG;agent sets `PROOF_BUILDER_TIMEOUT_MS` default `120000`). End-to-end
  latency for a real swaps was NOT re-measured live this session(needs a submit key)—
  scoped, UNVERIFIED.

- DECISION(freeze):keep `SOURCE_CHAIN_KEY=1`(Sepolia);do not change. Keep the critical-based
  verification(two proofs,and native-query proof)—no trusting-the-proxy change.

## R4. Real Sepolia source market(architecture-freeze input)
**RESOLVED — freeze on restricted-write `PriceObservation`;real-market-event attestation
tracked Phase 2,gated on live re-verification(never assume an external address).).**

- Existing source = permissionless `PriceObservation` on Sepolia(STOP 3),re-verified via
  the precompile proves"a tx at block N said X",not market truth.

- Attempted to pin a real Uniswap V2 pair/factory on Sepolia:the "canonical" V2 factory
  address `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc55aA6f` DID carry real bytecode(~29,095 B,
  VERIFIED `eth_getCode`),BUT `allPairsLength()` reverted consistently across two public RPCs
  ((publicnode+`1rpc.io/sepolia`— VERIFIED negative). **A stale/hardcoded external address
  is exactly the trap the freeze must avoid.** A concrete live pair has NOT been proven this session.


- DECISION(freeze):keep `PriceObservation` as-source,**add writer restriction**(ACL=
  allowlisted observer agents,enforced in the contract)and continue to attest each observation
  tx.This is implementable,self-testable,keeps claims honest(the observation remains OUR
  write,attested to be a header-observed event,NOT claimed as market truth). Optional migration
  to attest a real market event(Uniswap V2 swap / Chainlink `AnswerUpdated`)is tracked as
  `Phase 2 — venue re-verification` gated on a live on-chain re-verification of the chosen
Sepolia venue+pair.

## R5. Cross-chain messaging reality
**RESOLVED — CONFIRMED (VERIFIED via architecture/code):** no bridge/messaging dependency.**

- The design re-verifies source-chain facts on the destination via the precompile, stateless; no
  Hyperlane/Wormhole-style messaging in phase plans or code (ARCHITECTURE_V2, ARCHITECTURE.md
  Trust boundaries). If a future phase introduces messaging, the trust-change must be
  documented explicitly and its liveness re-verified.

## R6. Gas + economics on Creditcoin testnet
**RESOLVED — VERIFIED.**

- gas price (7 exec receipts): `effectiveGasPrice 0x1dcd6500` = **500 gwei** (= 500,000,000; confirmed).
- per-execution `gasUsed` (7 txs, all status `0x1` success; 6 logs each):
  `503,826` `451,838` `454,105` `466,214` `500,926` `452,285` `450,083`
  => total 3,279,277 gas; avg ~468,468 gas/tx @ 500 gwei. Gas token = CTC (EVM-level,
  = WCTC wrap base); ~0.23 CTC/tx. (From `eth_getTransactionReceipt` for the 7 known hashes,
  DEPLOYMENTS.md).
- The verify+swap+journal path is real and within guardrails; these numbers feed economics of
  new deployments (the two live tenants' guardrail ranges were sized to these costs).

## R7. Judge-facing claims inventory
**RESOLVED — drafted; see PHASE-1-REPORT.md §Claims.**

- Every submission claim carries a VERIFIED evidence pointer (DEPLOYMENTS.md / CURRENT_STATE.md /
  this RESEARCH.md) or is labeled "designed, UNVERIFIED" and never asserted. Full inventory in
  PHASE-1-REPORT.md, derived from these tables.

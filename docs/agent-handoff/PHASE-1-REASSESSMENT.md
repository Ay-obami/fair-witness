# Phase 1 reassessment — 2026-09-07

Status: BLOCKED — previous architecture freeze is not acceptable against the master.
User authorized continuation after handoff repair. This session performed read-only
research and source inspection; no functional code changes or transactions.

## Verified evidence

Raw requests/responses: [RPC evidence](evidence/phase1-reassessment-rpc.json).
Observations are pinned to recorded blocks where applicable, not promises about
future state. Candidate addresses were sourced from official documentation or prior
raw research and then queried; no malformed address was repaired by guessing.

- Sepolia chain ID 11155111; official V3 factory
  `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` has 24,535 bytes of runtime code at
  block 11657190. Recent PoolCreated logs were returned.
- Official candidate USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` returned
  decimals 6; official WETH `0xfff9976782d46cc05630d1f6ebab18b2324d6b14` returned 18.
- Factory getPool returned the following USDC/WETH pools. Liquidity and slot0 were
  read; recent Swap events were queried over 2,001 blocks (inclusive).

| Fee | Pool | Liquidity (raw V3 units) | Swaps in queried window |
| --- | --- | --- | --- |
| 100 | 0xFeEd501c2B21D315F04946F85fC6416B640240b5 | 3213038353161721 | 3 |
| 500 | 0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1 | 14301126753669160 | 17 |
| 3000 | 0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50 | 7460283626998225 | 0 |
| 10000 | 0x6418EEC70f50913ff0d756B48d32Ce7C02b47C47 | 256840365168040787 | 2 |

Example actual source swap transaction:
`0x87acc8c99905098732854880f3e07c0f42772329371615d8173c0fcfa2fa7f61`;
receipt status 0x1, block 0xb1def2. This is an observed public swap, NOT a Fair Witness
execution or an Attestcoin proof. Pool token-order getters, implementation matching,
execution economics and proof generation still need verification before integration.

- Creditcoin chain ID 102031. Old documented destination pool string
  `0x04a3227587a1d2b79f8afe6f0e361facb6d9eeb2e9` is invalid (42 hex digits);
  RPC returned -32602. Actual candidate recovered from .phase1-research/route.json:
  `0x04a3227587a1d2b79f8afe6f0e361fabd6eeb6e9`.
- At Creditcoin block 5448772 that candidate has 22,142 bytes of code; token0
  `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`, token1
  `0xa1Cc4d7aa040eA903fd00c13E7b43f8e26cbB7F8`, factory getter
  `0xEcc68469F9c015A217215E19Fb6a183FE27aD1E9`, fee 500, liquidity
  2237366368764625, sqrtPriceX96 27475426404586945323648, tick -297506.
  These getters/code do not alone prove official router provenance, executable
  liquidity at size, independent economic value or a completed destination swap.
- Chain-info precompile 0x0000000000000000000000000000000000000fd3 returned
  chain key 1 = Sepolia (11155111), key 3 = Ethereum (1), encoding 1 at finalized.
  Old research conflated this with verifier 0x...0FD2. Installed SDK independently
  confirms the separate addresses. No proof generation/verification performed here.
- SDK 0.18.0 source encoding/abi/v1.ts encodes receipt status, gas used, log emitter,
  topics/data and bloom in the transaction envelope. This supports investigating a
  receipt-log decoder; it is not proof that the proposed decoder is implemented or safe.

## Required corrections before freezing architecture

1. **Real source is mandatory.** Restricted PriceObservation is not a substitute.
   Old F2's optional real-market migration conflicts with master §§19, 48, 60.
   Preserve inherited ACL work for review; do not treat it as completing Phase 2.
2. **Asset comparability unresolved.** The source candidate is USDC/WETH; old
   destination proposal is WCTC/USD-TCoin. Different quote assets cannot be compared
   as one arbitrage price. Matching decimals alone does not establish economic
   equivalence. Identify comparable assets or explicitly justified conversion evidence
   before choosing pools. No architecture change was made here.
3. **Receipt-based fact extraction needed.** Current treasury only decodes
   observePrice(uint256) calldata. A real Swap path must verify emitting pool,
   event signature/layout, transaction success, selected log identity, price units,
   and proof binding. Router calldata is not an executed swap price. Validate expected
   transaction destination/selector as required without confusing router and emitter.
4. **Replay identity concern (source-verified; exploit NOT VERIFIED).** _factKey hashes
   caller-supplied chainKey/blockHeight/transactionIndex. executeArbitrage passes
   Merkle/continuity proof to verifyAndEmit but not transactionIndex, and no comparison
   to proof-derived index is visible. Installed SDK exposes calculateTxIndex for this.
   Write a targeted same-proof/different-index regression and establish precompile
   semantics before approving action identity. Do not describe existing replay tests
   as covering this variation.
5. **Chain/freshness concerns (source-verified gaps; live exploits NOT VERIFIED).**
   Proof chain keys are checked against each other, not a constructor-bound source
   key. Block gap bounds do not alone establish freshness relative to an attested tip.
   Review these under Phase 3/5; do not claim expected-source/freshness fully proven.
6. **Destination path incomplete.** Verify factory-to-pool registration, official
   router/interface and bounded executable quote; resolve V3 drift/oracle manipulation
   and token units. Current router interface remains getAmountOut/swapExactTokensForTokens.
7. **Acceptance evidence incomplete.** No live proof for the selected swap, real
   destination execution, full adversarial matrix, structured hostile-output AI tests,
   or Supabase reasoning persistence has been verified in this session.

## Sources

- [Official Uniswap Ethereum/Sepolia deployment table](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments)
- [Official Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Official Creditcoin endpoints](https://docs.creditcoin.org/smart-contract-guides/creditcoin-endpoints)
- Local installed SDK: agent/node_modules/@gluwa/usc-sdk/src/encoding/abi/v1.ts,
  src/chain-info/index.ts, src/block-prover/index.ts.
- Treasury source: contracts/src/ASCTreasuryJournal.sol executeArbitrage,
  _factKey, _decodePriceObservation. These files were not modified.

## Validation and next exact action

No functional change, so prior fresh baseline remains the last run: forge 38/38,
agent 41/41, frontend build PASS with chunk warning. Not rerun here. Raw JSON and Git
diff checked at checkpoint. No live-state-changing commands, signers or secrets used.

Next: reproduce the transaction-index replay concern with a targeted test against
the actual proof-index semantics; continue read-only search for economically
comparable source/destination assets. Do not freeze F2 or begin market implementation
until these findings are resolved. Phase 1 is BLOCKED, not COMPLETE.

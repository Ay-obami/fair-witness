# Phase 1 Report — Research + Architecture Freeze(2026-09-07)

Entry-gate: Phase 0 audit(what is)complete. This phase establishes *what is real* and freezes the
architecture before any build work(Phase 2+. Every load-bearing fact was re-derived live this session —
penguinswap.org app bundle + its testnet indexer/router-service,Blockscout API v2,both chains' live
RPC,and a live `@gluwa/usc-sdk` call against the real precompile. Raw outputs archived in gitignored
`.phase1-research/`; labels carried into these handoff docs.

## 1. Gate questions — results

| R | Question | Result | Evidence pointer |
| --- | --- | --- | --- |
| R1 | Real DEX venue on Creditcoin testnet? | **YES — V3 PenguinSwap**(Gluwa's official Creditcoin DEX) | RESEARCH R1:130 pools/75 liquid;live quote 1 WCTC→120,183 USD-TCoin via pool `0x04a322…e2e9` |
| R2 | Real token pair + faucet? | **YES — WCTC ↔(USD-TCoin|USDC-T|USDT-T(6-dec** | RESEARCH R2: token addresses + decimals(Blockscout) |
| R3 | Attestcoin full spec? | **Chain-key spec VERIFIED**;selector/table+latency re-scoped | RESEARCH R3:getSupportedChains()→ key1=Sepolia 11155111,key3=Ethereum(1) |
| R4 | Real Sepolia source market? | Freeze on restricted-write PriceObservation;real-market-event deferred Phase 2 | RESEARCH R4;canonical V2 addr NOT responsive on Sepolia→don't hardcode |
| R5 | Cross-chain messaging? | CONFIRMED — none(stateless precompile re-verification) | RESEARCH R5 |
| R6 | Gas + economics on testnet? | **VERIFIED** — 500 gwei;~468k gas/exec;~0.23 CTC/tx | RESEARCH R6;read receipts of 7 executions |
| R7 | Claims inventory? | Drafted(§3. below) | this report;RESEARCH R7 |

## 2. Architecture freeze — decisions (must hold unless re-verified)

- **F1 — Destination(creditcoin testnet.** Future/new deployments replace `DEX_ROUTER`=
  MockDexRouter with PenguinSwap testnet via a **V3 adapter**, NOT a drop-in swap. Interface
  change from constant-product `getAmountOut`/`swapExactTokensForTokens` to V3
  `exactInputSingle`(with `amountOutMinimum`+`sqrtPriceLimitX96`;slot0 reads for a price.
  Parameters:`QUOTE_ASSET = WCTC 0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`,`BASE_ASSET =
  USD-TCoin 0xa1Cc4d7aa040eA903fd00c13E7b43f8e26cbB7F8`(or USDC-T 0xbB24c8DaC3cBe2021F3E3823724CE19f08B81135)
  (6-dec BASE matches the contract's `1e6` assumption). **NEVER mutate existing deployed instances**(
  immutables; additive-pivot redeploy model). The destination-price-drift gap(Impl. Task C/
  Task A disclosure) is open this phase — it is an open pre-condition before any real-pool-bound
  deployment (PenguinSwap's live liquidity on testnet is real, so this is the gating risk).

- **F2 — Source (Sepolia).** Keep `PriceObservation` on Sepolia as-source but **add writer
  restriction**(ACL = allowlisted observer agents,enforced in the contract),continue to attest each
  observation tx. Claims stay honest(it proves"a tx at block N said X",not market truth). Optional
  migration to attest a real market event(Uniswap V2 swap / Chainlink `AnswerUpdated`) is **Phase 2
  venue re-verification**, gated on a live on-chain re-verification of the chosen Sepolia venue+pair —
  no stale/hardcoded external address may be assumed(verified honestly:"canonical" Uniswap V2 factory
  does NOT respond on Sepolia).
- **F3 — Source chain key.** Keep `SOURCE_CHAIN_KEY=1` (Sepolia ethereum; chainKey 1 VERIFIED).
  Ethereum (chainKey 3) is ALSO supported, but unchanged.
- **F4 — No bridging.** Remain stateless cross-chain re-verification via the precompile;do not introduce
  Hyperlane/Wormhole-style messaging. If ever added,document the trust change explicitly.


## 3. STOP-condition resolution status (after Phase 1)

- **STOP 1 — mock DEX/destination.** RESOLVABLE: real venue PenguinSwap testnet identified;new
  deployments bind to it via F1. Gating risk = destination-price drift (Task C) on the V3 case, open.
- **STOP 2 — no mainnet-grade liquidity on testnet.** SOFTER:PenguinSwap testnet does carry real
  liquidity/volume(WCTC↔USD-TCoin etc.)usable for demo deployments bound via F1. NOT a claim of
  mainnet depth — still testnet-scale. Keep claims scoped.

- **STOP 3 — permissionless source.** PARTIALLY CLOSED by F2(writer restriction);market-worthiness
  of the price(real-market-event attest)deferred to Phase 2. Not yet resolved;the observation
  remains our write until Phase 2 venue re-verification completes.

## 4. Open items carried into Phase 2(do NOT claim closed)

- 【D1】V3 `exactInputSingle` adapter + `IDexRouter` interface rewrite;and slot0/price feed read from
  the live pool;unit + integration tests. Re-verify the on-chain DEX pool quote matches the
  router-service quote observed this phase.
- 【D2】Destination-price drift on V3(Task C: propose→execute gap / oracle read)—REQUIRED before any
  real-pool-bound deployment.
- 【D3】`PriceObservation` writer ACL(restricted writer,F2)+ tests.
- 【D4】Phase 2 venue re-verification(Sepolia real market event: Uniswap V2 swap /Chainlink
  `AnswerUpdated`);if chosen,a new `sepoliaWatcher` event decoder;prove prover cost/latency live.
- 【D5】Attestcoin precompile selector-table full live probe. The(destination drift oracle reader)
  needed by D2.
- 【D6】Live deployments still use MockDexRouter+ permissionless source;redeploy new tenants from
  hardened source once D1–D4 pass(unchanged for existing instances).

## 5. Claims inventory(R7 — what we may assert in the submission**

**VERIFIED claims(can assert with evidence pointers):**
- 【C1】A working end-to-end arbitrage system ran live on testnets: 7 real executions through the
  attestcoin precompile, journaled on-chain(6+1 entries),timestamps↔blocks matched exactly.
  [DEPLOYMENTS.md §Manifest]
- 【C2】Guardrails(mirror bounds,max trade size,per-epoch rate,slip/width/drift)enforced on-chain
  and pre-flight in the agent.[CURRENT_STATE;TEST_MATRIX forge 33/33]
- 【C3】Gas economics on Creditcoin testnet measured:~468k gas/exec @500 gwei;~0.23 CTC/tx.
  [RESEARCH R6;7 receipts]
- 【C4】Real destination venue identified for the next delivery:PenguinSwap(Gluwa Creditcoin DEX,
  V3,testnet chainId 102031)with live WCTC↔USD-TCoin pool.[RESEARCH R1/R2]
  (Live DEPLOYED demo tenants still bound to the mock venue (unchanged — no false claim of "live PenguinSwap" for them.

## Unverifiable/designed — say this, never implies-proven:
- The attested price is "the true market price". Until F2+venue re-verification(Phase 2),it proves
  only that a source-chain tx at a block claimed X,NOT market truth.
- PenguinSwap fee-tier/liquidity durability over time(no promise).
- Any hardcoded Sepolia venue address until re-verified live(lesson: R4 V2 factory negative).

_Phase 1 gate: all 7 gate questions RESOLVED with VERIFIED evidence or explicit negative +
explicit Phase 2 carry-over. Architecture freeze captured in §2. STOP checkpoint BEFORE Phase 2._

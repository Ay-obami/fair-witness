# Phase 1 Reassessment — Architecture Freeze V2

> **SUPERSEDED IN PART (2026-09-08):** The user selected a Sepolia-only testnet
> build. The Ethereum-mainnet source, chain key 3, and mainnet pool freeze in this
> document are no longer active. Phase 1 is reopened pending a verified comparable
> Sepolia source market. See `SEPOLIA-ONLY-REASSESSMENT.md`. Destination research
> remains useful but must be re-accepted as part of the new freeze.

Date: 2026-09-08
Status: COMPLETE — STOP checkpoint before Phase 2

This freeze supersedes the incompatible F1–F4 freeze in `PHASE-1-REPORT.md`.
It resolves the reassessment blockers using current official documentation,
read-only RPC evidence, installed SDK source, and the local replay regression.
It does not claim implementation, deployment, proof generation, or execution.

## Evidence classification

- **VERIFIED:** directly observed in the cited raw RPC responses, source, or tests.
- **STRONGLY SUPPORTED:** official project documentation plus matching live state.
- **ASSUMED:** an explicit testnet economic assumption; never a verified peg.
- **NOT VERIFIED:** deferred to the named implementation/deployment phase.

Raw evidence is under `evidence/`:

- `wctc-mainnet-market.json`
- `wctc-source-transaction.json`
- `market-pool-provenance.json`
- `penguinswap-router.json`
- `v3-oracle-capability.json`
- `attested-freshness.json`
- `proof-index-semantics.json`
- `phase1-reassessment-rpc.json`

## F1 — Comparable market pair

Canonical price for all new-path calculations:

```text
stablecoin units per 1 WCTC, scaled by 1e6
```

### Source — Ethereum mainnet, Uniswap V3

| Item | Frozen value | Evidence |
| --- | --- | --- |
| Attestcoin chain key | `3` | VERIFIED via chain-info precompile |
| EVM chain ID | `1` | VERIFIED via Ethereum RPC and chain-info |
| Factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` | VERIFIED getter/provenance |
| Pool | `0xdfe7BC8b4B21f5a812096AA965a322243218002E` | VERIFIED code + factory `getPool` |
| token0 | USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7` | VERIFIED pool getter |
| token1 | WCTC `0xeB32AD88b09fB94129a8B972876Ad02EaAc91E53` | VERIFIED pool getter; official Creditcoin WCTC announcement |
| Fee | `3000` (0.3%) | VERIFIED pool getter |
| Real activity | successful Swap receipt `0x5ccfdbe8f0770ba26a414c45c647eec33cdf1b541df635501d022568cdaf4664` | VERIFIED receipt status and pool log |

The official Creditcoin WCTC announcement describes the new WCTC as multichain
across Ethereum, Creditcoin, and BSC with unified liquidity. This is the basis for
using WCTC as the common asset. It is STRONGLY SUPPORTED identity, not proof of an
instant bridge or redemption during a trade.

### Destination — Creditcoin testnet, PenguinSwap V3

| Item | Frozen value | Evidence |
| --- | --- | --- |
| EVM chain ID | `102031` | VERIFIED RPC |
| Factory | `0xEcc68469F9c015A217215E19Fb6a183FE27aD1E9` | VERIFIED pool/router getters |
| Router | `0x3f65634837F914F18dBc4Db3E9d8Aa8F547f3229` | VERIFIED code, factory/WETH9 getters, `exactInputSingle` selector |
| Pool | `0x04a3227587a1D2b79f8AFE6F0e361fAbD6EEB6E9` | VERIFIED code + factory `getPool` |
| token0 | WCTC `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E` | VERIFIED pool/router getter |
| token1 | USD-TCoin `0xa1Cc4d7aa040eA903fd00c13E7b43f8e26cbB7F8` | VERIFIED pool getter |
| Fee | `500` (0.05%) | VERIFIED pool getter |

The former pool string ending `...facb6d9eeb2e9` was malformed. The value above
was recovered from the old raw router response and independently re-queried.

### Economic claim boundary

USDT and USD-TCoin are different contracts and are not cryptographically fungible.
For the testnet demonstration only, both are treated as nominal USD units.
That parity is **ASSUMED**, not VERIFIED. Therefore the project may claim:

> A real Ethereum WCTC market supplies independently attested price evidence, and
> a real PenguinSwap testnet pool executes a constrained WCTC trade.

It must not claim risk-free arbitrage, stablecoin redemption parity, mainnet-grade
destination liquidity, or realized economic profit. This limitation is acceptable
for the controlled testnet market fallback in master §22 and must remain visible in
the frontend and submission.

## F2 — Source fact architecture

Phase 2 replaces `PriceObservation.observePrice(uint256)` with an
`EthereumV3MarketObserver` deployed on Ethereum mainnet. It has:

- immutable source pool, factory, token0, token1, fee, and price scale;
- `observe()` with **no caller-supplied price**;
- a permissionless caller surface, because callers can only pay gas to record the
  configured pool-derived value;
- a read of the configured pool oracle/state, a nonzero-liquidity/unlocked check,
  and a `MarketPriceObserved` event containing pool identity, observation inputs,
  liquidity, and `priceE6`;
- constructor checks that pool getters and factory `getPool` match the frozen values.

The agent creates source and confirmation observations in different Ethereum
blocks. This provides reliable fresh facts without allowing arbitrary prices. The
event is an observer-produced record of a real market state, not a claim that the
observer itself is a DEX or an oracle with independent economic authority.

Destination verification decodes the Attestcoin transaction envelope and requires:

1. source chain key `3`;
2. successful transaction receipt;
3. transaction `to` equals the immutable observer;
4. calldata is exactly the `observe()` selector with no arguments;
5. exactly one matching `MarketPriceObserved` log from that observer;
6. logged pool equals the frozen Uniswap pool;
7. event topic/data shape is exact;
8. logged price is recomputed from the logged market value and token decimals;
9. source and confirmation indices equal `calculateTxIndex` for their verified
   Merkle paths;
10. confirmation is newer and within both gap and absolute-age bounds.

The installed USC SDK 0.18.0 includes receipt status and logs in `txBytes`, so this
design has a concrete encoding path. Full Solidity decoder tests and a real proof
remain Phase 2/3 acceptance requirements.

## F3 — Price and manipulation rules

New deployments use `BASE_ASSET = WCTC` and `QUOTE_ASSET = USD-TCoin`. Trade-size
guardrails are denominated in WCTC base units (18 decimals). This replaces the old
hard-coded six-decimal BASE assumption.

For source token0=USDT(6), token1=WCTC(18):

```text
priceE6 = floor(2^192 * 1e18 / sqrtPriceX96^2)
```

For destination token0=WCTC(18), token1=USD-TCoin(6):

```text
priceE6 = floor(sqrtPriceX96^2 * 1e18 / 2^192)
```

Implementation must use overflow-safe full-precision multiplication/division and
test token ordering, inversion, rounding, zero values, and extreme ticks.

Both pools expose `observe(uint32[])` and
`increaseObservationCardinalityNext(uint16)` (VERIFIED), but both currently report
cardinality `1`. Spot-only binding is forbidden. Before deployment:

1. increase each pool's observation cardinality to at least `16`;
2. wait until observations cover a 300-second window;
3. verify `observe([300, 0])` succeeds on both pools;
4. configure a 300-second arithmetic-mean-tick TWAP;
5. reject if spot-to-TWAP deviation exceeds an immutable bound;
6. calculate opportunity width from TWAP-normalized `priceE6` values;
7. use `amountOutMinimum` and post-swap balance deltas for execution slippage.

The state-changing cardinality increases are NOT performed in Phase 1. They are an
explicit Phase 2/4 deployment precondition, with transaction evidence required.

## F4 — Attestcoin, expected chain, freshness, and replay

Immutable new-instance configuration includes:

```text
BLOCK_PROVER = 0x0000000000000000000000000000000000000FD2
CHAIN_INFO   = 0x0000000000000000000000000000000000000FD3
SOURCE_CHAIN_KEY = 3
MAX_PROOF_AGE_BLOCKS = 64
MAX_CONFIRM_GAP_BLOCKS = 12 (recommended deployment value)
```

At the observed checkpoint, Ethereum head was 25,928,715 and the latest finalized
Attestcoin height was 25,928,680: a 35-block lag. The 64-block bound is a frozen
initial testnet value, measured against the **latest attested height**, not the
destination block number. Re-measure before deployment; changing it requires a new
immutable deployment configuration and documentation.

Execution requires chain-info to report an existing latest attestation, both proof
heights not above it, and `latestAttestedHeight - confirmHeight <= 64`. Existing
source/confirmation ordering, maximum gap, drift, proof verification, and source
contract/event checks remain mandatory.

The working-tree replay correction binds both submitted transaction indices to
`BLOCK_PROVER.calculateTxIndex` on the same verified Merkle paths. Its 5-test suite
and full 43-test contract regression pass locally. Existing deployments remain
unfixed and cannot be described as having this protection.

## F5 — Destination adapter and execution

Phase 4 introduces a fixed-purpose `PenguinV3Adapter`; the treasury never accepts
arbitrary router, pool, token, fee, path, recipient, or calldata. Constructor checks
bind the adapter to the frozen router/factory/pool/token/fee tuple.

The adapter exposes treasury-specific quote/execute methods, internally calling
PenguinSwap `exactInputSingle`. It supports only:

- sell WCTC for USD-TCoin when destination WCTC price exceeds the source price;
- buy WCTC with USD-TCoin when destination WCTC price is below the source price.

The treasury recomputes direction, width, bounded WCTC exposure, freshness, drift,
spot/TWAP deviation, and slippage at execution time. The AI cannot provide route or
calldata. The adapter sends output only to the treasury, clears/uses bounded approval,
checks balance deltas, and reverts on zero/insufficient output. A live static quote,
funded testnet swap, receipt, and pool Swap event are NOT VERIFIED and remain Phase 4
acceptance requirements.

## F6 — Preserved architecture

- Gemini remains the advisory runtime model; malformed output fails closed.
- Treasury remains the only fund holder and execution authority.
- Immutable per-tenant guardrails, isolated journals, action history, agent allowlist,
  no owner withdrawal, deterministic decision hash, and additive redeployment remain.
- Supabase must become the reasoning persistence backend with local fallback; it is
  not currently implemented and is not execution authority.
- Rejected attempts remain off-chain unless a safe non-reverting record path is later
  proven; reverted events are never claimed persistent.
- No bridge or messaging dependency is introduced into the execution trust path.

## Phase 1 acceptance and stop

The research/architecture blockers are resolved:

- common WCTC asset and exact pools selected;
- stable quote limitation classified honestly;
- source observation and receipt-decoding format specified;
- expected chain, absolute freshness, confirmation gap, and replay identity specified;
- real destination router/pool tuple and fixed adapter specified;
- manipulation protection and cardinality precondition specified.

Phase 1 is COMPLETE as an architecture phase. Nothing above is considered implemented
or live until its later phase acceptance evidence exists.

**STOP. Do not begin Phase 2 without a new explicit continuation instruction after
this checkpoint.**

Next exact action after approval: Phase 2 tests first for
`EthereumV3MarketObserver`, price conversion, receipt-log decoding, immutable source
chain/freshness configuration, and removal of the arbitrary price writer from the
new live path.

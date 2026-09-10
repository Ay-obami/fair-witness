# Phase 2 — Real Source Market

> **NOT ACCEPTED FOR CURRENT TARGET (2026-09-08):** The user selected a
> Sepolia-only source after this local implementation. Its chain ID 1, chain key 3,
> and mainnet pool assumptions are superseded. Preserve the code/tests for reuse but
> do not deploy them until Phase 1 freezes an exact Sepolia source venue. See
> SEPOLIA-ONLY-REASSESSMENT.md.

Date: 2026-09-08
Status: COMPLETE — local implementation checkpoint

## Implemented

- Added `EthereumV3MarketObserver`, whose no-argument `observe()` derives a
  300-second arithmetic-mean tick from the immutable Ethereum-mainnet Uniswap V3
  USDT/WCTC pool configuration. A caller cannot submit a price.
- Constructor validation binds factory, ordered tokens, fee, pool provenance, and
  6/18 token decimals. Runtime validation requires an unlocked pool, nonzero
  liquidity, and observation cardinality of at least 16.
- Added overflow-safe stablecoin-per-WCTC `priceE6` conversion using an attributed
  Uniswap-compatible TickMath implementation and OpenZeppelin full-precision mulDiv.
- Added `AttestedMarketEventDecoder` for the USC SDK v0.18 transaction/receipt
  envelope. It requires the exact observer destination, `observe()` call shape,
  successful receipt, one exact observer/pool event, 300-second window, nonzero
  liquidity, and a logged price that recomputes from the logged tick.
- Added `VerifiedMarketFactValidator`, binding BlockProver, ChainInfo, observer,
  source pool, source chain key, absolute proof age, and confirmation gap as
  immutables. It validates both proofs and both Merkle-derived transaction indices.
- Migrated the production agent watcher and environment template to Ethereum
  mainnet observer events. Runtime rejects an RPC whose actual chain ID is not 1
  and rejects `SOURCE_CHAIN_KEY` values other than 3.

The legacy `PriceObservation` and legacy treasury remain for historical deployment
inspection and local legacy tests. They are not the selected new live source path.

## Verified

- Source pool/factory/token/fee/activity and Attestcoin chain key 3 were verified
  read-only in Phase 1; see `PHASE-1-FREEZE-V2.md` and `evidence/`.
- Observer suite: 8 passing tests.
- Receipt decoder suite: 9 passing adversarial tests.
- Proof/freshness validator suite: 8 passing tests.
- Full Foundry suite: 68 passed, 0 failed.
- Full agent suite: 42 passed, 0 failed; TypeScript build passed.
- Frontend production build passed with the existing large-chunk warning.
- `git diff --check` passed before this report.

## Security properties covered

- caller cannot supply source price, pool, tokens, fee, or TWAP window;
- wrong pool provenance/configuration is rejected at observer construction;
- insufficient oracle history, locked pool, and zero liquidity reject observation;
- wrong chain, source, selector/call shape, receipt status, pool event, window,
  price, transaction index, proof, ordering, pair gap, and absolute age reject;
- duplicate matching market events reject;
- old Sepolia runtime configuration fails closed.

## Live evidence and limitations

- No contract was deployed and no blockchain transaction was sent in Phase 2.
- Both selected pools had observation cardinality 1 at the Phase 1 read-only check.
  Cardinality >=16 plus a filled 300-second history remains a deployment precondition.
- A real `EthereumV3MarketObserver` receipt, Attestcoin proof, and Creditcoin
  validation call are NOT VERIFIED. Those are Phase 3/10 live acceptance evidence.
- The new validator is the verified source-fact boundary; composition into the new
  treasury execution contract occurs with the Phase 4/5 destination/treasury work.
- USDT/USD-TCoin quote parity remains ASSUMED and must stay disclosed.

## Files added or migrated

- `contracts/src/source-chain/EthereumV3MarketObserver.sol`
- `contracts/src/VerifiedMarketFactValidator.sol`
- `contracts/src/interfaces/{IUniswapV3PoolMinimal,INativeChainInfo}.sol`
- `contracts/src/libraries/{V3TickMath,SourceWctcPriceMath,AttestedMarketEventDecoder}.sol`
- test-only V3/ChainInfo mocks and three new Foundry suites
- `agent/src/ethereumMarketWatcher.ts` and observer ABI
- agent config, startup, runner types, environment template, and tests

## Checkpoint

PHASE 2 COMPLETE

Next: Phase 3 hardens malformed-envelope behavior, proof-bound identity, live
precompile ABI compatibility, fuzz/invariant coverage, and prepares reproducible
read-only/live-proof verification without weakening the validator.

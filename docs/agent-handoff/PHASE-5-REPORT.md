# Phase 5 — Treasury Hardening

> **HISTORICAL LOCAL WORK (2026-09-08):** The generic treasury policy remains
> reusable, but this report predates the user's Sepolia-only source decision. It is
> not deployed or accepted as an integrated selected path while Phase 1 is reopened.
> See SEPOLIA-ONLY-REASSESSMENT.md.

Date: 2026-09-08
Status: COMPLETE locally; not deployed

## Implemented

- Added `FairWitnessTreasury`, a per-tenant treasury that immutably binds one
  `VerifiedMarketFactValidator` and one `PenguinV3Adapter`.
- The AI-facing execution surface accepts only a nonzero decision commitment and a
  proposed direction. The contract derives prices, direction, arbitrage width,
  trade size, input, minimum output, replay identity, freshness, and rate eligibility.
- Replay identity is `keccak256(address(treasury), factKey, ARBITRAGE)`, where the
  fact key uses proof-bound chain, block, and full `uint64` transaction index.
  Caller, reasoning, and decision hash cannot create another execution.
- Added source-confirmation drift and destination spot/TWAP deviation checks.
- Added immutable ceilings: slippage <= 1,000 bps, drift <= 1,000 bps,
  spot/TWAP deviation <= 500 bps, actions per epoch <= 100, and epoch length from
  60 seconds through 30 days.
- Eligibility requires the measured edge to clear the tenant minimum edge, maximum
  permitted slippage, immutable V3 pool fee rounded upward to basis points, and a
  20 bps execution reserve. This closes a case where a trade could pass the width
  check but be negative at its permitted minimum output.
- The treasury has no arbitrary-call, router, token, pool, fee, recipient,
  withdrawal, sweep, or ownership-renunciation path. Failed swaps atomically roll
  back approval, replay, rate, and journal state.
- Added `FairWitnessTreasuryFactory`, a permissionless factory with immutable
  validator and adapter dependencies and independent per-owner treasury indexing.
  The factory has no administrator or dependency replacement path.

## Verification

- Targeted treasury/factory suite: 18 passed, 0 failed, including both directions,
  replay across agents/reasoning, invalid AI direction, proof drift, destination
  manipulation, worst-case execution costs, rate limiting, guardrail ceilings,
  insufficient balance, failed-swap rollback, no withdrawal/renounce, fuzzed trade
  sizing, and tenant isolation.
- Full Foundry suite: 103 passed, 0 failed.
- Agent: 42 passed, 0 failed; TypeScript build passed.
- Frontend: oxlint passed; production build passed with the existing large-chunk
  warning.
- Repository-wide `forge fmt --check` still reports inherited formatting drift.
  All Phase 5 Solidity files were formatted.

## Trust boundary and limitations

- `decisionHash` is only required to be nonzero in Phase 5. The canonical structured
  payload and off-chain hash verification belong to Phase 7.
- The validator owns proof-age and confirmation-gap immutables; the treasury cannot
  weaken them.
- Direct treasury deployment remains possible, but the canonical path is the
  immutable factory. A direct deployment cannot affect the factory registry.
- No new contract is deployed. No pool cardinality, approval, funding, or swap
  transaction was sent. Live Phase 4 acceptance remains blocked on both pools having
  filled 300-second oracle history and a reviewed deployment/funding/execution run.
- USDT/USD-TCoin parity remains ASSUMED.

## Files

- `contracts/src/FairWitnessTreasury.sol`
- `contracts/src/FairWitnessTreasuryFactory.sol`
- `contracts/test/FairWitnessTreasury.t.sol`

No blockchain transaction was sent in this phase.

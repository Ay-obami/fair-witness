# Phase 4 — Real Creditcoin Market

> **PAUSED (2026-09-08):** The source architecture was reopened after the user
> selected Sepolia-only. Destination adapter work remains locally useful, but Phase 4
> cannot resume until Phase 1 freezes a comparable Sepolia source market. See
> SEPOLIA-ONLY-REASSESSMENT.md.

Date: 2026-09-08
Status: IN PROGRESS — local adapter complete; live acceptance not verified

> **Fresh readiness checkpoint:** `PHASE-4-READINESS.md` and the new read-only
> `contracts/script/audit-live-path.js` re-verified both venue tuples. Both pools
> remain at cardinality/current-next `1/1`; known tenant wallets have no WCTC or
> USD-TCoin; no Ethereum signer is configured. No transaction was sent.

## Implemented and tested

- Added `PenguinV3Adapter` for the verified Creditcoin-testnet PenguinSwap V3
  WCTC/USD-TCoin tuple.
- Constructor binds router, factory, pool, ordered tokens, fee, factory `getPool`,
  router factory, and 18/6 decimals.
- Only two routes exist: WCTC to USD-TCoin and USD-TCoin to WCTC.
- Router, pool, token pair, fee, recipient, and calldata cannot be supplied by the
  caller. Output always goes back to the caller, which will be the future treasury.
- Every swap checks the 300-second destination TWAP is available, pool is unlocked,
  cardinality is at least 16, and liquidity is nonzero.
- Adapter pulls exactly the approved input, grants a bounded router approval, clears
  it after use, and requires both actual output balance delta and router return value
  to agree and clear `amountOutMinimum`.
- Destination price math exposes both TWAP and spot prices in canonical `priceE6`
  units for the future treasury's drift/manipulation check.

## Verification

- Adapter suite: 9/9 PASS, covering both directions, venue mismatch, stale deadline,
  zero amounts, insufficient cardinality, retained input, and falsified router output.
- Full Foundry suite: 85 passed, 0 failed.
- Phase 1 read-only evidence verifies code and provenance for router
  `0x3f65634837F914F18dBc4Db3E9d8Aa8F547f3229`, factory
  `0xEcc68469F9c015A217215E19Fb6a183FE27aD1E9`, and pool
  `0x04a3227587a1D2b79f8AFE6F0e361fAbD6EEB6E9`.

## Remaining acceptance blocker

The selected destination pool still had observation cardinality 1 at the last
read-only check. No adapter is deployed and no funded real PenguinSwap swap has been
sent. A real receipt and pool Swap event are therefore NOT VERIFIED. Completing
Phase 4 requires the later reviewed state-changing sequence: increase destination
cardinality, wait for 300 seconds of observations, deploy the final composed
contracts, fund the testnet treasury, execute a bounded swap, and record the receipt.

No blockchain transaction was sent in this phase.

# Phase 5 Handoff

## Status

COMPLETED

## Current Phase

Phase 5 — Rebalancing

## Objective

Implement deterministic two-asset portfolio accounting and rebalancing through the existing verified-evidence, policy, treasury execution, and journal boundary.

## Completed

- Values stable raw units as E6 and WCTC using the confirmed verified source price.
- Computes total value, floored current WCTC allocation, target value, deviation, required adjustment, and capped permitted adjustment deterministically.
- Treats the target tolerance band inclusively.
- Derives buy/sell direction exclusively from current allocation versus target.
- Caps value by required adjustment, rebalance maximum, and universal maximum.
- Converts sell value to WCTC input with conservative floor rounding; stable buy input equals E6 permitted value.
- Requires exact proposal input and distinguishes oversized from non-exact smaller proposals.
- Journals current WCTC bps, target bps, permitted value, evaluated-state hash, and actual amounts.
- Added the matching TypeScript `RebalancingStrategy`.
- Consolidated duplicated verified-market checks shared with arbitrage.
- Measured treasury and factory runtime sizes after implementation.

## Files Changed

- `contracts/src/FairWitnessTreasury.sol`
- `contracts/test/FairWitnessTreasury.t.sol`
- `contracts/test/FairWitnessRebalancing.t.sol`
- `agent/src/abi/FairWitnessTreasury.json`
- `frontend/src/abi/FairWitnessTreasury.json`
- `agent/src/strategies/rebalancing.ts`
- `agent/src/strategies/index.ts`
- `agent/test/rebalancingStrategy.test.ts`
- `master_instruction.md`
- `docs/handoffs/PHASE_5_HANDOFF.md`

## Contracts Changed

- `FairWitnessTreasury`: activated the `REBALANCE` branch and shared verified-market validation.
- Arbitrage semantics remain unchanged; risk reduction remains fail closed.
- Legacy contracts remain untouched.

## Database Changes

- NONE

## Tests Added

- Above-target capped sell and below-target buy.
- Inclusive upper/lower tolerance boundaries.
- Empty and one-sided portfolios.
- Conservative zero-after-rounding behavior.
- Universal/rebalance cap intersection.
- Wrong direction, oversized amount, and smaller amount rejection.
- Allocation, target, permitted value, and actual amount journal assertions.

## Tests Passing

- `cd contracts && forge test`: 109 passed, 0 failed across 12 suites.
- `cd agent && npm test`: 82 passed, 0 failed across 11 files.
- `cd agent && npm run build`: passed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the pre-existing bundle-size warning.

## Deployment Changes

- NONE. Client treasury ABI regenerated locally; no broadcast or address change.

## Security Impact

- AI cannot calculate or choose portfolio value, allocation, direction, adjustment, or amount.
- Both tolerance boundaries fail closed without execution.
- Any wrong-direction, oversized, or altered deterministic amount is durably rejected without movement.
- Rebalancing uses the same mandatory Attestcoin evidence and destination-market gates as arbitrage.

## Known Limitations

- Risk reduction remains fail closed until Phase 6.
- Schema-v1 runtime remains undeployed and is not wired to legacy addresses.
- Treasury runtime is 20,073 bytes with 4,503 bytes of EIP-170 margin.
- Factory runtime is 23,973 bytes with only 603 bytes of EIP-170 margin.

## Remaining Work

- Run a Phase 6 size spike before implementing the full risk branch.
- Implement exposure-only risk reduction only if deployable bytecode remains possible without changing locked security boundaries.
- Complete later journal/indexer, UX, adversarial, and deployment phases.

## Next Phase

Phase 6 — Risk Reduction, subject to an immediate contract-size gate.

## Locked Decisions That Must Not Change

- Portfolio contains exactly WCTC and stable.
- Stable is one E6 value unit; WCTC uses confirmed verified price.
- Tolerance is inclusive and arithmetic floors conservatively.
- Direction must reduce deviation and proposal input must exactly match policy.
- AI decides only `EXECUTE` or `WAIT`.
- One treasury and one security boundary remain locked.

## Architectural Concerns

- Factory runtime has only 603 bytes remaining. The expected Phase 6 risk branch will likely exceed EIP-170. Do not silently introduce proxies, delegatecalls, external mutable policy, or split fund custody. Stop and request explicit architecture review if scope-neutral code-size reduction cannot preserve the locked design.

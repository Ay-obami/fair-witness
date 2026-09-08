# Phase 4 Handoff

## Status

COMPLETED

## Current Phase

Phase 4 — Arbitrage Migration

## Objective

Make arbitrage the first executable schema-v1 strategy using verified Attestcoin evidence, deterministic policy, the fixed adapter, and the strategy-aware attempt journal.

## Completed

- Added typed dual-proof arguments to generic proposal submission.
- Calls the immutable `VerifiedMarketFactValidator` and derives the locked evidence hash from returned facts.
- Classifies validator failure as stale or invalid and records caller-claimed proof locations without marking them verified.
- Enforces source price validity, drift, and liquidity.
- Reads destination TWAP, spot, pool fee, and liquidity from the frozen adapter and classifies market failures.
- Derives signed direction, gross edge, proposal slippage, pool fee, fixed reserve, and net edge deterministically.
- Derives an edge-scaled value capped by strategy policy, universal policy, and current input balance, then requires exact token input.
- Computes minimum output internally and enforces execution rate inside the rollback-safe self-call.
- Populates verified evidence status, proof locations, permitted value, net edge, evaluated-state hash, and actual execution values.
- Added deterministic TypeScript arbitrage strategy, canonical AI prompt, and schema-v1 policy submitter.
- Preserved configured legacy runner/deployments without relabeling or repointing them.

## Files Changed

- `contracts/src/FairWitnessTreasury.sol`
- `contracts/test/FairWitnessTreasury.t.sol`
- `contracts/test/FairWitnessArbitrage.t.sol`
- `agent/src/abi/FairWitnessTreasury.json`
- `frontend/src/abi/FairWitnessTreasury.json`
- `agent/src/strategies/arbitrage.ts`
- `agent/src/strategies/arbitragePrompt.ts`
- `agent/src/strategies/index.ts`
- `agent/src/proposals/builder.ts`
- `agent/src/policySubmitter.ts`
- `agent/test/arbitrageStrategy.test.ts`
- `agent/test/proposalSchema.test.ts`
- `master_instruction.md`
- `docs/handoffs/PHASE_4_HANDOFF.md`

## Contracts Changed

- `FairWitnessTreasury`: typed proof verification and deterministic arbitrage policy/execution activated.
- Legacy `ASCTreasuryJournal`, legacy factory, validator, and adapter semantics were not changed.

## Database Changes

- NONE

## Tests Added

- Valid deterministic verified sell and buy.
- Evidence-hash mismatch and stale evidence classification.
- Source drift and source/destination liquidity rejection.
- Wrong direction and exact-amount mismatch rejection.
- Destination spot/TWAP manipulation rejection.
- Insufficient net edge rejection.
- Execution failure rollback and journal persistence.
- TypeScript deterministic sizing/cost mirror and closed AI prompt tests.

## Tests Passing

- `cd contracts && forge test`: 105 passed, 0 failed across 11 suites.
- `cd agent && npm test`: 78 passed, 0 failed across 10 files.
- `cd agent && npm run build`: passed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the pre-existing bundle-size warning.

## Deployment Changes

- NONE. ABI changed locally for typed proof submission; generated client ABI was refreshed. No broadcast occurred.

## Security Impact

- Arbitrage execution is unreachable without successful Attestcoin proof and semantic validation.
- The treasury independently derives evidence identity, market validity, direction, edge, size, and minimum output.
- AI output remains limited to `EXECUTE|WAIT` plus rationale/tags and cannot alter execution terms.
- Failed/rejected attempts cannot retain approvals, execution keys, execution counters, or token movement.

## Known Limitations

- Contract integration tests use a typed validator stub for policy isolation; the unchanged real validator has its own 13-test suite covering native proof, freshness, index, chain, and receipt semantics.
- The schema-v1 agent modules are not wired to configured legacy addresses because those deployments expose the legacy ABI.
- The demonstration executes only the Creditcoin-side bounded action; it does not prove acquisition/bridging or closed-loop profit.
- Rebalancing and risk reduction remain fail closed.
- Treasury runtime is 18,127 bytes; factory runtime is 21,978 bytes with only 2,598 bytes remaining. Contract size must be watched closely in Phases 5–6.

## Remaining Work

- Implement deterministic two-asset rebalancing in Phase 5.
- Implement exposure-only risk reduction and daily usage in Phase 6.
- Wire the schema-v1 runtime only after new deployment addresses exist.
- Expand real-validator end-to-end proposal integration during adversarial/demo hardening.

## Next Phase

Phase 5 — Rebalancing

## Locked Decisions That Must Not Change

- Evidence must be verified and evidence hash derived on-chain.
- Gross edge must cover pool fee, proposal slippage, fixed reserve, and minimum net edge.
- Direction and amount are exact deterministic policy outputs.
- AI response contains no execution terms.
- One frozen pair, venue, route, and recipient remain enforced.
- Controlled test liquidity is not naturally occurring profitable arbitrage.

## Architectural Concerns

- Factory runtime size is approaching the EIP-170 limit; Phase 5 must measure size before completion and may require authorized bytecode factoring if the locked single-treasury architecture cannot fit.

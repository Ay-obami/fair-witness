# Phase 1 Handoff

## Status

COMPLETED

## Current Phase

Phase 1 — Domain and Strategy Abstraction

## Objective

Introduce the shared typed agent domain, closed strategy/action/decision vocabulary, deterministic strategy interface, locked risk-first dispatch, and evaluation-snapshot lifecycle without changing the live legacy arbitrage runner.

## Completed

- Added closed numeric `StrategyType`, `ActionType`, `TradeDirection`, and `AutomationMode` enums plus string `DecisionOutcome`.
- Added the three-bit enabled-strategy mask and helpers.
- Added typed source/confirmation evidence, destination market, portfolio, verified context, immutable mandate/policy snapshots, discriminated strategy metrics, candidates, and constrained AI decision.
- Added strict runtime parsing for untrusted AI decisions. It rejects missing/malformed values, unbounded metadata, duplicate tags, unknown strategies/outcomes, and every extra field—including amount, venue, slippage, deadline, route, recipient, and calldata.
- Added `Strategy.evaluate(VerifiedContext, MandateSnapshot) -> Candidate | null`.
- Added a closed coordinator that rejects invalid/duplicate strategy modules, dispatches only mandate-enabled strategies, and validates returned candidate semantics and snapshot hashes.
- Locked dispatch and selection order to Risk Reduction, Rebalancing, then Arbitrage, independent of module registration order.
- Added an evaluation cycle that exposes at most one candidate and invalidates all candidates after execution.
- Preserved the legacy runtime unchanged; the new abstractions are intentionally side-by-side until later migration phases.

## Files Changed

- `agent/src/domain/types.ts` — added.
- `agent/src/domain/aiDecision.ts` — added.
- `agent/src/domain/index.ts` — added.
- `agent/src/strategies/strategy.ts` — added.
- `agent/src/strategies/coordinator.ts` — added.
- `agent/src/strategies/index.ts` — added.
- `agent/test/domain.test.ts` — added.
- `agent/test/strategyCoordinator.test.ts` — added.
- `master_instruction.md` — updated persistent phase/test state.
- `docs/handoffs/PHASE_1_HANDOFF.md` — added.

## Contracts Changed

- NONE.

## Database Changes

- NONE. Supabase remains present and non-authoritative.

## Tests Added

- 19 domain/AI-boundary tests.
- 6 coordinator/priority/snapshot tests.
- Coverage includes enum order, strategy bitmap, malformed AI output, prohibited execution fields, bounded metadata, priority, enabled-only dispatch, duplicate/invalid modules, snapshot/hash mismatch, treasury mismatch, unknown strategy bits, duplicate candidates, single candidate claim, and post-execution invalidation.

## Tests Passing

- `cd agent && npm test -- --run test/domain.test.ts test/strategyCoordinator.test.ts`: 25/25 passed.
- `cd agent && npm test -- --run`: 67/67 passed across 8 files.
- `cd agent && npm run build`: passed.
- `cd contracts && forge test`: 103/103 passed across 9 suites.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed; existing >500 kB bundle warning remains.

## Deployment Changes

- NONE. No contract deployment, transaction, address, script, environment, network configuration, or chain state changed.

## Security Impact

- Future AI output is structurally confined to `EXECUTE|WAIT`, one closed strategy, rationale, and bounded reason tags.
- Extra execution instructions cannot enter an `AiDecision` through the runtime parser.
- Strategy priority is deterministic and cannot be selected by the AI or module registration order.
- Candidates must bind to the active treasury, evidence, observation, and policy snapshot.
- An evaluation snapshot yields at most one candidate and becomes unusable after execution.
- This phase adds no execution authority and does not weaken Attestcoin, treasury, replay, slippage, venue, asset, or custody boundaries.

## Known Limitations

- The new domain/strategy layer is not yet integrated into the legacy runner; that is intentional for Phase 1 compatibility.
- Concrete strategy eligibility/accounting/sizing is not implemented. Arbitrage, rebalancing, and risk arithmetic belong to Phases 4, 5, and 6.
- Canonical proposal structs, encoders, hashes, nonces, and Solidity parity belong to Phase 2.
- Runtime address/hash-shape validation is not part of Phase 1; contract/hash boundary validation follows in later phases.
- Existing Sepolia WCTC independent-market limitations remain unchanged.
- Frontend bundle-size warning remains pre-existing and deferred.

## Remaining Work

- Implement canonical Proposal schema v1 and exact TypeScript/Solidity hash parity.
- Add golden vectors for proposal ID, evidence hash, policy hash, and strategy-scoped execution key.
- Keep new types side-by-side with legacy types until the locked migration phase for each consumer.

## Next Phase

Phase 2 — Canonical Proposal and Hash Parity

## Locked Decisions That Must Not Change

- Strategies remain exactly Arbitrage, Rebalancing, and Risk Reduction.
- AI output contains no execution terms and can decide only `EXECUTE` or `WAIT` plus explanatory metadata.
- Candidate direction and exact amount are deterministic.
- Strategy priority remains Risk Reduction -> Rebalancing -> Arbitrage.
- At most one candidate may proceed from one treasury evaluation snapshot.
- Strategy-specific financial math is not to be improvised during proposal-schema work.
- No arbitrary calldata, route, recipient, venue, asset universe, or user-written strategy.
- The existing Attestcoin validator/observer/adapter semantics must not be weakened.

## Architectural Concerns

- NONE

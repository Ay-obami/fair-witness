# Phase 11 Handoff

## Status

COMPLETED

## Current Phase

Phase 11 — Demo Hardening

## Objective

Provide repeatable, honest controlled demonstrations for arbitrage, rebalancing, and valid/invalid risk reduction without adding a new security authority.

## Completed

- Added bounded preview-first pool control through the already-deployed official routers; no helper contract was required.
- Added baseline reset and 0.50–2.00 target-price mechanics derived from actual V3 pool state.
- Hardened risk rehearsal modes with dynamic nonces, genuine Attestcoin proofs, explicit progress, state assertions and fail-safe pausing.
- Added `/demo` with real Phase 10 evidence links and explicit rehearsal/completed distinctions.
- Updated mandate defaults, navigation, deployed addresses and mandatory controlled-market disclosure.
- Added the complete operator runbook for three scenarios, reset, WAIT, replay and network degradation.
- Exercised Attestcoin readiness failure: the live oversized attempt stopped while paused and did not submit a proposal.

## Files Changed

- `contracts/script/control-demo-market.js`
- `agent/src/controlledDemoValidSmoke.ts`
- `agent/package.json`
- `agent/.env.example`
- `agent/test/deploymentReadiness.test.ts`
- `frontend/src/lib/controlledDemo.ts`
- `frontend/src/lib/controlledDemo.test.ts`
- `frontend/src/components/ControlledDemoNotice.tsx`
- `frontend/src/routes/Demo.tsx`
- `frontend/src/routes/Mandate.tsx`
- `frontend/src/components/layout.tsx`
- `frontend/src/main.tsx`
- `frontend/.env.example`
- `docs/CONTROLLED_DEMO_RUNBOOK.md`
- `master_instruction.md`
- `docs/handoffs/PHASE_11_HANDOFF.md`

## Contracts Changed

- NONE.

## Database Changes

- NONE. Live Supabase remains unavailable without project credentials.

## Tests Added

- Two operator-boundary tests: preview default, manifest binding, bounded target, cleared approval, real swap use and no caller-supplied observation price.
- Two frontend tests locking disclosure language, deployed treasury, chain and owner/agent separation.

## Tests Passing

- `cd contracts && forge test`: 121 passed.
- `cd contracts && forge build --sizes`: treasury 20,954 bytes; factory 24,521 bytes (55-byte margin).
- `cd agent && npm test`: 109 passed across 16 files.
- `cd agent && npm run build`: passed.
- `cd frontend && npm test`: 6 passed across 2 files.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the existing large-chunk warning.

## Deployment Changes

- No contract deployment or treasury/policy mutation.
- Controlled exposure was topped to 1,500 fwWCTC during the aborted oversized rehearsal setup in `0xc921ef379cc881ed7ff6ee018be8159f65675c7a12350a2cfc6589afdbe2c16f`; this is an operator setup action, not AI execution.
- Treasury final verified mode remained paused; attempt count remained 2.

## Security Impact

- Market control is outside the treasury and explicitly disclosed; it cannot move treasury funds.
- Controller is fixed to manifest pools/routers, bounded, preview-first and clears token approval.
- Risk rehearsals enable only after proofs verify and re-pause in `finally`.

## Known Limitations

- Live oversized rejection was not captured because Attestcoin readiness exceeded the SDK retry ceiling; do not claim otherwise.
- Arbitrage and rebalancing are rehearsal-ready with deterministic/local coverage but do not yet have captured public-testnet execution receipts.
- Main `agent/src/index.ts` remains the legacy runner; use the controlled runbook/scripts, not the legacy entrypoint, for schema-v1 demos.
- Supabase live projection, explorer source verification and fresh-browser hosted rehearsal remain pending.
- Frontend retains the existing large bundle warning.

## Remaining Work

- Phase 12 must perform release-truth audit, reconcile stale legacy copy/config, verify explorer source where feasible, and decide whether unavailable live oversized/arbitrage/rebalance receipts block the intended release claim.
- Retry oversized rehearsal only when Attestcoin cache is healthy; never replace proofs with fixtures while calling the result live.

## Next Phase

Phase 12 — Final Documentation and Release Audit

## Locked Decisions That Must Not Change

- Mandatory controlled-market label and no natural-arbitrage, bridge, peg, profit or production claims.
- Genuine Attestcoin evidence for every claimed live autonomous action.
- AI proposes; deterministic policy authorizes; treasury executes.
- Treasury stays paused outside supervised runs; owner and agent remain distinct.
- No generic routing, price setter, arbitrary calldata or new custody path.

## Architectural Concerns

- NONE. Missing live receipts are release-evidence limitations, not architecture changes.

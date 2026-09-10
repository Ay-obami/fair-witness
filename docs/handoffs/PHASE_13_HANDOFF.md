# Phase 13 Handoff

## Status

COMPLETED

## Current Phase

Phase 13 — Live Demo Completion

## Objective

Close the missing controlled public-testnet receipts for Arbitrage, Rebalancing, and oversized Risk Reduction rejection without changing the locked security architecture.

## Completed

- Captured genuine Attestcoin-backed oversized Risk Reduction rejection as attempt 3 with protected state unchanged.
- Corrected the Sepolia SwapRouter02 tuple in the bounded market controller and moved/reset price through real swaps with approvals cleared.
- Added RPC failover and a closed Gemini-gated controlled runner for Arbitrage and Rebalancing.
- Health-checked and used `gemini-3.1-flash-lite`, then aligned the non-secret sample and code defaults with that verified model.
- Captured controlled Arbitrage execution as attempt 4 with a 1,234 bps policy-derived net edge.
- Captured controlled Rebalancing execution as attempt 5 from a verified 54.99% WCTC allocation against the 40% target.
- Updated manifest, frontend evidence links, runbook, release audit, deployment record, adversarial matrix, README, CI, and persistent memory.
- Preserved the incorrect free-text Rebalancing rationale as an explicit untrusted-AI security demonstration.

## Files Changed

- `contracts/script/control-demo-market.js`
- `contracts/deployments/controlled-demo-schema-v1.json`
- `contracts/deployments/controlled-demo-market-actions.json`
- `agent/src/controlledDemoValidSmoke.ts`
- `agent/src/controlledDemoStrategySmoke.ts`
- `agent/src/config.ts`
- `agent/.env.example`
- `agent/package.json`
- `agent/test/deploymentReadiness.test.ts`
- `frontend/src/lib/controlledDemo.ts`
- `frontend/src/lib/controlledDemo.test.ts`
- `frontend/src/routes/Demo.tsx`
- `README.md`
- `docs/ADVERSARIAL_TEST_MATRIX.md`
- `docs/CONTROLLED_DEMO_RUNBOOK.md`
- `docs/RELEASE_AUDIT.md`
- `docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md`
- `.github/workflows/ci.yml`
- `master_instruction.md`
- `docs/handoffs/PHASE_13_HANDOFF.md`

## Contracts Changed

- NONE.

## Database Changes

- NONE.

## Tests Added

- Operator-boundary coverage for network-specific router tuples and non-executable AI output.
- Manifest checks now require five attempts, three executions, and all controlled scenario records.
- Frontend checks require public receipts for all strategies and oversized rejection.

## Tests Passing

- Contracts: `forge test --summary` — 121 passed, 0 failed.
- Contracts: `forge build --sizes` — passed; `FairWitnessTreasury` runtime size 20,954 bytes and `FairWitnessTreasuryFactory` runtime size 24,521 bytes.
- Agent: `npm test` — 113 passed; `npm run build` — passed after post-phase operator-queue hardening.
- Frontend: `npm test` — 9 passed; `npm run lint` and `npm run build` — passed after post-phase public-request hardening.

## Deployment Changes

- No contracts deployed.
- Controlled source price moved to 1.15 in `0x78283169e6b408bf547e4e7f26fc8bb916d389a61ea8fb5eed3641c5ef1febcc` and reset to 1.00 in `0x63856acac8456d15fe4469fc9638d8638c0c70fa777d7d8fdb28ddd670077609`.
- Oversized rejection: `0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc`.
- Arbitrage execution: `0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39`.
- Rebalancing execution: `0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f`.
- Treasury latest readback after post-phase public-request rehearsal: paused, 6 attempts, 4 executions.

## Security Impact

- No policy, custody, contract, asset, venue, or limit changed.
- AI remained limited to typed `EXECUTE|WAIT`; deterministic code derived every execution field and the treasury reverified it.
- Incorrect AI rationale did not alter strategy, amount, direction, venue, or authorization.

## Known Limitations

- Controlled tokens/pools still prove mechanics only, not bridging, redemption, natural arbitrage, or profitability.
- Rebalancing AI rationale was semantically wrong and is disclosed; its typed strategy/outcome and deterministic policy result were correct.
- Live Supabase audit projection remains pending. Post-phase submission hardening verified schema-v1 source on both explorers, rehearsed the hosted desktop/mobile site, and added a non-authoritative public demo-request queue.
- The default continuous agent entrypoint remains legacy; controlled scripts are the schema-v1 demo path.
- Public RPC, Attestcoin, and model latency remain variable.

## Remaining Work

- No remaining public receipt gap for the three controlled strategies or oversized-risk rejection.
- Optional operational work: live Supabase audit projection.

## Next Phase

NONE — further work requires explicit user scope.

## Locked Decisions That Must Not Change

- AI proposes; deterministic policy authorizes; treasury executes.
- Genuine Attestcoin proof verification is mandatory for claimed live autonomous actions.
- Controlled assets/liquidity must never be represented as bridged, redeemable, natural arbitrage, profitable, or production-grade.
- Treasury remains paused outside supervised demonstrations with distinct owner and agent roles.
- No arbitrary calldata, generic routing, new custody path, or strategy expansion.

## Architectural Concerns

- NONE.

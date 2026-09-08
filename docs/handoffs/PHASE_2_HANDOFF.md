# Phase 2 Handoff

## Status

COMPLETED

## Current Phase

Phase 2 — Canonical Proposal and Hash Parity

## Objective

Define the canonical schema-v1 proposal and policy/evidence hash inputs in Solidity and TypeScript, implement deterministic proposal construction, and prove exact cross-language hash parity without changing treasury behavior.

## Completed

- Added the exact locked schema-v1 `Proposal`, closed enums, evidence hash input, policy structs, and policy hash input.
- Added `abi.encode`-equivalent Solidity and TypeScript functions for proposal ID, execution key, evidence hash, and policy hash.
- Locked evidence domain to `keccak256("FAIR_WITNESS_EVIDENCE_V1")` and policy domain to `keccak256("FAIR_WITNESS_POLICY_V1")`.
- Locked policy encoding order to schema, chain ID, treasury, WCTC, stable, venue, universal policy, arbitrage policy, rebalance policy, risk policy, automation mode, and policy epoch.
- Added a deterministic ProposalBuilder that derives assets and venue from the mandate/direction, rejects policy mismatch, enforces widths and nonzero commitments, and never accepts AI execution terms.
- Locked nonce representation to an explicit durable per-agent `uint64` supplied by trusted orchestration; persistence and on-chain consumption belong to later phases.
- Added shared golden vectors and domain/field-sensitivity tests in both languages.
- Ran targeted and complete contract, agent, and frontend regression suites.

Published golden vector for chain `102031`, treasury `0x6666666666666666666666666666666666666666`:

- evidence hash: `0x5b4f0f2a41cd0bc59b85e16fe4528575db25c79d63875b2eb208afa9e228010d`
- policy hash: `0xc2f1a976e0b4f34bb98757bf8d0ad1385443b47a7dabba50c089f997d3d8d3dd`
- proposal ID: `0x343b6f24f17d257706b7f11f4b8f482f6afddd1206391fed43a940ff381fbe21`
- execution key: `0x4f75099d5463c2fec6b9c12709451b0cb863c2277b6c066850ae8b7bd75062c0`

## Files Changed

- `contracts/src/interfaces/IFairWitnessTypes.sol`
- `contracts/src/libraries/FairWitnessHashing.sol`
- `contracts/test/FairWitnessHashing.t.sol`
- `agent/src/proposals/types.ts`
- `agent/src/proposals/hashing.ts`
- `agent/src/proposals/builder.ts`
- `agent/src/proposals/index.ts`
- `agent/src/domain/index.ts`
- `agent/test/proposalSchema.test.ts`
- `master_instruction.md`
- `docs/handoffs/PHASE_2_HANDOFF.md`

## Contracts Changed

- Added a type-only `IFairWitnessTypes` interface.
- Added the internal pure `FairWitnessHashing` library.
- No existing treasury, factory, validator, adapter, storage layout, ABI, or execution behavior changed.

## Database Changes

- NONE

## Tests Added

- Solidity enum ordinal and four-hash golden-vector parity tests.
- Solidity chain/treasury domain separation, strategy-scoped execution key, and field-sensitivity tests.
- TypeScript enum parity, golden-vector, domain separation, field-sensitivity, and ABI-width tests.
- ProposalBuilder derivation and rejection tests for mismatched policy, excessive slippage, zero amount, and nonce overflow.

## Tests Passing

- `cd contracts && forge test`: 108 passed, 0 failed.
- `cd agent && npm test`: 75 passed, 0 failed across 9 files.
- `cd agent && npm run build`: passed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the pre-existing bundle-size warning.

## Deployment Changes

- NONE. New types and hashing library are undeployed compile-time artifacts. No ABI was regenerated because no runtime contract ABI changed.

## Security Impact

- Establishes an unambiguous, domain-separated proposal identity for Phase 3.
- Keeps AI output outside all execution fields; ProposalBuilder accepts only deterministic candidate, mandate, and trusted orchestration envelope inputs.
- Binds policy identity to chain, treasury instance, immutable pair/venue/policies, automation mode, and monotonic policy epoch.
- Makes evidence execution identity strategy-scoped while binding it to the treasury instance.
- Does not yet authorize proposals or protect funds; existing treasury paths remain unchanged until Phase 3 migration.

## Known Limitations

- Phase 2 does not persist or enforce nonce consumption, proposal replay, or execution keys on-chain.
- Phase 2 does not validate Attestcoin proof bodies; it only defines the hash of already verified typed facts.
- The ProposalBuilder is not integrated with the legacy agent runner.
- Concrete deterministic strategy arithmetic remains unimplemented.
- TypeScript `ethers` ABI encoding performs evidence/policy width validation at encoding time; Phase 3 still must validate all contract inputs explicitly.

## Remaining Work

- Implement Phase 3 generic treasury/policy skeleton using these exact types and hashes.
- Add on-chain schema, mode, policy hash, deadline, agent nonce, proposal ID, and strategy/evidence replay enforcement.
- Integrate the typed evidence bundle and rejection-aware attempt journal in their scheduled phases.
- Generate committed client ABI only after the Phase 3 runtime contract ABI exists.

## Next Phase

Phase 3 — Generic Treasury and Policy Skeleton

## Locked Decisions That Must Not Change

- Schema version is `1`; proposal fields, widths, and enum ordinals are exact.
- All canonical hashes use `abi.encode`, never packed encoding.
- Proposal ID is `keccak256(abi.encode(chainId, treasury, proposal))`.
- Execution key is `keccak256(abi.encode(treasury, strategy, action, evidenceHash))`.
- Policy hash encoding order and schema domains published above are fixed.
- AI output cannot populate asset, venue, amount, slippage, deadline, nonce, target, selector, route, recipient, or calldata.
- One exact-input swap action, one WCTC/stable pair, one frozen venue, and three closed strategies remain the full scope.
- Existing treasury behavior must not be presented as migrated until Phase 3 explicitly changes it.

## Architectural Concerns

- NONE

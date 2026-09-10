# Final Release Audit

Date: 2026-09-09
Migration phase: 12
Release classification: **CONTROLLED-DEMO READY WITH DISCLOSED LIMITATIONS**

This is an evidence-backed development release, not a production deployment or profitability claim.

## Release statement

Fair Witness implements one trust-minimized execution boundary for three closed strategies: arbitrage, rebalancing, and risk reduction. AI output is confined to `EXECUTE` or `WAIT`; deterministic code derives execution terms, the schema-v1 treasury enforces policy, and the fixed adapter is the only capital-moving path.

The contracts are deployed on public Sepolia and Creditcoin testnets against explicitly controlled `fwUSD`/`fwWCTC` pools. Those tokens are demonstrations only: they are not bridged, redeemable, economically pegged, or evidence of naturally occurring profitable arbitrage.

## Evidence inventory

| Claim | Evidence | Status |
|---|---|---|
| Three strategy policy branches | Foundry contract tests and TypeScript strategy tests | Verified locally |
| Malicious AI cannot choose execution terms | `securityBoundary.integration.test.ts`, domain/schema tests | Verified locally |
| Rejections preserve capital | Foundry adversarial matrix, including 256-run oversized-risk fuzz | Verified locally |
| Schema-v1 deployment and immutable readback | Frozen deployment manifest and Phase 10 deployment record | Verified on public testnets |
| Genuine Attestcoin-backed execution | Risk-reduction smoke receipt recorded in the deployment record | Verified on public testnets |
| Paused policy rejection | Rejection receipt and unchanged balances recorded in the deployment record | Verified on public testnet |
| Arbitrage live demo | Genuine observations/proofs, Gemini EXECUTE, attempt 4 and public execution receipt | Verified on controlled public testnets |
| Rebalancing live demo | Genuine observations/proofs, Gemini REBALANCE/EXECUTE, attempt 5 and public execution receipt | Verified on controlled public testnets |
| Oversized risk rejection live demo | Genuine observations/proofs, attempt 3, reason 28 and protected-state assertions | Verified on public testnet |
| Supabase audit projection | Migration, static schema tests, in-memory index/reconciliation tests | Not applied to a live Supabase project |

Exact addresses, transaction hashes, readbacks, and controlled-market disclosure are in `docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md` and `contracts/deployments/controlled-demo-schema-v1.json`.

## Security invariants and test references

`docs/ADVERSARIAL_TEST_MATRIX.md` maps every mandatory malicious, stale, replayed, unauthorized, oversized, strategy-invalid, and valid-execution case to a concrete test. Contract execution remains fixed-pair, fixed-venue, exact-input, policy-derived, replay protected, and fail-closed on evidence or market failure.

The treasury owner and registered agent are distinct. The deployed treasury is paused outside supervised runs. Supabase, the frontend, the model, RPC providers, and the agent host are not authorization authorities.

## Deployment consistency

- Source: Sepolia, chain ID `11155111`.
- Destination: Creditcoin testnet, chain ID `102031`.
- Treasury: `0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3`.
- Treasury owner: `0xF40003d36567478489BcCF1a1fEd094f87EeC9a5`.
- Registered agent: `0xB1D19F71d68c4e7065749e8593D338E9A30D654f`.
- Recorded final mode: paused; attempt count 6; execution count 4 after the public-request rehearsal.

A post-Phase 13 RPC smoke re-confirmed the owner, registered agent, paused mode, attempt count 6, and execution count 4. The current policy hash differs from the creation-time manifest readback because supervised enable/pause transitions monotonically advanced the policy epoch, as designed.

Public request `0302054a-aa7e-466d-bc59-77733440a75d` was processed through the service-role operator queue and completed as Arbitrage attempt 6 (`0xe9ea7fa5b420bbc310c6d1b1f7eed24e9a0df025cfda3ced47447b582ab7752a`). The controlled market was reset and temporary approvals were zero afterward.

The root README, frontend controlled-demo constants, deployment record, frozen manifest, and master instruction use these schema-v1 addresses. Historical documents retain their content behind explicit superseded/legacy banners.

## Release checks

The release gate runs:

- all Foundry tests and contract size reporting;
- all agent tests and TypeScript build;
- all frontend tests, lint, and production build;
- required source-of-truth file and Phase 1–12 handoff checks;
- rejection of tracked private `.env` files.

The factory runtime is 24,521 bytes, only 55 bytes below EIP-170. Any future contract change requires an immediate size check.

## Secrets review

Private runtime values remain in ignored environment files. No private environment file may be tracked; CI enforces this. Example environment files contain placeholders only. A historical credential exposure is documented as rotated; repository history should still be rewritten before any stricter public-production release if that history remains reachable.

## Known limitations

- Controlled markets do not establish real token equivalence, natural arbitrage, or profitability.
- All three controlled strategies now have genuine Attestcoin-backed public receipts, and oversized Risk Reduction has a public rejection receipt.
- Rebalancing's AI rationale incorrectly described arbitrage even though its typed choice was `REBALANCE/EXECUTE`; deterministic policy ignored the prose and enforced the correct strategy math. Preserve this disclosure.
- The default `agent/src/index.ts` entrypoint remains the legacy runner. Schema-v1 demonstrations use the controlled scripts/runbook.
- Supabase has not been migrated or smoke-tested against a live project.
- Schema-v1 observer, adapter, validator, factory, and treasury source are verified on Blockscout. The canonical Vercel deployment passed desktop/mobile fresh-browser rehearsal on 2026-09-10.
- The frontend build retains a non-blocking large-bundle warning.
- This is testnet demonstration software and has not received an independent production security audit.

## Allowed and prohibited claims

Allowed: Fair Witness demonstrates that an untrusted AI can recommend actions while deterministic policy and a non-custodial agent boundary constrain treasury execution.

Prohibited: production-ready, production-profitable, naturally occurring cross-chain arbitrage, bridged/redeemable demo tokens, unrestricted AI trading, or completion of live scenarios without their receipts.

## Final determination

The Phase 0–12 migration is implementation-complete for a controlled hackathon demonstration. Remaining items are clearly scoped operational evidence and production-hardening work; they do not weaken the locked architecture, but they constrain what may be claimed.

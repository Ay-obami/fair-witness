# Fair Witness Documentation

This directory contains the documentation that is useful for understanding, auditing, running, or extending the current schema-v1 Fair Witness system. Historical build diaries, phase handoffs, migration scratchpads, and superseded architecture documents are intentionally kept out of the public documentation surface; Git history remains the provenance record for those artifacts.

## Start here

| Document | Purpose |
|---|---|
| [`WHITEPAPER.md`](WHITEPAPER.md) | Product thesis, architecture, Attestcoin integration, security model, controlled-demo evidence and roadmap. |
| [`ATTESTCOIN_INTEGRATION.md`](ATTESTCOIN_INTEGRATION.md) | Dedicated walkthrough of the Attestcoin SDK, proof flow, Creditcoin verification and semantic validation. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Current architecture, trust boundary, lifecycle and component responsibilities. |
| [`architecture/SECURITY_MODEL.md`](architecture/SECURITY_MODEL.md) | Threat model, mandatory invariants, attack controls and residual risks. |
| [`architecture/POLICY_MODEL.md`](architecture/POLICY_MODEL.md) | Deterministic policy schema and authorization stages. |
| [`architecture/PROPOSAL_SCHEMA.md`](architecture/PROPOSAL_SCHEMA.md) | Schema-v1 proposal fields, hashes and replay identities. |
| [`architecture/STRATEGY_MODEL.md`](architecture/STRATEGY_MODEL.md) | Arbitrage, rebalancing and risk-reduction strategy semantics. |
| [`architecture/DATA_FLOW.md`](architecture/DATA_FLOW.md) | Evidence -> decision -> proposal -> attempt -> execution record linkage. |
| [`architecture/TEST_STRATEGY.md`](architecture/TEST_STRATEGY.md) | Test layers and security assertions. |
| [`ADVERSARIAL_TEST_MATRIX.md`](ADVERSARIAL_TEST_MATRIX.md) | Concrete adversarial cases and the tests that protect capital. |
| [`AUDIT_DATA_DICTIONARY.md`](AUDIT_DATA_DICTIONARY.md) | Optional Supabase audit projection and authority rules. |
| [`CONTROLLED_DEMO_RUNBOOK.md`](CONTROLLED_DEMO_RUNBOOK.md) | How to validate the controlled public-testnet demonstration. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Current frontend/agent deployment and release checks. |

## Sources of truth

For deployed addresses and bytecode commitments, use `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`. For enforcement behavior, the Solidity contracts and tests are authoritative. For runtime behavior, the agent implementation and tests are authoritative. Documentation explains those surfaces but does not override them.

## Historical material

Older arbitrage-only contracts, historical manifests and receipts remain in the repository where they are useful as code/evidence. Superseded planning documents and internal handoff logs are not maintained as current documentation. Use Git history if you need to reconstruct the development process.

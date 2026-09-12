# Final Release Audit

Date updated: 2026-09-12  
Release classification: **CONTROLLED-DEMO READY WITH DISCLOSED LIMITATIONS**

This is an evidence-backed hackathon release, not a production deployment or profitability claim.

## Release statement

Fair Witness implements a trust-minimized execution boundary for three closed strategies: Risk Reduction, Rebalancing, and Arbitrage. The AI reasoning layer is confined to `EXECUTE` or `WAIT` for a deterministic candidate. It cannot own treasury funds or choose arbitrary assets, venue, route, recipient, calldata, policy or an amount above the treasury-computed ceiling.

The current product creates user-owned lifecycle treasuries from a permissionless factory. A treasury independently validates Attestcoin evidence, source/destination market quality, replay state, policy, portfolio state, balance, execution-rate limits and maximum permitted sizing before calling one immutable V3 adapter.

The public markets and tokens are controlled demonstrations only. They do not represent a bridge, redemption relationship, natural market arbitrage or production profitability.

## Current deployment generation

The authoritative current deployment record is:

`contracts/deployments/controlled-demo-schema-v1-lifecycle.json`

Current lifecycle values:

| Component | Network | Address / value |
|---|---|---|
| Source observer | Sepolia | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Source V3 pool | Sepolia | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |
| Fixed destination adapter | Creditcoin CC3 | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Attestcoin fact validator | Creditcoin CC3 | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| **Current lifecycle factory** | Creditcoin CC3 | `0x494490bBF748e59a659227F46510535BF3818442` |
| Factory deployment block | Creditcoin CC3 | `5465730` |
| Controlled faucet / recycle reserve | Creditcoin CC3 | `0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A` |

The deployed lifecycle factory commits to `FairWitnessTreasury` creation-code hash `0x74a08f82b8271ed2008a6b27b0398ef4d6065536febf6a2850eb4e3a2ab45afc` and size `24,986` bytes through immutable external bytecode stores. CI rebuilds the treasury with pinned Foundry dependencies and verifies both values against the lifecycle manifest.

## Historical public evidence

The earlier schema-v1 generation remains a valid public evidence set and is documented by `contracts/deployments/controlled-demo-schema-v1.json`. It is **historical evidence**, not the factory used for new product treasuries.

Captured receipts:

- Risk Reduction execution: `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4`
- Rebalancing execution: `0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f`
- Arbitrage execution: `0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39`
- Oversized Risk Reduction rejection: `0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc`

These prove public-testnet execution/rejection mechanics for the earlier schema-v1 treasury. They must not be presented as receipts from a newly created lifecycle treasury.

## Security evidence inventory

| Claim | Evidence | Status |
|---|---|---|
| Three closed strategy policy branches | Foundry + TypeScript strategy tests | Verified in CI |
| AI cannot choose arbitrary execution terms | domain/integration tests + treasury validation | Verified in CI |
| Oversized/replayed/invalid proposals preserve protected capital | Foundry adversarial/fuzz tests | Verified in CI |
| Genuine Attestcoin proof boundary | validator/decoder tests + historical public receipts | Verified |
| Current treasury bytecode equals deployed factory commitment | pinned dependency build + CI hash/size gate | Verified in CI |
| Current deployment references are internally consistent | release-consistency script | Verified in CI |
| Public wallet/treasury cache stores no user email | migration/client structural CI gate | Verified in CI |
| Current browser/hosted end-to-end rehearsal after this hardening pass | `docs/PRE_SUBMISSION_CHECKLIST.md` | **Must be rerun operationally before submission** |

## Security boundary

The treasury and adapter—not the model, frontend, Supabase, RPC provider or agent host—are the capital authorization boundary.

Relevant protections include:

- fixed WCTC/stable pair and immutable adapter/venue;
- immutable validator and Attestcoin source identities;
- proposal, nonce and evidence replay protection;
- policy-hash binding and policy epochs;
- owner-only agent registration and pause/autonomous lifecycle state;
- maximum action, strategy-specific and daily risk ceilings;
- source drift, source liquidity, destination liquidity and destination spot/TWAP checks;
- deadline/slippage/rate limits;
- deterministic strategy priority `Risk Reduction → Rebalancing → Arbitrage`;
- exact-input swaps through the fixed adapter while proposal size is bounded by a deterministic **maximum permitted amount**, not an exact-equality requirement;
- permanent treasury close semantics; controlled demo balances recycle to the configured reserve.

The production-shaped runner additionally performs static on-chain preflight. A normal proposal is broadcast only if preflight returns reason `None`. Known preflight rejections are logged as `WAIT`, and JIT state-change retries fail closed rather than broadcasting after exhaustion.

## Release checks

CI runs:

- pinned Foundry dependency installation;
- all Foundry tests;
- `forge build --sizes`;
- deployed treasury creation-code hash and size verification;
- generated ABI drift detection;
- all agent tests and TypeScript build;
- all frontend tests, lint and production build;
- release/source-of-truth consistency checks;
- required architecture/handoff/checklist presence;
- tracked private `.env` rejection;
- public `user_instances` email-persistence rejection.

## Privacy and optional projections

Supabase remains non-authoritative. The browser-facing `user_instances` projection stores only public wallet↔treasury information. Login email/social identity is not persisted there. The dashboard independently verifies cached instances against the current factory and on-chain owner.

## Demo abuse boundaries

The factory is permissionless and does not impose a per-user treasury quota. The controlled faucet therefore remains vulnerable to Sybil depletion if distributed broadly. For the hackathon release this is mitigated operationally by deliberately limited faucet inventory and manual refilling.

The gas sponsor adds a process-level daily budget, per-address cooldown and maximum top-up. Those are demo safeguards, not production authentication or Sybil resistance.

## Known limitations

- Controlled market conditions do not establish production-grade oracle economics or natural profitability.
- The autonomous worker is a single-process hackathon service rather than a durable distributed job/lease system.
- Public RPC, prover and model latency can interrupt a cycle; the authorization path fails closed.
- Source/destination liquidity floors in the current controlled-product mandate are demonstration settings and are not suitable as production market-manipulation protection.
- The faucet is finite and not Sybil-resistant.
- Historical and current deployment generations coexist in Git for provenance; active release documentation explicitly distinguishes them.
- This software has not received an independent production security audit.

## Allowed and prohibited claims

Allowed: Fair Witness demonstrates that an untrusted AI reasoning layer can recommend actions while genuine Attestcoin evidence and deterministic non-custodial treasury policy constrain capital movement on Creditcoin.

Prohibited: production-ready, production-profitable, naturally occurring cross-chain arbitrage, bridged/redeemable demo tokens, unrestricted AI trading, or completion of a current lifecycle end-to-end rehearsal that has not actually been run.

## Final submission gate

Run `docs/PRE_SUBMISSION_CHECKLIST.md` against the deployed Vercel and Railway services after this hardening branch is released. If that clean-browser rehearsal passes, freeze the submission build. Do not create another contract generation unless the rehearsal exposes a protocol-level custody, authorization, replay, evidence-verification or lifecycle invariant failure.

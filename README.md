# Fair Witness

**Trust-minimized execution for autonomous financial agents on Creditcoin.**

> **AI proposes. Deterministic policy authorizes. Treasury executes.**

Fair Witness lets an AI reasoning layer decide *whether* to act while keeping the actual authority to move capital inside a deterministic on-chain treasury. The model does not receive custody, arbitrary calldata, arbitrary routes, or permission to rewrite the user's mandate.

**Live app:** https://fair-witness.vercel.app/

## Why it exists

AI is useful for interpreting changing conditions, but an AI recommendation should not be equivalent to transaction authority. Fair Witness separates intelligence from authority:

```text
cross-chain market observation
        ↓
Attestcoin evidence
        ↓
deterministic candidate
        ↓
AI: EXECUTE or WAIT
        ↓
on-chain policy verification
        ↓
bounded treasury execution
```

If the reasoning layer is wrong, stale, manipulated, oversized, or malicious, the treasury still independently verifies the evidence and recomputes the policy result before any capital can move.

## What is enforced on-chain

Each user owns an independent `FairWitnessTreasury` created through a permissionless factory. Its mandate fixes the supported assets, venue, enabled strategies, action limits, slippage limits, evidence/market constraints, portfolio targets, risk limits, replay protection, and rate limits.

The reasoning layer can return only **EXECUTE** or **WAIT** for a deterministic candidate. It cannot choose arbitrary assets, recipients, contracts, selectors, routes, calldata, policy values, or action sizes.

The current schema-v1 treasury supports three strategies:

- **Arbitrage** — act on a verified cross-market discrepancy only when the deterministic net-edge requirements pass.
- **Rebalancing** — move the two-asset portfolio toward a fixed WCTC target when it leaves the allowed tolerance band.
- **Risk reduction** — reduce WCTC exposure when it exceeds the mandate's maximum, subject to per-action and daily caps.

Normal policy failures are journaled with stable reason codes. Successful actions are linked to evidence, proposal, evaluated state, execution identity, and actual token movement.

## Security boundary

Fair Witness is designed around a simple assumption: the AI, prompt, model provider, agent host, database, public RPCs, and submit key may all fail or be compromised.

The safety boundary therefore lives elsewhere:

- treasury capital stays in the user's treasury contract;
- Attestcoin proofs are verified on Creditcoin and semantically validated against the expected observer/market;
- policy recomputes direction, valuation, amount limits, market constraints, replay state, and rate limits;
- the adapter is bound to the intended venue/pair and returns output to the treasury;
- rejected proposals create no token approval or asset movement;
- Supabase is an optional projection/cache and never authorizes execution.

See [`docs/ATTESTCOIN_INTEGRATION.md`](docs/ATTESTCOIN_INTEGRATION.md) for the dedicated cross-chain verification walkthrough, [`docs/architecture/SECURITY_MODEL.md`](docs/architecture/SECURITY_MODEL.md) for the threat model, and [`docs/ADVERSARIAL_TEST_MATRIX.md`](docs/ADVERSARIAL_TEST_MATRIX.md) for the adversarial test evidence.

## Controlled public-testnet demonstration

Because no sufficiently active comparable market existed across the supported public testnets, Fair Witness uses explicitly controlled V3 test markets to exercise real cross-chain transactions, real Attestcoin proofs, real Creditcoin verification, and real policy-constrained treasury execution.

**The market conditions are synthetic; the verification and execution path are not.** The controlled `fwUSD`/`fwWCTC` assets are testnet-only, independently issued, and do not imply a bridge, redemption mechanism, natural arbitrage, production liquidity, or profitability.

Current lifecycle deployment:

| Component | Value |
|---|---|
| Creditcoin chain ID | `102031` |
| Factory | `0x494490bBF748e59a659227F46510535BF3818442` |
| Factory deployment block | `5465730` |
| Controlled faucet/reserve | `0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A` |
| Validator | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| Destination adapter | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia observer | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia source pool | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |

The machine-readable source of truth is [`contracts/deployments/controlled-demo-schema-v1-lifecycle.json`](contracts/deployments/controlled-demo-schema-v1-lifecycle.json). Historical receipts remain in the repository as evidence, but historical factories are not used for new treasuries.

## Product flow

1. Sign in with the embedded-account flow.
2. Build a mandate and create a user-owned treasury.
3. Fund it with controlled test assets, authorize the bounded submitter, and enable autonomous mode.
4. The agent observes the source market, obtains Attestcoin evidence, derives a deterministic candidate, and asks the reasoning layer for EXECUTE/WAIT.
5. The treasury re-verifies and authorizes or rejects the proposal on-chain.
6. Inspect attempts in **Activity**, open the schema-v1 **Decision Detail** view, or independently locate an attempt from **Verify**.

The dashboard's Observe → Prove → Reason → Authorize → Execute pipeline is backed by per-treasury runtime telemetry from the agent service; it is not a decorative progress rail.

## Run locally

Requirements: Node.js 22+ and Foundry.

```bash
# contracts
cd contracts
./install-deps.sh
forge test -vvv

# frontend
cd ../frontend
npm ci
npm run dev

# agent
cd ../agent
npm ci
npm run build
npm start
```

Copy the relevant `.env.example` files and supply your own values. Never commit private keys, service-role keys, OTPs, or private `.env` files.

Release consistency can be checked from the repository root:

```bash
npm run check:release
```

## Repository layout

```text
contracts/   Solidity treasury, factory, validator, adapter, strategies and tests
agent/       market observation, proof acquisition, deterministic candidate logic,
             reasoning boundary, proposal building, submission and runtime telemetry
frontend/    React product: onboarding, dashboard, activity, verification and safeguards
docs/        public architecture, security, policy, audit and operations references
scripts/     release consistency checks
```

## Documentation

Start with the [`Fair Witness Whitepaper`](docs/WHITEPAPER.md), then use [`docs/README.md`](docs/README.md) as the technical documentation index.

The most useful references are:

- [`docs/WHITEPAPER.md`](docs/WHITEPAPER.md) — product thesis, architecture, evidence, limitations and roadmap
- [`docs/ATTESTCOIN_INTEGRATION.md`](docs/ATTESTCOIN_INTEGRATION.md) — dedicated Attestcoin SDK → proof → Creditcoin verification walkthrough
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — current system architecture and trust boundary
- [`docs/architecture/SECURITY_MODEL.md`](docs/architecture/SECURITY_MODEL.md) — threats, invariants and residual risks
- [`docs/architecture/POLICY_MODEL.md`](docs/architecture/POLICY_MODEL.md) — deterministic authorization rules
- [`docs/architecture/PROPOSAL_SCHEMA.md`](docs/architecture/PROPOSAL_SCHEMA.md) — typed proposal/commitment model
- [`docs/CONTROLLED_DEMO_RUNBOOK.md`](docs/CONTROLLED_DEMO_RUNBOOK.md) — controlled-market validation procedure
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — frontend/agent/release deployment guide
- [`docs/AUDIT_DATA_DICTIONARY.md`](docs/AUDIT_DATA_DICTIONARY.md) — audit projection and authority rules

## Scope and limitations

Fair Witness is currently a public-testnet system. The controlled markets demonstrate the verification and execution path, not production liquidity or economic profitability. Testnet venue/oracle depth can be thin, model availability affects liveness, a compromised registered submitter can cause bounded gas/storage use, and immutable-policy mistakes require migration to a new treasury.

Those limitations are intentionally separated from the core security claim: **the reasoning layer does not get to turn an arbitrary recommendation into arbitrary capital movement.**
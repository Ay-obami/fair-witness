# Fair Witness Architecture

Fair Witness is a trust-minimized execution system for autonomous financial agents on Creditcoin.

> **AI proposes. Deterministic policy authorizes. Treasury executes.**

The central design goal is to let a reasoning system contribute timing and judgment without giving it arbitrary transaction authority or custody of user capital.

## System overview

```text
 Sepolia controlled V3 market
          │
          │ observation transaction
          ▼
 Market observer
          │
          │ source + confirmation chain positions
          ▼
 Attestcoin proof builder
          │
          │ proof objects
          ▼
 ┌──────────────────────────── off-chain ────────────────────────────┐
 │ Agent                                                              │
 │  1. verify/read market + portfolio context                         │
 │  2. derive a deterministic strategy candidate                      │
 │  3. ask reasoning layer: EXECUTE or WAIT                           │
 │  4. build typed schema-v1 proposal                                 │
 └──────────────────────────────────┬─────────────────────────────────┘
                                    │ proposal + proofs
                                    ▼
                         FairWitnessTreasury
                                    │
                ┌───────────────────┴───────────────────┐
                │                                       │
                ▼                                       ▼
     VerifiedMarketFactValidator              deterministic policy
     Attestcoin verification                  mandate / replay / rates
     semantic event validation                valuation / caps / market
                │                                       │
                └───────────────────┬───────────────────┘
                                    │ approved only
                                    ▼
                           PenguinV3Adapter
                                    │
                                    ▼
                       controlled destination pool
                                    │
                                    ▼
                              treasury
```

## Authority boundary

### The reasoning layer may

- inspect a deterministic candidate and supporting context;
- return `EXECUTE` or `WAIT`;
- provide rationale for observability.

### The reasoning layer may not

- choose arbitrary contracts, selectors, calldata, routes or recipients;
- change the asset pair or venue;
- choose an arbitrary action size;
- alter policy, slippage, risk, rate, freshness or liquidity limits;
- move treasury funds directly;
- bypass evidence verification or replay protection.

The proposal builder rejects execution-shaped model output. The treasury then independently recomputes the security-critical result from verified evidence and current on-chain state.

## Core components

### `FairWitnessTreasury`

A user-owned, self-contained treasury. It stores the immutable mandate, registered submitters, automation mode, replay/rate state and append-only attempt journal. It is the only component that can approve strategy assets for execution.

Normal registered-agent policy failures are returned/journaled as typed rejections instead of being hidden behind a revert. Unauthorized callers and failures that cannot safely be admitted to the journal still revert.

### `FairWitnessTreasuryFactory`

Permissionless factory for independent user treasuries. The current lifecycle deployment uses external bytecode stores so treasury creation code can be deployed without exceeding the EIP-170 factory runtime-size limit. The frontend `createTreasury(...)` interface remains the product entry point.

### `VerifiedMarketFactValidator`

Verifies Attestcoin proof objects and semantically binds the proven source transaction to the expected observer, pool, event and successful receipt. Proof inclusion alone is not treated as economic meaning.

### `PenguinV3Adapter`

A narrow execution adapter bound to the intended destination venue/pair. It exposes market reads used by policy and performs the fixed swap path. Output is returned to the calling treasury; the agent cannot select a recipient.

### Agent service

The agent discovers eligible factory treasuries, publishes/reads source observations, obtains proofs, derives candidates in fixed strategy priority, asks the reasoning layer to EXECUTE/WAIT, performs a fail-closed preflight, and submits only a typed proposal. Per-treasury runtime health exposes Observe → Prove → Reason → Authorize → Execute telemetry for the dashboard.

The current priority is:

```text
Risk Reduction → Rebalancing → Arbitrage
```

Only one candidate is submitted for a mutable destination market at a time; state is refreshed immediately before authorization so stale candidate terms are not blindly broadcast.

### Frontend

The frontend provides embedded-account onboarding, mandate construction, treasury lifecycle controls, live execution telemetry, Activity, schema-v1 Decision Detail, Safeguards and independent Verify. It reads chain state for authority-bearing facts; browser validation is UX, not security.

### Supabase

Supabase is an optional convenience/audit projection. The public `user_instances` cache stores only public wallet ↔ treasury relationships; login email is not part of that public projection. A service-role-backed audit index may store richer artifacts, but database state never authorizes execution.

## Proposal and authorization lifecycle

1. **Observe** — a source-market observation is published on Sepolia.
2. **Prove** — source and confirmation positions are turned into Attestcoin proofs.
3. **Derive** — deterministic code computes eligibility, direction, exact candidate amount and metrics.
4. **Reason** — the model receives the candidate and returns EXECUTE or WAIT.
5. **Build** — deterministic code constructs the schema-v1 proposal and commitments.
6. **Refresh** — destination market and treasury state are reread just before submission.
7. **Authorize** — the treasury re-verifies evidence and recomputes every relevant policy condition.
8. **Reject or execute** — a failed policy condition is journaled without asset movement; an approved proposal enters the fixed adapter path.
9. **Record** — attempt/execution identities and cryptographic commitments are available for Activity, Decision Detail and Verify.

See [`architecture/DATA_FLOW.md`](architecture/DATA_FLOW.md) for record linkage and [`architecture/PROPOSAL_SCHEMA.md`](architecture/PROPOSAL_SCHEMA.md) for the typed schema.

## Strategy boundary

The three strategies share universal checks but have different deterministic branches:

- **Arbitrage:** verified source reference vs destination TWAP, correct direction, net-edge requirement and bounded value.
- **Rebalancing:** current portfolio allocation vs immutable target/tolerance; only movement toward target is allowed.
- **Risk reduction:** WCTC exposure above the immutable maximum; only WCTC reduction is allowed, with per-action and daily limits.

See [`architecture/STRATEGY_MODEL.md`](architecture/STRATEGY_MODEL.md) and [`architecture/POLICY_MODEL.md`](architecture/POLICY_MODEL.md).

## Replay and journal model

Each submitted attempt has a monotonic attempt ID. Proposal IDs, nonces, strategy-scoped evidence execution keys and policy epochs prevent old or modified proposals from being treated as new authority. A successful execution can occur at most once for the relevant execution identity.

A model `WAIT` is not submitted and therefore is not an on-chain attempt. The UI must not relabel an off-chain WAIT as a policy rejection.

## Lifecycle

Users may pause/resume autonomous execution and manage the registered submitter. A treasury can also be permanently closed. In the controlled demo lifecycle, direct demo-token withdrawal is disabled and closing returns remaining controlled assets to the configured reserve/faucet; the journal remains readable after closure.

Production-mode lifecycle semantics return supported assets to the owner on close.

## Trust assumptions and residual risk

The enforcement boundary trusts deployed contract bytecode, Creditcoin consensus/EVM, Attestcoin verification behavior, the frozen observer/market semantics, the frozen adapter/venue semantics and the supported token behavior. It does **not** trust the AI, prompt, frontend, Supabase, public RPC responses without chain verification, or the submitter merely because it is registered.

For the complete threat model, see [`architecture/SECURITY_MODEL.md`](architecture/SECURITY_MODEL.md).

## Controlled-market disclosure

The public demonstration intentionally uses controlled test markets because there was no sufficiently active comparable market across the supported public testnets. The market conditions are synthetic. The source transactions, proof generation, Creditcoin verification, deterministic policy evaluation, replay protection and treasury execution are real public-testnet operations.

No bridge, redemption, natural arbitrage, production liquidity or profitability is claimed.

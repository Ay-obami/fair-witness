# Fair Witness

## Trust-Minimized Execution for Autonomous Financial Agents on Creditcoin

**AI proposes. Deterministic policy authorizes. Treasury executes.**

### BUIDL CTC 2026 Fall - AI Track

Fair Witness is a public-testnet reference system for autonomous financial agents that need to act on cross-chain information without giving an AI model arbitrary transaction authority or custody of user capital.

The system combines the Attestcoin Protocol, deterministic on-chain policy, constrained execution adapters, replay protection, append-only attempt records, and an AI reasoning layer whose authority is deliberately narrow.

The central thesis is simple:

> An AI agent can contribute judgment without becoming the security boundary.

---

## 1. Executive Summary

AI agents can monitor markets, synthesize context, and make useful decisions. But in financial systems, a model recommendation should not automatically become authority to move funds.

Most agent architectures collapse reasoning and execution into one trust domain: the same process that decides what should happen also holds keys, chooses transaction parameters, and broadcasts arbitrary calls. If the model hallucinates, is prompt-injected, produces stale output, or the host is compromised, the damage can extend directly to capital.

Fair Witness separates these responsibilities.

Cross-chain market facts originate on Ethereum Sepolia. Attestcoin provides cryptographically verifiable cross-chain transaction evidence. The Fair Witness agent derives a deterministic strategy candidate and asks the reasoning layer only whether to `EXECUTE` or `WAIT`. If execution is proposed, a schema-v1 proposal is constructed from deterministic data rather than model-selected transaction terms. A user-owned Creditcoin treasury then verifies the Attestcoin evidence again, recomputes policy from current on-chain state, enforces replay and rate limits, and either records a reason-coded rejection or executes through a fixed adapter.

The AI does not choose arbitrary targets, routes, recipients, calldata, token pairs, venues, or amounts.

The result is a system in which model intelligence can improve liveness and judgment while deterministic code retains transaction authority.

---

## 2. The Problem

Autonomous financial agents create a new security question:

**How can software be allowed to act automatically without trusting its reasoning process with unrestricted transaction authority?**

The problem is larger than model accuracy. A production-minded design must assume failure across multiple layers:

- the AI may hallucinate or misunderstand context;
- prompts may be manipulated;
- the model provider may be unavailable or compromised;
- a submitter key may be stolen;
- an agent host may be exploited;
- public RPC responses may be stale or malicious;
- databases and frontend state may be wrong;
- cross-chain data may be unverified or semantically irrelevant;
- replayed or stale evidence may appear superficially valid.

A secure agent system therefore needs independent answers to three questions:

1. **Are the external facts real?**
2. **Is the proposed action allowed?**
3. **Can execution occur only through the intended path?**

Fair Witness maps those questions to three independent layers:

```text
Attestcoin verifies cross-chain evidence.
Deterministic policy authorizes bounded intent.
The treasury executes through a constrained adapter.
```

---

## 3. Design Principles

Fair Witness is built around five principles.

### 3.1 Reasoning is not authority

The reasoning model may decide whether a deterministic candidate is worth acting on, but it does not define the transaction program.

### 3.2 Cross-chain facts must be verifiable

The system does not trust an API or agent process merely because it reports a source-chain value. Attestcoin evidence is verified on Creditcoin before the source fact can authorize capital movement.

### 3.3 Policy must be independently recomputed

The treasury does not trust agent-side calculations. It recomputes direction, limits, replay state, portfolio state, market constraints, and execution eligibility from verified evidence and current chain state.

### 3.4 Execution must be narrow

The execution adapter is bound to the intended venue and pair. The model cannot provide arbitrary calldata, recipients, or routes.

### 3.5 Auditability must survive model failure

Reason-coded attempts, commitments, replay identities, and execution records make it possible to inspect what was proposed, what evidence was used, which policy decision was made, and whether capital moved.

---

## 4. System Architecture

Fair Witness spans Ethereum Sepolia and Creditcoin testnet.

```text
Ethereum Sepolia controlled V3 market
          |
          | observation transaction
          v
 Market Observer
          |
          | source + confirmation tx hashes
          v
 Attestcoin Proof Builder
          |
          | Merkle + continuity proofs
          v
+---------------------- off-chain ----------------------+
| Fair Witness Agent                                      |
|  1. assemble verified market + portfolio context        |
|  2. derive deterministic strategy candidate             |
|  3. ask reasoning layer: EXECUTE or WAIT                |
|  4. build typed schema-v1 proposal                      |
+-----------------------------+---------------------------+
                              |
                              | proposal + proofs
                              v
                     FairWitnessTreasury
                              |
                +-------------+-------------+
                |                           |
                v                           v
     VerifiedMarketFactValidator    Deterministic Policy
       Attestcoin verification      mandate / replay / rates
       semantic source binding      valuation / caps / market
                |                           |
                +-------------+-------------+
                              |
                         approved only
                              v
                       PenguinV3Adapter
                              |
                              v
                  controlled destination pool
                              |
                              v
                           treasury
```

Each user receives an independent treasury from a permissionless factory. The treasury stores the immutable mandate, registered submitters, automation state, replay/rate state, and attempt journal.

The current lifecycle deployment uses external bytecode stores so the factory can create the full treasury without exceeding EIP-170 runtime-size limits.

---

## 5. Attestcoin Protocol Integration

Attestcoin is a core security dependency in Fair Witness.

The current source chain is Ethereum Sepolia (`chainId 11155111`) using Attestcoin chain key `1`. The destination is Creditcoin testnet (`chainId 102031`).

The agent uses `@gluwa/usc-sdk` to:

- confirm that the configured source chain is supported;
- wait for the target source height to become attested;
- build transaction proofs;
- perform a read-only pre-verification against Creditcoin.

The proof package includes:

```text
chain key
block height
transaction index
encoded transaction
Merkle proof
continuity proof
```

The Creditcoin-side `VerifiedMarketFactValidator` then performs the authoritative verification. It reads the current Attestcoin height, enforces absolute proof freshness, verifies both the source and confirmation proofs through the native BlockProver surface, recomputes the transaction index, and semantically decodes the proven transaction.

Fair Witness uses a dual-proof model: a source observation and a later confirmation observation. The confirmation must be newer, within a bounded block gap, and recent relative to the current Attestcoin height.

This prevents the system from accepting two mutually consistent but stale proofs.

### 5.1 Semantic validation

Attestcoin establishes cross-chain inclusion and continuity. Fair Witness then adds application-specific meaning.

The semantic decoder binds the proven source transaction to the expected observer and V3 pool and validates the expected event/receipt semantics. A cryptographically valid proof of an unrelated transaction is not sufficient.

### 5.2 Trust boundary

Attestcoin does **not** prove profitability, token equivalence, bridge availability, or future destination price. Fair Witness does not claim otherwise.

It uses Attestcoin for what the protocol provides: independently verifiable cross-chain source-chain evidence that can be consumed by Creditcoin policy without trusting a centralized oracle operator.

A detailed implementation guide is available in `docs/ATTESTCOIN_INTEGRATION.md`.

---

## 6. The AI Boundary

The reasoning layer receives a deterministic candidate and can produce only one security-relevant choice:

```text
EXECUTE
or
WAIT
```

It may also produce rationale for observability, but the rationale is not executable authority.

The model cannot choose:

- target contracts;
- function selectors;
- arbitrary calldata;
- token pair;
- venue;
- recipient;
- route;
- arbitrary action amount;
- policy limits;
- replay identifiers.

If the model attempts to include execution-shaped terms, the off-chain schema rejects them.

When the model selects `EXECUTE`, the proposal builder copies transaction terms from deterministic candidate and mandate state, not from free-form model text.

This boundary is intentionally conservative. Fair Witness treats model sophistication as a liveness/decision-quality concern, not as a prerequisite for capital safety.

---

## 7. Deterministic Policy

A Fair Witness treasury combines universal checks with strategy-specific branches.

Universal policy covers:

- enabled strategy bitmap;
- maximum action value;
- slippage limits;
- source drift limits;
- destination spot/TWAP deviation;
- minimum source/destination liquidity;
- attempt and execution rate limits;
- proof freshness and confirmation relationships;
- supported pair and venue;
- deadline and replay controls;
- balance availability.

The policy returns a typed evaluation rather than hiding normal registered-agent failures behind a revert. A rejected attempt can therefore be inspected without entering the capital-moving path.

A rejection must not create a token approval, mutate execution replay state, increment successful execution counters, or consume strategy capital.

---

## 8. Strategy Model

The current schema-v1 system supports three strategies.

### 8.1 Risk Reduction

Risk Reduction has the highest priority. It asks whether WCTC exposure is above the immutable maximum.

If breached, the only valid direction is to reduce WCTC exposure. The permitted value is bounded by the excess exposure, universal action cap, per-action risk cap, remaining daily cap, and available balance.

The AI may decline the candidate. It may not increase the amount.

### 8.2 Rebalancing

Rebalancing compares the current WCTC allocation against an immutable target and tolerance band.

If allocation is outside the band, deterministic logic calculates the direction and exact bounded adjustment needed to move toward the target. A direction that increases deviation is rejected.

### 8.3 Arbitrage

Arbitrage compares the verified source reference with the destination TWAP and accounts for configured costs and minimum net edge.

The system checks direction, liquidity, source drift, destination spot/TWAP deviation, fee/slippage reserve, and the allowed action cap.

The controlled demo does not claim natural cross-chain arbitrage or profitability. It demonstrates the evidence-conditioned authorization and execution path.

### 8.4 Priority

Candidates are evaluated in fixed order:

```text
Risk Reduction -> Rebalancing -> Arbitrage
```

After an execution, stale lower-priority candidates are discarded and must be recomputed from fresh balances and market state.

---

## 9. Proposal, Replay, and Audit Model

The schema-v1 proposal is a bounded intent, not a programmable transaction.

It commits to:

- strategy and action type;
- exact asset direction;
- fixed venue;
- exact input amount;
- slippage ceiling;
- deadline and nonce;
- `evidenceHash`;
- `observationHash`;
- `decisionHash`;
- `policyHash`.

Replay resistance is layered:

- monotonic attempt IDs;
- per-agent nonce usage;
- processed proposal IDs;
- strategy-scoped evidence execution keys;
- policy epochs that change across pause/resume transitions.

An exact replay may be recorded as another rejected attempt, but it cannot re-execute the same economic identity.

The frontend exposes the authoritative on-chain attempt through Activity and Decision Detail. Verify acts as an independent locator using treasury address + attempt ID.

Off-chain audit storage is optional observability. Supabase never authorizes execution.

---

## 10. Security Model

Fair Witness assumes that the following can fail or be compromised:

- AI output and prompt;
- agent host;
- registered submit key;
- frontend;
- Supabase;
- public RPC responses;
- off-chain preflight calculations.

Capital safety instead depends on the deployed Creditcoin treasury bytecode, immutable configuration, Attestcoin verification behavior, frozen source observer/pool semantics, frozen adapter/venue semantics, and supported token behavior.

Key invariants include:

1. treasury capital never enters the agent EOA;
2. the AI cannot select an arbitrary target, route, recipient, token, selector, or calldata;
3. source facts are accepted only after Attestcoin verification and semantic validation;
4. rejected attempts create no strategy-token approval or capital movement;
5. the adapter always returns output to the calling treasury;
6. policy recomputes amount, direction, portfolio metrics and replay state;
7. a strategy/evidence identity executes at most once per treasury;
8. database compromise cannot move capital or change policy.

The test suite includes adversarial cases for oversized actions, unauthorized assets/venues, stale or invalid evidence, exact replay, changed-nonce evidence replay, expired proposals, wrong-direction rebalance, risk-limit violations, destination market constraints, and adapter failure rollback.

---

## 11. Controlled Public-Testnet Demonstration

Fair Witness uses explicitly controlled V3 test markets because no sufficiently active comparable market existed across the supported public testnets during the build period.

**The market conditions are synthetic; the verification and execution path are not.**

The source observations are real Sepolia transactions. Proofs are generated through the Attestcoin stack. Verification occurs on Creditcoin. Deterministic policy and replay controls execute on-chain. Approved actions move controlled test assets through the configured destination adapter.

The controlled `fwUSD` and `fwWCTC` tokens are independently issued testnet assets. They do not imply a bridge, redemption mechanism, economic peg, natural arbitrage, production liquidity, or profitability.

### 11.1 Current lifecycle deployment

| Component | Value |
|---|---|
| Creditcoin chain ID | `102031` |
| Current factory | `0x494490bBF748e59a659227F46510535BF3818442` |
| Factory deployment block | `5465730` |
| Controlled faucet / reserve | `0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A` |
| Validator | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| Destination adapter | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia observer | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia source pool | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |

The machine-readable source of truth is `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`.

### 11.2 Example Attestcoin-backed execution

The historical controlled evidence manifest records a valid Risk Reduction path:

| Evidence | Value |
|---|---|
| Source observation tx | `0x1c0e67ad9621ec5d23f061d330e1b7b41d69c66646a97358e1be09dfe42e408f` |
| Confirmation observation tx | `0xf87e562164ca1f23dea01df67b0f907cd36f9e2b25d49f99133a74f43a906cbb` |
| Source block | `11667084` |
| Confirmation block | `11667085` |
| Creditcoin execution tx | `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4` |
| Treasury attempt | `2` |

The same manifest preserves controlled Arbitrage, Rebalancing, rejection, deployment, and market-setup receipts.

---

## 12. Product Experience

The product flow is designed to make policy visible rather than hiding it behind an agent chat interface.

1. A user signs in through an embedded-account flow.
2. The user creates an immutable mandate.
3. A user-owned treasury is deployed.
4. Controlled test assets are funded and a bounded submitter is registered.
5. Autonomous mode is enabled.
6. The dashboard exposes real per-treasury Observe -> Prove -> Reason -> Authorize -> Execute telemetry.
7. Activity displays reason-coded on-chain attempts.
8. Decision Detail reconstructs the schema-v1 attempt directly from Creditcoin.
9. Verify independently locates the same attempt from treasury address and attempt ID.

The UI does not invent model rationale from chain state. Where model prose is not stored on-chain, the product says so.

---

## 13. Limitations

Fair Witness is a public-testnet system and should not be interpreted as production-ready asset management infrastructure.

Current limitations include:

- controlled rather than naturally occurring comparable markets;
- testnet liquidity and oracle history can be thin;
- model/provider availability affects liveness;
- the agent service is centralized for scheduling/liveness;
- a compromised registered submitter can cause bounded gas/storage grief until deregistered;
- immutable-policy mistakes require migration to a new treasury;
- the controlled source/destination tokens do not establish cross-chain economic identity;
- the current demo does not prove an end-to-end profitable two-leg arbitrage cycle.

These constraints limit claims, but they do not weaken the core design objective: model failure must not become arbitrary capital authority.

---

## 14. Roadmap and Creditcoin Ecosystem Opportunity

Fair Witness is designed as a reusable authorization architecture rather than a single trading bot.

A production roadmap would focus on:

### Phase 1 - hardened agent infrastructure

- isolated signer infrastructure;
- leader election / duplicate-runner protection;
- stronger operational monitoring;
- production indexing and reorg handling;
- external security review.

### Phase 2 - richer verified financial facts

- additional Attestcoin-supported source chains;
- more source observers and semantic decoders;
- additional Creditcoin-native market/risk adapters;
- reusable verified-fact schemas.

### Phase 3 - broader autonomous finance

The same pattern can support:

- treasury management;
- lending/risk controls;
- collateral monitoring;
- RWA servicing triggers;
- insurance conditions;
- governance automation;
- cross-chain credit and portfolio policies.

The common primitive is:

```text
verified external fact
        +
bounded machine judgment
        +
deterministic on-chain authorization
        =
safer autonomous execution
```

This is where Fair Witness can add long-term value to Creditcoin: making Attestcoin-backed facts usable by autonomous systems without requiring users to trust the reasoning system with unrestricted transaction authority.

---

## 15. Conclusion

Fair Witness demonstrates a different way to build AI agents on-chain.

Instead of asking whether an AI model is trustworthy enough to hold transaction authority, the system assumes that the model can be wrong and designs around that fact.

Attestcoin provides verifiable cross-chain evidence. Deterministic policy defines what is allowed. A constrained treasury and adapter define how execution can occur. The AI contributes judgment without becoming custody, oracle, policy engine, or transaction programmer.

The result is summarized in one line:

> **AI proposes. Deterministic policy authorizes. Treasury executes.**

For implementation details, start with:

- `docs/ATTESTCOIN_INTEGRATION.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/SECURITY_MODEL.md`
- `docs/architecture/POLICY_MODEL.md`
- `docs/architecture/PROPOSAL_SCHEMA.md`
- `docs/ADVERSARIAL_TEST_MATRIX.md`
- `docs/CONTROLLED_DEMO_RUNBOOK.md`

**Repository:** https://github.com/Ay-obami/fair-witness  
**Live application:** https://fair-witness.vercel.app/

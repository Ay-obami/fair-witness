# Fair Witness Architecture Lock

Status: **LOCKED — Phase 0**

Locked on: 2026-09-08

Applies to: the migration from the arbitrage-only repository to the three-strategy Fair Witness system

> **Implementation agents MUST NOT change locked architectural decisions without explicit authorization.**

## Product boundary

Fair Witness is a trust-minimized execution boundary for autonomous financial agents. Attestcoin supplies verifiable cross-chain market evidence; an untrusted AI recommends whether to act; deterministic code constructs and validates a bounded proposal; a per-user ASC treasury alone holds and moves capital; an append-only journal makes decisions, rejections, and executions replayable.

The system supports exactly three strategies in this migration:

1. Arbitrage
2. Rebalancing
3. Risk Reduction

It is not a generic terminal, router, strategy marketplace, bridge, hedge fund, or HFT system.

## Final component boundaries

```text
Sepolia market observation transaction
        |
        v
Attestcoin proof builder ----> typed proof bundle
        |                            |
        v                            v
VerifiedMarketFactValidator on Creditcoin testnet
        | verified fact (never an unauthenticated API price)
        v
Deterministic observation/portfolio engine
        | candidate + exact permitted amount/cap
        v
Untrusted AI: EXECUTE or WAIT + rationale only
        |
        v
Typed ProposalBuilder (no arbitrary calldata)
        |
        v
Per-tenant FairWitnessTreasury
  - deterministic universal policy
  - deterministic strategy policy
  - replay/rate state
  - custody and atomic execution
  - on-chain attempt journal
        |
        v
Immutable PenguinV3Adapter -> one frozen WCTC/stable pool
        |
        v
On-chain events -> indexer -> Supabase audit projection/UI
```

The deterministic policy layer is a logical layer inside the per-tenant treasury contract for this migration. It is not a separately upgradeable contract. The treasury, its immutable validator, and its immutable venue adapter form one fail-closed security boundary.

## Locked contract model

### Reused dependencies

- `EthereumV3MarketObserver`: controlled source-market event format. It derives a 300-second TWAP and emits the source pool, reporter, spot state, liquidity, and derived price; callers cannot supply a price.
- `VerifiedMarketFactValidator`: the Attestcoin boundary. It binds chain, observer, pool, proof age, confirmation gap, Merkle transaction index, successful receipt, event emitter, pool topic, TWAP window, liquidity, and recomputed price.
- `PenguinV3Adapter`: the only venue adapter for the migration. Router, factory, pool, pair, fee, direction, recipient, and calldata shape are frozen.
- Attestcoin/native interfaces, event decoder, tick/price math, and their tests.
- Per-tenant factory model and registered-agent allowlist concept.

These components may receive narrowly necessary compatibility changes and ABI regeneration, but their security semantics must not be weakened.

### Migrated treasury

`FairWitnessTreasury` becomes the single generic proposal, policy, custody, execution, replay, and on-chain journal boundary. It must expose one typed proposal submission path for the three strategies. It must not accept a router, path, recipient, selector, or arbitrary bytes calldata from the AI.

The legacy `ASCTreasuryJournal`, `ASCTreasuryFactory`, `PriceObservation`, mock router, mock tokens, and their deployed instances remain historical. They are not upgraded in place and are not the final demo path.

### Per-tenant immutable mandate

Each new treasury is constructed with:

- exact WCTC and stable token addresses, inherited from the immutable adapter;
- exact allowed venue adapter (one venue);
- enabled-strategy bitmap;
- universal bounds;
- arbitrage parameters;
- rebalancing parameters;
- risk-reduction parameters;
- owner.

All numeric mandate parameters and allowlists are immutable. Changing them requires a new treasury. The owner may pause and resume an instance, register/deregister proposer EOAs, and perform a constrained owner exit. The AI cannot call owner functions. Every mode change increments a monotonic `policyEpoch`, invalidating proposals built before the transition, and emits a journal event. An owner exit can send only an allowed asset to the owner, never an arbitrary recipient and never arbitrary calldata.

## Locked strategy abstraction

The off-chain strategy abstraction lives in the agent package as typed modules sharing a deterministic interface:

```text
evaluate(VerifiedContext, MandateSnapshot) -> Candidate | NoCandidate
```

A `Candidate` contains deterministic metrics, required direction, and permitted sizing. The AI receives the candidate and returns only `EXECUTE` or `WAIT` plus bounded explanatory metadata. The deterministic `ProposalBuilder` supplies the amount, assets, venue, slippage ceiling, deadline, nonce, evidence commitment, observation commitment, and policy commitment.

On-chain, strategy is a closed enum and an explicit policy branch. No dynamic plugins, delegatecalls, arbitrary user strategies, or user-provided policy bytecode are allowed.

When several strategies trigger in one cycle, deterministic priority is:

1. Risk Reduction
2. Rebalancing
3. Arbitrage

At most one proposal is submitted per treasury per evaluation cycle. This prevents simultaneous strategies from acting on the same pre-trade portfolio snapshot.

## Locked proposal model

The security-critical proposal is an ABI struct defined by the treasury interface and mirrored exactly in TypeScript:

```solidity
struct Proposal {
    uint8 schemaVersion;       // must equal the one supported version
    StrategyType strategy;     // ARBITRAGE, REBALANCE, RISK_REDUCTION
    ActionType action;         // SWAP_EXACT_IN only
    address assetIn;
    address assetOut;
    address venue;             // must equal immutable adapter
    uint128 amountIn;
    uint16 maxSlippageBps;     // may tighten, never exceed mandate
    uint64 deadline;
    uint64 nonce;
    bytes32 evidenceHash;      // commitment derived from verified facts
    bytes32 observationHash;   // AI-visible off-chain snapshot commitment
    bytes32 decisionHash;      // canonical AI decision/rationale commitment
    bytes32 policyHash;        // exact immutable mandate + mode + policy epoch
}
```

No `bytes strategyData`, JSON, target recipient, route, function selector, call target, or executable calldata is permitted. Strategy metrics are recalculated by policy and recorded in a typed evaluation record, not trusted from the proposal.

`proposalId = keccak256(abi.encode(block.chainid, address(treasury), proposal))`.

`executionKey = keccak256(abi.encode(address(treasury), proposal.strategy, proposal.action, proposal.evidenceHash))`.

The proposal ID prevents exact replay. A per-agent used-nonce map prevents altered proposals from reusing a nonce. The strategy-scoped execution key prevents a second registered agent or a changed nonce/amount from executing the same strategy against the same evidence. Evidence can legitimately be evaluated by different strategies, but never executed twice for the same strategy. For every strategy, `amountIn` must equal the treasury's recomputed deterministic amount; it is not merely an upper bound the AI can choose beneath.

## Locked evidence model

Proof bytes travel separately from the compact proposal as a typed `EvidenceBundle` accepted only by the treasury and validator. The validator returns typed verified observations. The treasury derives `evidenceHash` itself from verified chain key, source and confirmation block/transaction positions, immutable observer and pool, prices, ticks, and liquidity. It compares that hash to the proposal field.

An API response, Supabase row, AI statement, or caller-supplied `verified: true` flag is never evidence. Evidence is authoritative only after the Creditcoin-side validator successfully invokes the Attestcoin BlockProver and performs semantic receipt/event validation.

The proposal's `observationHash` commits to what the AI saw. It is audit data, not authorization input. The treasury also creates a separate `evaluatedStateHash` from the destination state, balances, verified prices, and metrics it actually used at submission time.

## Locked deterministic policy

Universal checks, in fail-fast order:

1. registered proposer (unauthorized callers revert and cannot create storage spam);
2. attempt-rate capacity;
3. supported schema and nonzero commitments;
4. active treasury and enabled strategy;
5. `SWAP_EXACT_IN`, exact allowed pair, correct direction, and immutable venue;
6. deadline and proposal slippage within bounds;
7. current policy hash match;
8. proposal ID, per-agent nonce, and strategy/evidence execution replay checks;
9. Attestcoin proof and semantic evidence validity;
10. absolute proof freshness, confirmation ordering/gap, and source drift;
11. destination pool availability, liquidity, and spot/TWAP deviation;
12. deterministic strategy-specific eligibility and amount cap;
13. treasury input balance and global execution rate;
14. policy-derived minimum output;
15. atomic adapter execution and postcondition checks.

Normal policy failures from registered agents must return a typed rejection reason and append an attempt journal entry without moving funds. Cryptographic verifier or market-state reverts must be caught and classified. ABI decoding failure, unauthorized caller, attempt-journal rate exhaustion, or catastrophic internal failure may still revert.

The treasury computes `amountOutMinimum`; the AI cannot supply it. It uses the stricter of proposal slippage and the immutable policy ceiling and includes pool fees plus a fixed execution reserve when evaluating arbitrage edge.

### Universal mandate fields

- `maxActionValueE6` (stable-value units, not a production USD claim)
- `maxSlippageBps`
- `maxSourceDriftBps`
- `maxSpotTwapDeviationBps`
- `minSourceLiquidity`
- `minDestinationLiquidity`
- `maxExecutionsPerEpoch`
- `epochLength`
- `maxAttemptsPerEpoch`
- enabled-strategy bitmap

### Arbitrage policy

- verified source/confirmation market is valid and fresh;
- destination market is valid;
- direction follows the confirmed-source versus destination-TWAP sign;
- gross edge covers pool fee, allowed slippage, fixed reserve, and `minNetEdgeBps`;
- amount exactly equals the deterministic edge-scaled amount after strategy, universal, rounding, and balance caps.

### Rebalancing policy

The portfolio is exactly WCTC plus the configured stable asset. Stable is valued as one stable-value unit; WCTC uses the verified confirmed price, subject to source drift and destination deviation gates.

```text
wctcValueE6 = wctcBalance * referencePriceE6 / 1e18
portfolioValueE6 = stableBalance + wctcValueE6
currentWctcBps = wctcValueE6 * 10_000 / portfolioValueE6
targetWctcValueE6 = portfolioValueE6 * targetWctcBps / 10_000
requiredAdjustmentE6 = abs(wctcValueE6 - targetWctcValueE6)
permittedAdjustmentE6 = min(requiredAdjustmentE6,
                            maxRebalanceValueE6,
                            maxActionValueE6)
```

Inside the inclusive tolerance band, policy rejects with `REBALANCE_WITHIN_TOLERANCE`. Outside it, direction must move WCTC toward target. Stable input equals the permitted stable-value amount for a buy; WCTC input is converted from the permitted value for a sell. The ProposalBuilder uses the deterministic permitted amount. Any different amount or wrong-direction proposal is rejected; an amount above the cap receives the more specific excessive-amount reason.

### Minimum viable risk model

Risk Reduction is exposure-only in this migration. It does not predict prices or calculate volatility/drawdown.

```text
breach when currentWctcBps > maxWctcExposureBps
excessValueE6 = wctcValueE6
              - portfolioValueE6 * maxWctcExposureBps / 10_000
permittedReductionE6 = min(excessValueE6,
                           maxRiskReductionValueE6,
                           remainingDailyReductionE6,
                           maxActionValueE6)
```

Only `SELL WCTC -> stable` is valid. Daily reduction usage is tracked in fixed 24-hour UTC-style epochs (`block.timestamp / 1 days`). A proposal must equal the derived deterministic input; a proposal above the maximum is rejected and journaled with the excessive-amount reason. To keep risk reduction distinct from ordinary target maintenance, configuration must require `maxWctcExposureBps > targetWctcBps + rebalanceToleranceBps` whenever both strategies are enabled.

## Locked journal architecture

The journal has two linked layers.

The on-chain journal ABI is locked to closed enums and a typed record. Numeric enum order must be frozen in the Solidity interface and mirrored by clients:

```solidity
enum AttemptResult { REJECTED, EXECUTED, EXECUTION_FAILED }
enum EvidenceStatus { NOT_CHECKED, INVALID, VERIFIED }

enum ReasonCode {
    NONE,
    UNSUPPORTED_SCHEMA,
    INVALID_COMMITMENT,
    POLICY_PAUSED,
    STRATEGY_DISABLED,
    ACTION_NOT_ALLOWED,
    ASSET_NOT_ALLOWED,
    VENUE_NOT_ALLOWED,
    PROPOSAL_EXPIRED,
    DEADLINE_TOO_FAR,
    SLIPPAGE_EXCEEDS_POLICY,
    POLICY_HASH_MISMATCH,
    REPLAY_PROPOSAL,
    NONCE_ALREADY_USED,
    EVIDENCE_ALREADY_EXECUTED,
    INVALID_EVIDENCE,
    EVIDENCE_STALE,
    EVIDENCE_HASH_MISMATCH,
    SOURCE_DRIFT_TOO_HIGH,
    SOURCE_LIQUIDITY_TOO_LOW,
    DESTINATION_MARKET_INVALID,
    DESTINATION_LIQUIDITY_TOO_LOW,
    DESTINATION_DEVIATION_TOO_HIGH,
    WRONG_DIRECTION,
    ARBITRAGE_EDGE_TOO_LOW,
    REBALANCE_WITHIN_TOLERANCE,
    RISK_THRESHOLD_NOT_BREACHED,
    ZERO_EXECUTABLE_AMOUNT,
    AMOUNT_EXCEEDS_POLICY,
    AMOUNT_MISMATCH,
    DAILY_RISK_LIMIT,
    INSUFFICIENT_BALANCE,
    EXECUTION_RATE_LIMIT,
    EXECUTION_REVERTED
}

struct AttemptRecord {
    uint64 attemptId;
    uint64 nonce;
    uint64 submittedAt;
    uint64 resolvedAt;
    uint64 sourceChainKey;
    uint64 sourceBlockHeight;
    uint64 sourceTxIndex;
    uint64 confirmBlockHeight;
    uint64 confirmTxIndex;
    address agent;
    address assetIn;
    address assetOut;
    address venue;
    StrategyType strategy;
    ActionType action;
    AttemptResult result;
    EvidenceStatus evidenceStatus;
    ReasonCode reason;
    uint128 proposedAmountIn;
    uint128 permittedValueE6;
    uint128 amountInActual;
    uint128 amountOutActual;
    uint16 currentWctcBps;
    uint16 referenceBps;
    bytes32 proposalId;
    bytes32 executionKey;
    bytes32 evidenceHash;
    bytes32 observationHash;
    bytes32 decisionHash;
    bytes32 policyHash;
    bytes32 evaluatedStateHash;
}
```

Evidence locations in an invalid record are explicitly caller-claimed identifiers; `EvidenceStatus.VERIFIED` is set only after the validator succeeds. `referenceBps` means net edge for arbitrage, target WCTC bps for rebalancing, and maximum exposure bps for risk reduction. Detailed strategy calculations remain in the evaluated-state hash and off-chain projection.

On-chain, every processable submission from a registered agent receives a monotonically increasing `attemptId` and records/emits:

- proposal ID and nonce;
- strategy and action;
- agent;
- proposal observation, evidence, decision, and policy hashes;
- evaluated-state hash;
- policy result (`APPROVED`, `REJECTED`, `EXECUTED`, `EXECUTION_FAILED` where safely catchable);
- stable reason-code enum;
- submitted and resolved timestamps;
- asset/venue/amount terms;
- deterministic strategy metrics (current/target/threshold bps, edge bps, permitted value, actual in/out);

Attempts and executions use separate counters. A rejected attempt never increments execution rate or risk-reduction usage and never transfers/approves assets. A successful execution is one attempt with an execution result, not a disconnected record. Approved execution runs through a treasury `onlySelf` external subcall under the outer reentrancy guard: success commits execution replay/rate/usage and asset changes; a caught adapter revert rolls that entire subcall back so the parent can finalize the attempt as `EXECUTION_FAILED` without residue.

Off-chain, Supabase stores the complete observation, proof locator, canonical AI request/response, reasoning, portfolio snapshot, decoded policy evaluation, transaction receipt, and index fields. Every row is joined by hashes/IDs anchored in the on-chain attempt. AI `WAIT` decisions, which submit no transaction, are retained off-chain with their observation, evidence, decision, and policy hashes. Optional periodic Merkle-root anchoring of WAIT records is deferred.

## Locked Supabase role

Supabase is retained for application data and queryability. It is not authoritative for balances, allowed assets/venues, policy limits, proof validity, replay, authorization, or execution.

Allowed content:

- user/instance discovery and UI preferences;
- immutable-mandate projections read from chain;
- observations and portfolio snapshots;
- proof artifacts or object-storage locators and verification transaction references;
- AI prompts, model/version metadata, structured decisions, and explanations;
- canonical proposals and policy-evaluation projections;
- execution receipts, analytics, and replay indexes.

Never store private keys or treat a database boolean as proof/policy authorization. RLS must bind user-owned private UI data; public on-chain projections may remain readable. The current anonymous-write `user_instances` policy is a PoC limitation and must be hardened before relying on it for user identity.

## Security invariants

1. AI proposes; deterministic policy authorizes; treasury executes.
2. The AI never possesses treasury keys or funds.
3. The proposal cannot express arbitrary execution.
4. Only the treasury can approve the adapter for an exact amount; approvals return to zero.
5. The adapter always sends output to the calling treasury and uses the frozen route.
6. Attestcoin verification plus semantic decoding is mandatory; an authenticated-looking API payload is insufficient.
7. Portfolio accounting, allocation, sizing, exposure, edge, freshness, and limits are deterministic.
8. Replayed, stale, invalid, oversized, wrong-direction, wrong-asset, and wrong-venue proposals cannot move funds.
9. A processable policy rejection is durable audit data.
10. Supabase failure or compromise cannot authorize capital movement.
11. Existing live legacy deployments are not represented as the migrated system.
12. Testnet tokens and controlled liquidity are not evidence of production profitability.

## Deployment assumptions

- Final demonstration target: Sepolia evidence verified through Attestcoin on Creditcoin testnet; execution through a real PenguinSwap deployment.
- New contracts are deployed additively; no proxy upgrade and no mutation of legacy instances.
- Deployment is blocked until exact source/destination asset identity, usable source market, destination oracle history/cardinality, deployer/funding, proof generation, and smoke-test prerequisites are verified.
- Current known reality is that genuine Attestcoin Sepolia proof verification and Creditcoin treasury execution are possible, and PenguinSwap exists with testnet liquidity, but no dependable independent Sepolia WCTC market supports honest claims of naturally occurring cross-chain arbitrage.
- Controlled demonstration liquidity may show mechanics only when labeled controlled. It must not be described as independent or profitable market arbitrage.

## Locked decision record

| Decision | Rationale | Alternatives considered and rejected | Security implications | Implementation and migration implications |
|---|---|---|---|---|
| One typed treasury entry point for three strategies | One atomic boundary is easiest to audit and preserves current custody semantics. | Three fund-moving strategy contracts (duplicated custody/replay); arbitrary executor (unsafe). | All movement passes one policy/journal gate. | Replace arbitrage-only entry point additively; migrate arbitrage first. |
| Policy logic lives inside each treasury | Avoids an upgrade/admin dependency and cross-contract authorization ambiguity. | Upgradeable/shared policy contract; delegatecall modules. Rejected for hackathon complexity and blast radius. | Per-tenant policy cannot be swapped beneath funds. | Use internal functions/libraries; factory deploys full immutable mandate. |
| Closed strategy/action enums | Three strategies are known and bounded. | Arbitrary strategies/calldata. Rejected as direct scope and security violation. | Unknown actions fail closed. | ABI/TS enum parity tests are mandatory. |
| One WCTC/stable pair and one adapter | Matches demonstrable venue and avoids generalized routing. | Asset/venue mappings and route discovery. Deferred because they multiply manipulation and approval surfaces. | Assets, recipient, pool, fee, router are frozen. | A new pair/venue requires new adapter/factory generation. |
| Canonical explicit Proposal struct | Typed bounded fields are hashable and auditable. | JSON/bytes payload, EIP-712 arbitrary call bundles. Rejected because decoders and arbitrary execution enlarge attack surface. | No executable calldata reaches treasury. | Solidity/TypeScript golden vectors required. |
| Proof bundle separate; evidence hash derived on-chain | Keeps proposal compact without trusting a caller's evidence label. | Store proofs on-chain; database verification flags. Rejected for cost/trust. | Evidence identity follows successful Attestcoin + semantic validation. | Persist proof bodies off-chain and proof references/hashes in journal. |
| AI decides only EXECUTE/WAIT and rationale | Preserves useful agency while excluding accounting and constraints. | AI chooses amount/route/limits; fully deterministic auto-execution. First is unsafe, second does not demonstrate agent judgment. | Malicious output is structurally incapable of changing policy. | Deterministic candidate and proposal builders precede/follow the model. |
| Rebalance sizing is deterministic and two-asset | Meets thesis with auditable math. | LLM sizing; optimizer/multi-asset solver. Rejected for trust and scope. | Policy recomputes direction and cap at submission. | Fixed decimal conversion and rounding tests required. |
| Risk MVP is WCTC exposure cap only | Clearly distinct, easy to explain, sufficient for excessive-reduction rejection demo. | Volatility, drawdown, prediction, VaR. Deferred as unnecessary quantitative complexity. | No unverifiable predictive model enters the boundary. | Add per-action and daily deterministic reduction caps. |
| Strategy-scoped execution replay key plus proposal/nonces | Same evidence may inform different strategies but must not repeat one strategy's action. | Global evidence burn (blocks valid cross-strategy use); nonce only (can vary nonce); fact only (too broad). | Stops changed-agent/changed-amount replay while retaining legitimate evaluation. | Maintain attempt sequence, per-agent nonce use, proposal IDs, and execution keys. |
| Non-reverting normal rejection journal | Failed EVM transactions cannot retain events/storage, yet rejections are first-class security events. | Rely on failed tx explorer; off-chain-only rejection logs. Rejected as incomplete/fragile. | Registered malicious proposals leave durable reason-coded records without movement. | Validators/market reads need external-call `try/catch`; exceptional failures remain documented. |
| Hybrid on-chain/off-chain journal | Full prompts/proofs are too large on-chain; hashes alone are not usable UX. | Everything on-chain (cost); Supabase-only (mutable/non-authoritative). | On-chain commitments expose tampering; chain remains authority. | Add event indexer and normalized Supabase schema. |
| Immutable limits with pause/resume and constrained owner exit | Keeps current strong commitment while making treasury lifecycle usable. | Mutable limits (policy drift); no withdrawal ever (capital can be stranded). | AI cannot loosen rules; owner exit has fixed recipient/assets and is journaled. | New treasury function and exit tests; migration requires new deployment. |
| Additive deployment, no proxy | Existing contracts and journals remain verifiable. | In-place proxy upgrade or pretending legacy instances changed. Rejected for trust and deployment mismatch. | Old and new security claims stay distinguishable. | New factory/version/address manifest and UI version detection required. |
| Supabase is a projection, never authority | Required persistence without moving the trust boundary off-chain. | Put mandates/replay authorization in DB. Rejected because service compromise could move funds. | Database outage cannot weaken policy. | Chain reconciliation jobs and hash verification required. |
| Deterministic priority: risk, rebalance, arbitrage | Prevents actions based on the same stale portfolio snapshot and prioritizes safety. | Parallel submissions; AI-selected priority. Rejected due race/conflict and untrusted control. | Safety response dominates profit-seeking. | Coordinator submits at most one action per treasury/cycle. |

## Prohibited scope

Do not introduce limit orders, order books, leverage, derivatives, liquidations, generalized bridges or routing, MEV/HFT logic, prediction models, portfolio optimization, arbitrary user strategies, huge token universes, a generalized terminal, or advanced backtesting. Do not claim production-grade or naturally occurring profitable testnet arbitrage.

## Change control

Any proposed deviation must be documented before implementation with: the exact locked decision affected, threat-model delta, alternatives, contract/storage/ABI migration impact, test changes, deployment implications, and explicit user authorization. Convenience, elegance, or an implementation-agent preference is not authorization.

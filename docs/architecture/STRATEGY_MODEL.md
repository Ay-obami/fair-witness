# Strategy Model

## Purpose

A strategy interprets a verified, deterministic context and produces a bounded candidate. It does not execute, choose a route, perform authoritative accounting, or alter a mandate. The three strategies share one pipeline and one treasury boundary.

## Shared pipeline

```text
EvidenceCollector
  -> VerifiedContextAssembler
  -> deterministic Strategy.evaluate()
  -> Candidate
  -> AI decides EXECUTE or WAIT
  -> deterministic ProposalBuilder
  -> Treasury policy
  -> execution or reason-coded rejection
```

Suggested off-chain domain interfaces:

```ts
type StrategyType = "ARBITRAGE" | "REBALANCE" | "RISK_REDUCTION";

interface Strategy<C extends Candidate> {
  readonly type: StrategyType;
  evaluate(context: VerifiedContext, mandate: MandateSnapshot): C | null;
}

interface Candidate {
  strategy: StrategyType;
  evidenceHash: Hex32;
  observationHash: Hex32;
  policyHash: Hex32;
  direction: "SELL_WCTC" | "BUY_WCTC";
  deterministicAmountIn: bigint;
  permittedValueE6: bigint;
  metrics: TypedStrategyMetrics;
}

interface AiDecision {
  decision: "EXECUTE" | "WAIT";
  strategy: StrategyType;
  rationale: string;
  reasonTags: string[];
}
```

The runtime validates the AI response against a strict schema. If it says `EXECUTE`, the ProposalBuilder copies execution terms only from the candidate and on-chain mandate, never from free-form model output.

## Verified context

One context is scoped to one treasury and one evaluation cycle. It contains:

- typed source and confirmation proofs;
- source/confirmation market values decoded from the Attestcoin-proven observer transaction;
- destination adapter state;
- treasury WCTC and stable balances read from Creditcoin;
- immutable mandate read from the treasury;
- chain positions and observation time metadata;
- hashes of the canonical AI-visible snapshot and policy.

Off-chain context is a proposal aid. The contract rereads/reverifies all security-critical values at submission.

## Arbitrage

Question: is a verified discrepancy between the permitted source and destination markets sufficiently attractive after conservative costs?

Deterministic evaluation calculates:

- source/confirmation drift;
- destination spot/TWAP deviation;
- signed gross edge;
- pool fee, proposal slippage ceiling, and fixed reserve;
- net edge;
- correct direction;
- liquidity eligibility;
- maximum edge-scaled action value and exact candidate input amount.

The AI may decline a mechanically eligible opportunity because conditions look uncertain. It cannot approve an ineligible one: on-chain policy repeats the calculation.

No claim is made that the source asset can be acquired/bridged or that the two-leg economic arbitrage closes. The hackathon treasury executes only the bounded Creditcoin-side action. This is a reference demonstration of evidence-conditioned execution.

## Rebalancing

Question: has the two-asset portfolio moved outside its target WCTC allocation band?

Mandate example:

```text
target WCTC: 40%
tolerance:   +/- 5%
stable:      remaining allocation
```

Deterministic evaluation values stable at one stable-value unit and WCTC at the confirmed verified reference price. It computes total value, current WCTC bps, target WCTC value, required delta, correct direction, and capped adjustment. Boundary equality is inside tolerance.

The candidate carries the computed exact input. The model sees the calculation and decides only `EXECUTE` or `WAIT`. Policy recomputes it and rejects any different amount or a direction that does not reduce deviation; an amount above the cap gets a specific excessive-amount reason.

Rounding is conservative:

- valuation multiplication/division uses full-precision floor math;
- a sell converts permitted value to WCTC input by flooring, never exceeding the value cap;
- a buy uses stable input directly;
- zero after rounding is not executable;
- policy accepts no amount above the recomputed cap.

## Risk Reduction

Question: is WCTC exposure above the configured maximum, requiring bounded reduction?

The minimum viable model intentionally uses only:

- current WCTC exposure bps from verified-price portfolio accounting;
- immutable maximum WCTC exposure bps;
- immutable maximum reduction per action;
- immutable daily reduction cap;
- universal maximum action value.

When breached, the only valid direction is sell WCTC for stable. The permitted value is the minimum of excess exposure and all three caps. The AI may choose `EXECUTE` or `WAIT`; it cannot choose the amount. A deliberately altered oversized proposal is rejected and journaled.

Price prediction, volatility estimation, VaR, liquidation, leverage, and drawdown engines are excluded.

## Scheduling and conflicts

For each treasury/cycle, all enabled strategies may be evaluated against the same snapshot, but only the highest-priority candidate is presented for execution:

1. Risk Reduction
2. Rebalancing
3. Arbitrage

After any execution, all lower-priority candidates are discarded and must be recomputed from new balances and market state. No parallel proposals based on the same portfolio snapshot are submitted.

## AI prompt boundary

The prompt must state the active strategy, verified evidence summary, deterministic metrics, permitted action, and mandate. The response schema contains no address, numeric amount, slippage, deadline, nonce, route, or calldata. Model/version, prompt template version, seed/temperature, raw structured response, and rationale are persisted for replay.

## Adding a future strategy

Not part of this migration. A future strategy requires explicit authorization, a new enum value, deterministic candidate math, a treasury policy branch, typed journal metrics, adversarial tests, ABI/schema version review, and documentation-lock amendment. A user-authored off-chain module alone can never become executable.

# Strategy Model

## Purpose

A strategy interprets a verified/deterministic context and produces a bounded candidate. It does not execute, choose a route, perform authoritative accounting, or alter a mandate. All three strategies share one treasury security boundary.

## Shared pipeline

```text
source observation + proofs
  → deterministic verified context
  → deterministic Strategy.evaluate()
  → Candidate
  → reasoning layer: EXECUTE or WAIT
  → deterministic ProposalBuilder
  → treasury policy
  → execution or reason-coded rejection
```

A candidate contains the strategy, commitments, required direction, deterministic input amount, permitted value and typed metrics. The model response contains the decision and rationale; it does not contain authoritative execution terms.

If the reasoning layer says `EXECUTE`, proposal construction copies execution terms only from the deterministic candidate and active mandate. Free-form model numbers, addresses or routes are never promoted into authority.

## Context and freshness

One evaluation context is scoped to one treasury and one cycle. It may contain source/confirmation proof positions, decoded source-market values, destination market state, treasury balances, immutable mandate values and canonical commitments.

This off-chain context is an optimization and reasoning input, not the final authority. Immediately before submission the runner refreshes mutable state, and the treasury rereads/reverifies the security-critical evidence and state during authorization.

## Arbitrage

**Question:** is a verified discrepancy between the permitted source and destination markets sufficiently large after conservative costs?

Deterministic evaluation derives:

- source/confirmation drift;
- destination spot/TWAP deviation;
- signed gross edge and required direction;
- fee/slippage/execution reserve;
- net-edge eligibility;
- liquidity eligibility;
- bounded action value and exact token input.

The reasoning layer may decline a mechanically eligible candidate. It cannot make an ineligible candidate executable because on-chain policy repeats the relevant calculation and exact-term checks.

The controlled demonstration does not claim a bridge, source-asset acquisition path, closed two-leg arbitrage cycle or natural profitability. It demonstrates evidence-conditioned, policy-bounded destination execution.

## Rebalancing

**Question:** is the two-asset portfolio outside its immutable target WCTC allocation band?

Policy values the stable asset at the configured stable-value unit and WCTC at the verified reference price, then derives total portfolio value, current WCTC basis points, target delta, correct direction and capped adjustment.

Boundary equality is inside tolerance. The proposal input must match the deterministic amount; wrong direction or an amount above the recomputed cap is rejected.

Rounding is conservative: conversions floor so the action does not exceed the value ceiling, and zero-after-rounding is not executable.

## Risk Reduction

**Question:** is WCTC exposure above the mandate's maximum?

The branch uses current WCTC exposure, maximum exposure, per-action reduction cap, daily reduction cap, universal action cap and available balance. When breached, the only valid direction is WCTC → stable.

The permitted reduction is bounded by the excess exposure and every applicable cap. The reasoning layer may return EXECUTE or WAIT but cannot choose a larger amount. Daily usage changes only as part of successful authorized execution.

Price prediction, VaR, leverage, liquidation and user-defined arbitrary strategies are outside this strategy model.

## Scheduling and conflicts

For each treasury/cycle, enabled strategies are evaluated in fixed priority:

1. Risk Reduction
2. Rebalancing
3. Arbitrage

Only the highest-priority candidate proceeds to reasoning/submission. After an execution, candidates derived from the prior mutable portfolio/market snapshot are discarded and recomputed.

This avoids racing parallel strategies against stale balances.

## Reasoning boundary

The prompt provides the active strategy, evidence summary, deterministic metrics, permitted action and mandate. The response schema excludes addresses, amount, slippage, deadline, nonce, route, recipient and calldata.

Model/provider metadata and rationale may be retained by the optional audit projection and committed by `decisionHash`, but the on-chain attempt does not pretend to store prose that is not actually present in contract state.

## Adding another strategy

A new executable strategy requires an explicit schema/enum change, deterministic candidate math, a treasury policy branch, typed journal semantics, adversarial tests, ABI/commitment review and updated public documentation. Adding an off-chain prompt or module alone can never grant executable authority.

# Deterministic Policy Model

## Boundary

Policy is implemented as explicit internal treasury functions and immutable mandate data. A shared upgradeable policy contract, delegatecall modules, and off-chain authorization are prohibited. `VerifiedMarketFactValidator` and `PenguinV3Adapter` are immutable external security dependencies; the treasury remains the only custodian and caller that approves its own assets.

## Mandate schema

```solidity
struct UniversalPolicy {
    uint8 enabledStrategies;
    uint128 maxActionValueE6;
    uint16 maxSlippageBps;
    uint16 maxSourceDriftBps;
    uint16 maxSpotTwapDeviationBps;
    uint128 minSourceLiquidity;
    uint128 minDestinationLiquidity;
    uint16 maxExecutionsPerEpoch;
    uint32 epochLength;
    uint16 maxAttemptsPerEpoch;
}

struct ArbitragePolicy {
    uint16 minNetEdgeBps;
    uint128 maxArbitrageValueE6;
}

struct RebalancePolicy {
    uint16 targetWctcBps;
    uint16 toleranceBps;
    uint128 maxRebalanceValueE6;
}

struct RiskPolicy {
    uint16 maxWctcExposureBps;
    uint128 maxRiskReductionValueE6;
    uint128 dailyRiskReductionValueE6;
}
```

Protocol constants impose ceilings/floors so a nonsensical constructor cannot claim meaningful guardrails. Enabled strategies require nonzero valid sub-policy values. If rebalancing and risk reduction are both enabled, maximum risk exposure must be above the rebalance upper band.

Automation mode is `PAUSED` or `AUTONOMOUS`. The owner can switch modes; every change increments `policyEpoch` and is emitted with old/new policy hashes. This prevents a pre-pause proposal becoming valid again after resume. Limits, assets, venue, strategy bitmap, and strategy parameters are immutable.

## Evaluation result

Policy returns a typed result rather than reverting for normal registered-agent failures:

```solidity
struct PolicyEvaluation {
    bool approved;
    ReasonCode reason;
    bytes32 evaluatedStateHash;
    uint128 permittedValueE6;
    uint128 amountOutMinimum;
    uint16 currentWctcBps;
    uint16 referenceBps; // edge, target, or risk threshold by strategy
}
```

`ReasonCode` is a stable closed enum covering disabled/paused, malformed terms, unauthorized pair/venue/action, expired/excess horizon, policy mismatch, replay/nonce, invalid/stale evidence, source drift/liquidity, destination market/liquidity/deviation, wrong direction, insufficient edge, within tolerance, no risk breach, excessive amount, daily cap, rate, balance, and execution failure. UI text maps from the enum; strings are not stored in security-critical contract state.

## Evaluation stages

1. Gate unauthorized callers with revert to prevent unbounded journal spam.
2. Gate bounded attempt capacity.
3. Create attempt ID and proposal ID.
4. Validate schema, commitments, mode, strategy, action, assets, venue, deadline, slippage, and policy hash.
5. Detect exact proposal, nonce, and executed strategy/evidence replay.
6. Consume a valid first-use nonce and mark proposal processed.
7. Call the immutable validator inside `try/catch`; reject and journal any proof/semantic failure.
8. Derive and compare evidence hash.
9. Enforce source drift/liquidity.
10. Read destination adapter state inside `try/catch`; enforce liquidity and spot/TWAP deviation.
11. Read treasury balances and derive current portfolio state.
12. Run exactly one strategy branch.
13. Enforce universal/strategy amount cap, input balance, and execution rate.
14. Derive minimum output using the stricter proposal/mandate slippage.
15. Invoke an `onlySelf` external execution subcall while the outer submission holds the reentrancy guard. The subcall sets execution replay/rate/risk usage, approves exact input, calls the adapter, verifies output, and clears approval atomically.
16. On subcall success, finalize the attempt as executed. On caught revert, all subcall state and approvals have rolled back; finalize it as `EXECUTION_FAILED` with no residue.

If adapter execution reverts, the external `onlySelf` execution subcall must leave balances, approvals, replay execution key, execution counters, and risk usage unchanged, while the outer call journals `EXECUTION_FAILED`. The execution helper is callable only by the treasury itself and remains protected by the outer `nonReentrant` call. This exact pattern requires adversarial rollback and direct-call tests; do not replace it with a partially committed sequence.

## Universal checks

- registered proposer;
- policy/mode active;
- strategy enabled;
- schema/action/pair/venue exact;
- bounded amount and slippage;
- deadline valid with maximum horizon;
- nonzero and matching hashes;
- Attestcoin verification, semantic evidence validation, absolute freshness and confirmation relationship;
- source and destination market validity/liquidity;
- replay and nonce;
- treasury balance;
- per-action and execution-rate bounds.

## Arbitrage branch

Compare confirmed verified source price with destination TWAP. Require correct signed direction. Compute gross edge with the economically correct denominator. Require:

```text
grossEdgeBps >= poolFeeBps
             + effectiveSlippageBps
             + fixedExecutionReserveBps
             + minNetEdgeBps
```

The maximum value is an auditable monotonic edge-scaling function capped by the arbitrage cap, universal cap and available balance. Preserve the current simple linear curve unless tests reveal a unit error; do not add optimization. Proposal input must equal the recomputed amount.

## Rebalancing branch

Compute two-asset value/allocation exactly as locked in `ARCHITECTURE_LOCK.md`. Require deviation strictly outside tolerance and a direction toward target. `permittedValueE6` is the target delta capped by rebalance and universal maxima. Proposal input must exactly match the deterministic token amount after conservative rounding.

## Risk branch

Compute WCTC exposure using the same valuation routine. Require exposure strictly above the maximum. Only sell WCTC. Cap value by excess, per-action risk cap, remaining fixed-day cap, universal cap and balance; require exact deterministic input. Increment daily usage only inside the successful execution subcall.

## Rejection journal semantics

A rejected proposal from a registered agent writes no token approval and makes no external DEX call. It records the submitted hashes/terms, policy hash, evaluated-state hash when available, result, reason, and permitted/observed metrics. Invalid evidence is marked `REJECTED_INVALID_EVIDENCE`, never `verified`.

Exact replays are journaled as new attempts keyed by attempt ID, while their proposal ID points back to the original. Attempt rate limiting bounds malicious storage growth. Unauthorized EOAs and attempts beyond the journal-rate cap revert and are visible only in transaction receipts; this exception is explicit.

## Owner actions

- `registerAgent`/`deregisterAgent`: owner-only, emitted.
- `pause`/`resume`: owner-only, emitted with policy hash transition.
- `ownerExit(asset, amount)`: owner-only, allowed WCTC/stable only, recipient fixed to owner, no arbitrary calls, journaled separately from AI strategies.
- ownership renunciation remains disabled unless decommission semantics safely clear agents and preserve exit; default is disabled.

Owner actions are not AI proposals and do not masquerade as a strategy result.

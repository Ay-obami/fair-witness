# Demo Scenarios

## Demo rules

- Label the environment: legacy mock, local deterministic, controlled testnet liquidity, or independent market.
- Show transaction/evidence links only when real.
- Never claim testnet profit, production readiness, or naturally occurring cross-chain arbitrage unless independently established at demo time.
- Begin each scenario on the mandate page: assets, one venue, enabled strategy, hard limits, and automation mode.
- End on the strategy-aware journal/replay page.

The repeated message is: **Your AI can recommend actions. It cannot change these rules or access your funds directly.**

## Demo 1 — Arbitrage reference strategy

Mandate:

- Arbitrage enabled; WCTC/stable and PenguinSwap only.
- Small max action value, explicit slippage ceiling, minimum net edge, proof freshness/drift and rate limits.

Flow:

1. Show the source observer transaction and two Attestcoin proof positions.
2. Show evidence status as verified on Creditcoin, not merely received from an API.
3. Show destination TWAP/spot/liquidity and deterministic gross/cost/net edge.
4. Show AI decision `EXECUTE` and rationale; highlight that amount/direction/venue came from deterministic code.
5. Submit the typed proposal.
6. Show policy approval checklist and exact permitted amount.
7. Show treasury -> immutable adapter -> PenguinSwap execution.
8. Replay observation, evidence hash, decision hash, proposal ID, policy hash, evaluated-state hash, receipt, and amounts.

Success statement: verified cross-chain evidence conditioned a bounded autonomous treasury action.

Honesty statement: if the opportunity uses controlled liquidity, it demonstrates mechanics only; it is not proof of independent or profitable arbitrage. If the current Sepolia WCTC source market remains unavailable, run this as a labeled deterministic/controlled reference scenario.

## Demo 2 — Rebalancing

Mandate:

- Target 60% stable / 40% WCTC.
- Tolerance +/-5%.
- Small rebalance and universal action caps.

Setup: portfolio is deliberately outside the band, for example 52% stable / 48% WCTC using the verified reference price.

Flow:

1. Show treasury balances and verified WCTC reference evidence.
2. Show deterministic valuation: portfolio value, current WCTC bps, target, deviation, required adjustment, caps, permitted adjustment and sell direction.
3. Show AI `EXECUTE` or `WAIT`; for the execution demo choose `EXECUTE`.
4. Show ProposalBuilder copied the deterministic amount and immutable venue.
5. Show policy recomputation and approval.
6. Execute and show post-trade balances/allocation; explain slippage means exact final percentage may differ slightly.
7. Replay the complete strategy-aware record.

Boundary variant: set portfolio exactly at 45% WCTC and show `REBALANCE_WITHIN_TOLERANCE`, with no treasury movement.

## Demo 3 — Risk reduction and malicious-AI containment

Mandate:

- Maximum WCTC exposure 60%.
- Maximum reduction per action 1,000 stable-value units (demo values may be scaled down for testnet balances).
- Daily reduction cap and universal cap displayed.

### Valid reduction

1. Show verified-price accounting with WCTC exposure at 70%.
2. Deterministic policy computes excess exposure and the bounded permitted sell.
3. AI recommends `EXECUTE`.
4. Policy approves the valid sell; treasury executes through the fixed adapter.
5. Show exposure reduced, daily usage incremented, and execution journaled.

### Excessive malicious proposal

1. Restore or use a second treasury with the same 70% exposure and 1,000 cap.
2. Use the adversarial harness to alter `amountIn` to represent a 7,000 reduction while retaining an apparently persuasive AI rationale.
3. Submit from a registered agent so it reaches policy.
4. Show `REJECTED — AMOUNT_EXCEEDS_POLICY` and the computed permitted maximum.
5. Compare before/after treasury token balances, adapter allowance, execution count, execution key, and daily usage: all unchanged.
6. Show the rejection as a first-class journal entry linked to evidence, decision, proposal and policy.

This is the primary security demonstration: compromise or hallucination at the AI layer does not become compromise at the custody layer.

## Demo fallback and reset

- Use separate small treasuries or scripted reversible test fixtures for each scenario.
- Never manipulate a supposedly independent market while calling it natural.
- If Attestcoin/proof-builder latency blocks a live rehearsal, use a previously verified proof only if it is still within on-chain freshness; otherwise show the deterministic local fixture and state that it is a fixture.
- If Gemini is unavailable, record a safe WAIT; do not bypass the AI or policy invisibly.
- A replayed demo proposal must reject, demonstrating idempotency rather than creating another trade.

## Judge evidence checklist

- treasury and owner addresses;
- immutable policy hash and decoded mandate;
- agent address separated from treasury ownership and token custody;
- source/confirmation transaction positions and Attestcoin validation receipt;
- proposal ID/strategy/action;
- accepted or rejected policy reason;
- before/after balances and allowances;
- execution receipt where applicable;
- journal and Supabase hash reconciliation;
- explicit market/liquidity classification and limitations.

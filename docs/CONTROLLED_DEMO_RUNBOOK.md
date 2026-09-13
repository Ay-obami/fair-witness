# Controlled Public-Testnet Demo Runbook

This runbook validates the Fair Witness security boundary using explicitly controlled V3 test markets.

> Because no sufficiently active comparable market existed across the supported public testnets, Fair Witness uses explicitly controlled V3 test markets to exercise real cross-chain transactions, real Attestcoin proofs, real Creditcoin verification, and real policy-constrained treasury execution. **The market conditions are synthetic; the verification and execution path are not.**

The controlled `fwUSD`/`fwWCTC` assets are testnet-only. They do not imply a bridge, redemption mechanism, natural arbitrage, production liquidity or profitability.

## Current lifecycle deployment

Source of truth: `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`.

| Component | Value |
|---|---|
| Factory | `0x494490bBF748e59a659227F46510535BF3818442` |
| Factory deployment block | `5465730` |
| Controlled faucet/reserve | `0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A` |
| Validator | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| Destination adapter | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia observer | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Sepolia pool | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |

Historical evidence receipts remain in `contracts/deployments/controlled-demo-schema-v1.json`; they prove prior public-testnet executions/rejections but are not the configuration source for new treasuries.

## Safety rules

- Use testnet assets only.
- Never describe the controlled token pair as bridged, redeemable or economically pegged.
- Never infer profitability from a controlled price discrepancy.
- Never bypass the treasury's normal evidence/policy path to make a demo pass.
- Keep the reasoning layer outside the authority boundary: it may choose EXECUTE/WAIT only.
- A failed authorization is a successful demo outcome when the proposal should be rejected.

## Preflight

```bash
npm run check:release

cd contracts
./install-deps.sh
forge test -vvv

cd ../agent
npm ci
npm test
npm run build

cd ../frontend
npm ci
npm test
npm run lint
npm run build
```

Confirm the frontend and agent environment both reference:

```text
FACTORY_ADDRESS / VITE_FACTORY_ADDRESS = 0x494490bBF748e59a659227F46510535BF3818442
FACTORY_DEPLOYMENT_BLOCK / VITE_FACTORY_DEPLOYMENT_BLOCK = 5465730
VITE_DEMO_FAUCET_ADDRESS = 0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A
```

Do not print private keys while checking environment variables.

## Product-path rehearsal

1. Sign in through the normal product UI.
2. Create a new mandate/treasury from the current lifecycle factory.
3. Claim/fund controlled assets through the bounded demo faucet path.
4. Register the bounded agent and enable autonomous mode.
5. Open the dashboard and confirm real per-treasury telemetry connects.
6. Allow the runner to publish source and confirmation observations, obtain Attestcoin proofs and derive a candidate.
7. If the reasoning layer returns WAIT, treat that as a valid no-submit result; do not manufacture an execution.
8. If it returns EXECUTE, confirm the proposal passes on-chain preflight before broadcast.
9. Inspect the resulting attempt in Activity and Decision Detail.
10. Re-enter the treasury address and attempt ID in Verify and confirm the same on-chain record resolves.

## What to observe in telemetry

During an eligible cycle the dashboard may show:

```text
Observe → Prove → Reason → Authorize → Execute
```

Only the current working stage should pulse. Between cycles the UI may show ready/waiting/terminal state instead of continuous animation. That is intentional: the telemetry represents real agent state, not decorative motion.

Useful terminal states include:

- `reason / waiting` — no deterministic candidate or reasoning returned WAIT;
- `authorize / blocked` — deterministic/on-chain policy rejected the proposal;
- `execute / executed` — an authorized execution confirmed;
- `execute / failed` — execution transaction resolved unsuccessfully;
- any stage / `failed` — runner error for that treasury.

## Adversarial rejection check

A useful controlled test is an oversized Risk Reduction proposal. The expected behavior is:

1. the treasury independently recomputes the permitted maximum;
2. authorization returns a typed policy rejection;
3. no token approval or strategy capital movement occurs;
4. the attempt/receipt remains inspectable;
5. the agent does not convert a rejected preflight into a broadcast execution.

The deterministic suite covers the same boundary with malicious/oversized/replay/stale cases; see [`ADVERSARIAL_TEST_MATRIX.md`](ADVERSARIAL_TEST_MATRIX.md).

## Lifecycle checks

### Pause/resume

- Pausing must make the treasury ineligible for autonomous execution.
- Resuming increments policy epoch semantics so a pre-pause proposal cannot silently become valid again.
- Dashboard state must reflect the chain, not a cached optimistic toggle.

### Close

Closing is permanent. In controlled-demo mode, remaining `fwWCTC`/`fwUSD` is returned to the configured demo reserve/faucet rather than directly withdrawn as demo assets. The journal remains readable after closure and the runner must skip closed treasuries.

## Evidence checklist

For any execution or rejection you intend to show publicly, preserve:

- source observation transaction;
- confirmation observation transaction;
- Creditcoin proposal/attempt transaction;
- treasury address and attempt ID;
- strategy and result/reason;
- evidence/observation/decision/evaluated-state commitments;
- relevant before/after balances for an execution;
- explicit controlled-market disclosure.

Do not use screenshots alone when a public transaction/attempt can be linked directly.

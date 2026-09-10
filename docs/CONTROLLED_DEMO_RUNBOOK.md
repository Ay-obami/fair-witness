# Controlled Demo Operator Runbook

> Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.

## Public request queue

The hosted `/demo` page may accept public requests for one of the three locked
strategies after applying `frontend/supabase/migrations/0003_demo_requests.sql`.
Requests are operator inbox records only. Anonymous visitors cannot read, update,
approve, or execute them, and no request contains transaction parameters. Review
the queue with `cd agent && npm run demo:requests -- list`. Use `show <request-id>`
to print the matching supervised command, `acknowledge <request-id>` before running
it, and `complete <request-id>` or `decline <request-id>` afterward. Never place an agent or
treasury-owner private key in frontend or Supabase browser configuration.

## Safety rules

Run from a clean operator terminal. Keep `TREASURY_OWNER_PRIVATE_KEY` only in ignored `agent/.env`; never paste it into prompts, logs, screenshots or commits. Confirm treasury `0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3` is paused before and after every rehearsal. The scripts may control demo liquidity; this is not an independent market.

Never improvise addresses. `contracts/deployments/controlled-demo-schema-v1.json` is authoritative. Preview market actions before setting `CONTROLLED_DEMO_BROADCAST=true`.

## Preflight and reset

```bash
cd contracts
node script/control-demo-market.js sepolia 1000000
node script/control-demo-market.js creditcoin 1000000
```

The commands above are read-only previews. To reset a pool through a real bounded router swap, load the ignored agent environment and add `CONTROLLED_DEMO_BROADCAST=true`. After any market move, allow at least 300 seconds before publishing observations so the fixed TWAP reflects the new state. Reset does not erase history; it returns spot toward the declared baseline and the TWAP converges over its window.

## Scenario 1 — Arbitrage reference

Captured reference receipt: `0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39` (attempt 4).

1. Confirm treasury paused and both pools near 1.0.
2. Preview then move Sepolia to `1.15`:

   ```bash
   cd contracts
   node script/control-demo-market.js sepolia 1150000
   CONTROLLED_DEMO_BROADCAST=true node script/control-demo-market.js sepolia 1150000
   ```

3. Wait 300 seconds. Publish two observer transactions one or a few blocks apart and obtain genuine Attestcoin proofs.
4. Show deterministic edge, 0.3% pool fee, proposal slippage, reserve, minimum net edge, direction and capped amount before the AI decision.
5. The AI may return only `EXECUTE` or `WAIT`. If Gemini/network fails, present `WAIT`; never bypass it invisibly.
6. Enable only for the supervised proposal, submit, then pause in a `finally` path.
7. Show journal/receipt and reset Sepolia to `1000000`.

This is controlled mechanics, not natural or profitable arbitrage.

## Scenario 2 — Rebalancing

Captured reference receipt: `0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f` (attempt 5).

1. Use the frozen 40% WCTC target and ±5% tolerance.
2. Show live balances and verified reference price; deterministic code calculates allocation and exact adjustment.
3. Use controlled funding or a controlled source-price movement to put WCTC outside 35–45%. Record any funding transaction as an owner/operator setup action, not an AI action.
4. Publish/prove two observations, build the deterministic candidate, obtain AI `EXECUTE`, enable briefly, submit, and pause.
5. Show post-trade allocation and attempt record. For the boundary variant, prepare exactly 45% and demonstrate `RebalanceWithinTolerance` with unchanged capital.

## Scenario 3 — Risk reduction and containment

Valid rehearsal:

```bash
cd agent
npm run demo:risk:valid
```

Oversized malicious-proposal rehearsal:

```bash
cd agent
npm run demo:risk:oversized
```

Captured oversized rejection: `0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc` (attempt 3).

Schema-v1 AI-gated strategy rehearsals:

```bash
cd agent
npm run demo:arbitrage
npm run demo:rebalance
```

The oversized mode proposes `7,000 fwWCTC`, requires reason `AmountExceedsPolicy`, and asserts treasury balances, execution count and daily risk usage are unchanged. Both modes use new real Sepolia observations and genuine Attestcoin proofs. The script derives a fresh nonce and always re-pauses after enabling. Attestcoin readiness can time out; that is a safe failed rehearsal, not permission to use fake evidence. The local adversarial suite remains the deterministic fallback.

## Network-degradation and replay rehearsal

- Unavailable Gemini: record/display `WAIT`.
- Proof cache behind: stop while paused and show the cache message; retry later without relabeling data as verified.
- Exact proposal replay: submit only in a controlled rehearsal and show `ReplayProposal`; treasury must not execute again.
- Browser failure: use `/demo` for pinned evidence links and the on-chain explorer; do not invent missing Supabase records.

## Judge checklist

- show distinct owner and agent;
- show immutable treasury, adapter, pools, policy and paused mode;
- show source and confirmation transactions plus genuine proof verification;
- distinguish AI choice from deterministic direction/amount/limits;
- show accepted or rejected reason and before/after balances;
- show the controlled-liquidity label throughout;
- state that testnet tokens prove neither profit nor production economics.

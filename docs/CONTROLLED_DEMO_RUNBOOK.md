# Controlled Demo Operator Runbook

> **Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.**

## Current release source of truth

For the submission build, the authoritative deployment record is:

`contracts/deployments/controlled-demo-schema-v1-lifecycle.json`

Current lifecycle generation:

```text
Factory:        0x494490bBF748e59a659227F46510535BF3818442
Factory block:  5465730
Demo faucet:    0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A
Validator:      0x13Dd030815550080Ef80Ff3499fAE8d971A119f5
Adapter:        0x9bAF94da27d5C71c42b40D25b43070083DE7296E
Source observer:0x9bAF94da27d5C71c42b40D25b43070083DE7296E
Source pool:    0xB88deB0436eAD37A6Dd625e9140AE45D5024424f
```

`contracts/deployments/controlled-demo-schema-v1.json` and treasury
`0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3` belong to the **historical evidence generation**.
Its captured receipts remain useful evidence, but do not use its old factory for new product treasuries.

## Safety rules

- Never paste owner, agent, observer or sponsor private keys into prompts, screenshots, logs or commits.
- Keep signing keys only in ignored environment configuration / hosted secret storage.
- New user treasuries must be created from the current lifecycle factory above.
- The controlled faucet is finite demo inventory, not an entitlement system. Keep it deliberately small and refill manually only when needed.
- Keep the gas-sponsor wallet minimally funded and configure its daily budget and per-address cooldown.
- Never fake an Attestcoin proof when the prover is slow or unavailable. The safe demo result is `WAIT` / retry later.
- Do not redeploy contracts for UI, copy, service or demo-quota changes. Redeploy only for a genuine protocol invariant failure.

## Release preflight

Run the repository gates before the live rehearsal:

```bash
cd contracts
./install-deps.sh
forge test -vvv
forge build --sizes
node script/update-abis.js

cd ../agent
npm ci
npm test
npm run build

cd ../frontend
npm ci
npm test
npm run lint
npm run build

cd ..
npm run check:release
```

CI additionally checks that the rebuilt `FairWitnessTreasury` creation bytecode still matches the hash and size committed by the deployed lifecycle factory.

## Hosted configuration

Railway runner:

```text
FACTORY_ADDRESS=0x494490bBF748e59a659227F46510535BF3818442
FACTORY_DEPLOYMENT_BLOCK=5465730
```

Vercel frontend:

```text
VITE_FACTORY_ADDRESS=0x494490bBF748e59a659227F46510535BF3818442
VITE_FACTORY_DEPLOYMENT_BLOCK=5465730
VITE_DEMO_FAUCET_ADDRESS=0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A
```

The frontend may also use the public Thirdweb client ID and optional public Supabase anon key. Never put any private key or Supabase service-role key in a `VITE_` variable.

## Current product rehearsal

Use a fresh/incognito browser profile and follow `docs/PRE_SUBMISSION_CHECKLIST.md`. The core flow is:

1. Sign in with Google, Apple or email.
2. Create a treasury from the current lifecycle factory.
3. Press **Fund & launch treasury**. The flow is idempotent and should resume safely if interrupted.
4. Confirm faucet funding, bounded-agent registration and autonomous mode are all visible on-chain.
5. Confirm the dashboard shows the treasury's real balances and value-based WCTC allocation using the destination adapter TWAP.
6. Confirm Railway `/health` reports a recent factory scan and, once an eligible treasury is active, recent source observation/proof activity.
7. Let the runner evaluate the treasury. Only a proposal whose on-chain static preflight returns `None` may be broadcast. Other preflight reasons are logged as `WAIT` and spend no transaction gas.
8. Verify Activity against the Creditcoin explorer.
9. Pause and resume the agent from the owner dashboard.
10. Create a second treasury from the same signed-in account and confirm no second authentication is requested.
11. Close one demo treasury and confirm its remaining fwWCTC/fwUSD return to the demo reserve while its historical journal remains readable.

## Controlled-market manipulation for a supervised explanation

The repository retains market-control tooling because the public testnets did not provide a sufficiently active comparable market. Preview actions first:

```bash
cd contracts
node script/control-demo-market.js sepolia 1000000
node script/control-demo-market.js creditcoin 1000000
```

A broadcast requires the explicit `CONTROLLED_DEMO_BROADCAST=true` operator switch. After a market move, allow the fixed 300-second TWAP window to converge before expecting a target price condition. These actions create **synthetic market conditions**; the source transaction, Attestcoin proof, Creditcoin verification and treasury authorization path remain real.

Do not manipulate the controlled market while the ordinary continuous runner is actively executing against it unless that is the intended supervised scenario.

## Historical public evidence

These receipts were produced by the earlier schema-v1 evidence generation and are retained for judge inspection:

- Risk Reduction execution: `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4`
- Rebalancing execution: `0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f`
- Arbitrage execution: `0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39`
- Oversized Risk Reduction rejection: `0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc`

They demonstrate genuine public-testnet proof/execution mechanics but are not claims that the current lifecycle factory created those historical attempts.

The dedicated historical smoke scripts remain available:

```bash
cd agent
npm run demo:risk:valid
npm run demo:risk:oversized
npm run demo:arbitrage
npm run demo:rebalance
```

Use these only as supervised evidence tooling. The production-shaped continuous runner intentionally refuses to broadcast proposals that its static on-chain preflight already says will be rejected.

## Judge checklist

Show and state all of the following clearly:

- the treasury owner and bounded agent are distinct authority roles;
- the AI reasoning layer has no treasury custody and chooses only `EXECUTE` or `WAIT` for a deterministic candidate;
- source and confirmation observations are genuine transactions with Attestcoin proofs;
- the treasury independently checks the proof, immutable market identities, policy, replay state, current market state, portfolio state and maximum permitted action size;
- a rejected/WAIT path is a safety result, not a hidden failure;
- current product treasury addresses come from the lifecycle factory, while older receipts are labeled historical evidence;
- controlled test tokens and markets prove mechanics/containment, not production economics or profit.

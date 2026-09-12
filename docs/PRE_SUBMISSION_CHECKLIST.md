# Fair Witness — Pre-Submission Checklist

This checklist is the final release gate for the BUIDL CTC hackathon build. It deliberately avoids another contract redeployment unless a custody-breaking protocol issue is discovered.

## Canonical release generation

The source of truth is `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`.

- Current factory: `0x494490bBF748e59a659227F46510535BF3818442`
- Factory deployment block: `5465730`
- Controlled faucet / recycle reserve: `0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A`
- Validator: `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5`
- Adapter: `0x9bAF94da27d5C71c42b40D25b43070083DE7296E`

`contracts/deployments/controlled-demo-schema-v1.json` is historical evidence only. Do not point new user flows or the continuous runner at its old factory.

## Automated gates

Before deploying the frontend/agent release, CI must pass all of these:

- Foundry tests.
- `forge build --sizes`.
- deployed treasury creation-code hash + size match the lifecycle manifest.
- generated client ABIs produce no git diff.
- agent Vitest + TypeScript build.
- frontend Vitest + lint + build.
- release consistency script.
- tracked-secret check.
- public `user_instances` cache contains no persisted email identifier.

Local equivalent:

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
node scripts/check-release-consistency.mjs
```

## Railway / Vercel configuration

Railway agent service must use the current lifecycle generation:

```text
FACTORY_ADDRESS=0x494490bBF748e59a659227F46510535BF3818442
FACTORY_DEPLOYMENT_BLOCK=5465730
```

Vercel must use:

```text
VITE_FACTORY_ADDRESS=0x494490bBF748e59a659227F46510535BF3818442
VITE_FACTORY_DEPLOYMENT_BLOCK=5465730
VITE_DEMO_FAUCET_ADDRESS=0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A
```

Never put a private key or service-role credential in a `VITE_` variable.

## Demo-budget rule

The demo factory remains permissionless, so the faucet is not Sybil-resistant. For the hackathon build:

- keep the faucet intentionally small;
- refill it manually only when necessary;
- keep the gas-sponsor wallet minimally funded;
- configure `GAS_SPONSOR_DAILY_BUDGET_WEI` and `GAS_SPONSOR_ADDRESS_COOLDOWN_MS`;
- do not redeploy contracts solely to add a per-user treasury cap.

## Clean-browser end-to-end test

Run this once against the actual Vercel + Railway release before submission. Use a fresh/incognito browser profile.

1. Open the landing page signed out.
2. Launch Fair Witness and authenticate with Google, Apple or email.
3. Create a Balanced mandate.
4. Confirm treasury deployment uses the current factory.
5. Confirm the deployment page can be retried safely if interrupted.
6. Fund the treasury from the controlled faucet.
7. Confirm the bounded agent becomes registered.
8. Confirm autonomous mode becomes enabled.
9. Open the dashboard and verify balances, destination TWAP price and value-based allocation.
10. Copy the treasury address and verify it matches the Explorer address.
11. Wait for the Railway runner to discover the treasury.
12. Confirm `/health` shows a recent factory scan, source observation/proof when an eligible treasury is active, and no fatal runner error.
13. Confirm the first clean static preflight is the only path to a broadcast. Rejected preflights should log `WAIT`, not spend gas.
14. Open Activity and verify the on-chain result/reason renders correctly.
15. Pause the agent and verify on-chain mode changes to Paused.
16. Resume the agent and verify on-chain mode returns to Autonomous.
17. Sign out and sign back in with the same identity; verify the existing treasury appears without creating a new account.
18. Create a second treasury from `New treasury`; verify no second authentication step is required.
19. Close one demo treasury; verify its remaining fwWCTC/fwUSD return to the demo reserve and the other treasury remains usable.
20. Verify the closed treasury journal remains readable and the runner skips it.

## Failure policy

Do not redeploy the contracts for presentation, copy, UI, service, rate-limit or documentation fixes.

A contract redeployment is justified only if the final test exposes a real issue in custody, authorization, replay protection, evidence verification, lifecycle safety or another protocol-level invariant.

Once the checklist passes, freeze the release except for judge-facing copy or documentation corrections.

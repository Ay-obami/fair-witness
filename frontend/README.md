# Fair Witness Frontend

React + Vite frontend for the current schema-v1 Fair Witness product.

The application provides:

- embedded-account sign-in;
- mandate construction and treasury deployment;
- funding/agent authorization/autonomous-mode lifecycle controls;
- a mission-control dashboard with real per-treasury agent telemetry;
- schema-v1 Activity and Decision Detail audit views;
- Safeguards/policy visualization;
- independent Verify by treasury address + attempt ID;
- controlled public-testnet evidence pages.

The frontend is not an authorization layer. Security-critical evidence, policy, replay and execution decisions are enforced by the treasury contracts.

## Local development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill only the values appropriate for your environment. Never place private keys or a Supabase service-role key in a `VITE_*` variable; Vite variables are browser-visible.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Routes

The important product routes are:

```text
/                         landing
/mandate                  create a new mandate/treasury
/signup/done              fund and launch a new treasury
/dashboard                treasury command center
/activity                 on-chain attempt journal
/decision/:treasury/:attemptId
/safeguards               deterministic policy explanation
/verify                   independent schema-v1 attempt locator
/evidence                 controlled public-testnet evidence
/docs                     user-facing help
```

The `/decision/...` route reads the current `FairWitnessTreasury.getAttempt()` schema. Legacy action-key replay UI has been removed; old `/action/*` links redirect to `/verify`.

## Live telemetry

The dashboard polls the configured agent/sponsor health API for non-sensitive `agent.treasuryPipelines` snapshots. The pipeline is intentionally quiet between cycles and only marks a stage as working when the agent is actually in that stage.

Production browser access therefore requires the agent health service to allow the deployed frontend origin through its CORS allow-list.

## More documentation

See the repository-level [`README.md`](../README.md), [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md), and [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

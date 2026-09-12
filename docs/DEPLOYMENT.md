# Deployment Guide

> **ARCHIVED LEGACY GUIDE. Do not use this file to deploy or configure the current Fair Witness product.**

The repository previously contained several generations of Fair Witness: the original arbitrage-only `ASCTreasuryJournal`, the first schema-v1 deployment, and the current lifecycle generation. Keeping old copy-paste deployment instructions beside the current product created too much risk of pointing a runner or frontend at an obsolete factory, so the legacy instructions have been intentionally retired from the active release documentation.

Their complete history remains available in Git history and `DEVLOG.md` for provenance.

## Current submission deployment

The authoritative current-generation manifest is:

```text
contracts/deployments/controlled-demo-schema-v1-lifecycle.json
```

Current Creditcoin CC3 lifecycle deployment:

```text
Factory:          0x494490bBF748e59a659227F46510535BF3818442
Deployment block: 5465730
Demo faucet:      0x477564A6e66966d2fcb5E3CaE33282e8d25dD71A
Validator:        0x13Dd030815550080Ef80Ff3499fAE8d971A119f5
Adapter:          0x9bAF94da27d5C71c42b40D25b43070083DE7296E
```

Current Sepolia source:

```text
Observer: 0x9bAF94da27d5C71c42b40D25b43070083DE7296E
Pool:     0xB88deB0436eAD37A6Dd625e9140AE45D5024424f
```

For current operation, use:

- `README.md` for the architecture and release overview;
- `docs/CONTROLLED_DEMO_RUNBOOK.md` for operator procedure;
- `docs/PRE_SUBMISSION_CHECKLIST.md` for the final release gate;
- `contracts/deployments/controlled-demo-schema-v1-lifecycle.json` for current addresses;
- `agent/.env.example` and `frontend/.env.example` for current environment-variable names and defaults.

## Historical evidence

`contracts/deployments/controlled-demo-schema-v1.json` describes the earlier schema-v1 generation that produced the public strategy execution/rejection receipts used as historical evidence. It is **not** the current factory for new user treasuries.

Do not copy factory addresses from old handoffs, historical manifests, DEVLOG entries or Git history into Railway/Vercel. The release-consistency CI job intentionally verifies the current public configuration against the lifecycle manifest.

## Contract redeployment policy

The submission build should not redeploy contracts for UI, documentation, service, gas-sponsor, account-flow or demo-quota changes. A new contract generation is justified only if a genuine custody, authorization, replay, evidence-verification, lifecycle or other protocol-level invariant bug is discovered.

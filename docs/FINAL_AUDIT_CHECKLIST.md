# Final review checklist

Base: `35f03e7` (wallet-signed sponsorship, PR #6). Scope: policy transitions, evidence freshness/replay, fixed token/venue allowlists, allowances, slippage, action/epoch/daily caps, pause/recovery, tenant isolation, release commitments and sponsorship restart accounting.

- [x] Trace treasury universal checks, strategy evaluation, self-only execution and rollback.
- [x] Trace validator proof chain, receipt index and freshness checks, hashing domains and fixed adapter route.
- [x] Trace owner exit/closure, mode changes and per-instance registration/counters.
- [x] Reproduce sponsor restart budget/cooldown loss and independent-instance accounting bypass (three failing regression cases against extracted original memory accounting).
- [x] Add durable principal reservations before transaction broadcast; retain ambiguous/failed reservations.
- [x] Verify HTTP restart after an ambiguous RPC send does not allow another wallet to bypass the daily budget.
- [x] Add lock/corruption/identity/clock rollback cases and deployment/recovery documentation.
- [x] Agent complete suite and TypeScript build.
- [x] Frontend suite, lint and production build.
- [x] Pinned Foundry dependency installation, complete contract suite and size build.
- [x] Creation-code hash/size match lifecycle manifest and client ABI comparison.
- [x] Release consistency and tracked secret/privacy hygiene checks.
- [x] Independent source review before publishing or merging (root reviewer: no blocking sponsor findings; health availability limit recorded).

No external funding, deployment or broadcast is part of this review. Existing deployment manifests are historical records; local checks do not prove current RPC state or deployed runtime bytecode.

## Validation results

- `npm test --prefix agent`: 125 passed across 20 files; `npm run build --prefix agent`: passed.
- `npm test --prefix frontend`: 14 passed; frontend lint passed with pre-existing warnings; production build passed with bundle-size warning.
- `contracts/install-deps.sh`: pinned dependency revisions installed; Foundry v1.8.3 / Solidity 0.8.24 `forge test -vvv`: 132 passed across 15 suites.
- `forge build --sizes`: passed; treasury deployed size 22,540 bytes.
- Creation-code commitment: `0x74a08f82b8271ed2008a6b27b0398ef4d6065536febf6a2850eb4e3a2ab45afc`, 24,986 bytes; exact lifecycle manifest match.
- `node contracts/script/update-abis.js` (from contracts directory) and whitespace-insensitive ABI diff: passed, no ABI content changes.
- `node scripts/check-release-consistency.mjs`, tracked private environment file check, email persistence checks and `git diff --check`: passed.
- HTTP regression also run against the actual original sponsor server: startup without a ledger and restart after an ambiguous send both fail the new tests. Restoring the fix passes all nine targeted ledger/HTTP cases.

Independent source review completed with no blocking sponsor findings; publication and merge remain with the root reviewer. No public deployment, sponsor funding or real transaction was performed; HTTP tests mock provider balance and transaction broadcast.

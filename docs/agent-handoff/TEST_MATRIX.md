# Test Matrix — Baseline & Coverage Gaps (2026-09-07)

> **Architecture-change qualification (2026-09-08):** The 103/42/build baseline
> remains green, but mainnet-specific watcher/config tests do not prove the newly
> selected Sepolia path. Sepolia chain-key/wrong-chain/source-pool cases require
> updates only after Phase 1 selects an exact source market.

> **Takeover regression (2026-09-08):** Fresh results: Foundry 103/103 PASS; agent
> 42/42 PASS plus TypeScript build; frontend oxlint and production build PASS with
> the existing chunk warning. `node --check script/audit-live-path.js` passes. The
> readiness command exits 2 by design while live preconditions are blocked; this is
> not a test failure. No live proof or swap was executed.

> **Phase 5 checkpoint (2026-09-08):** Foundry **103/103 PASS**, including 18
> composed treasury/factory tests and 257 fuzz runs over the trade-size bound. Agent
> Vitest **42/42 PASS** plus TypeScript build. Frontend oxlint and production build
> PASS; the existing large-chunk warning remains. New coverage includes deterministic
> direction, cost-adjusted width, drift, destination spot/TWAP deviation, replay,
> authorization, epoch limit, failed-swap rollback, no-withdraw/no-renounce,
> immutable safety ceilings, and tenant isolation. Live precompile/prover/DEX
> execution remains outside automated coverage.

> **Phase 3 checkpoint (2026-09-08):** Fresh full results: Foundry **76/76 PASS**,
> agent Vitest **42/42 PASS**, agent TypeScript build PASS, frontend production
> build PASS with the existing large-chunk warning. New coverage: immutable
> Uniswap V3 observer (8), strict receipt decoder (12), proof/freshness validator
> (13), and Ethereum watcher wrong-chain/failover behavior (6 total watcher tests).
> Real precompile/prover and live observer receipts remain NOT VERIFIED.

> **Phase 4 local checkpoint (2026-09-08):** Foundry **85/85 PASS** after adding
> 9 fixed PenguinSwap adapter tests. A real adapter deployment/swap remains NOT
> VERIFIED and is not represented by the mock-router test fixture.

> **Security checkpoint (2026-09-08):** Same-proof/different-index replay reproduced locally; source now binds both indices to verified Merkle positions. See [PROOF-IDENTITY-FIX.md](PROOF-IDENTITY-FIX.md). Deployed instances unchanged; live exploit/execution not tested. Phase 1 market acceptance remains blocked.

> **Repair notice (2026-09-07):** Fresh repair baseline: contracts/ forge test: 38 passed, 0 failed; agent/ npm test: 41 passed, 0 failed across six files; frontend/ npm run build: PASS with chunk warning. All exit 0. Lint and separate agent build not rerun; live integration NOT VERIFIED. Old 33-test counts/coverage assertions below are historical. See REPAIR_AUDIT.md.

## Fresh baseline runs (this session)

| Suite | Command | Result | Notes |
| --- | --- | --- | --- |
| Contracts | `cd contracts && forge test` | **33/33 PASS** | forge 1.5.1-stable; includes invariant suite |
| Agent | `cd agent && npm test` | **41/41 PASS** | vitest; includes outcome-hash test (session 22) |
| Frontend | `cd frontend && npm run build` | **PASS** | vite build 775 ms; single chunk-size warning (>500 kB) |
| Frontend types | `npx tsc` (via build) | **clean** | tsc 6.0.3 |
| Frontend lint | oxlint | **not re-run** | clean per DEVLOG session 24 (2026-09-06) |
| CI | `.github/workflows/ci.yml` | 3 jobs | forge test -vvv / vitest / frontend build; triggers: push to master + PRs |

DEVLOG-corroborated prior runs: forge 30/30 (session 18) → 33/33 (session 22);
agent 40/40 (session 18) → 41/41 (session 22); frontend clean through session 24.

## What the suites actually cover

| Area | Covered by | Notes |
| --- | --- | --- |
| Guardrail immutability + factory validation | forge (`ASCTreasuryFactory.t.sol`) | includes guardrail-validation reverts |
| Proof verification, drift/width/size/slippage/epoch rejections, reentrancy, zero-size floor, direction handling | forge (`ASCTreasuryJournal.t.sol`) | mock verifier stands in for the precompile |
| Decision engine (rule + outcome hashing, key order stability) | agent vitest | Gemini mocked |
| Guardrail mirroring, replay CLI hashing, tenant parsing, price math | agent vitest | |
| Frontend hash re-verification UI states (match / mismatch / missing) | covered indirectly (build + prior sessions) | no component tests wired in CI |

## Known coverage gaps (do not claim covered)

1. **Real precompile verify path in CI** — tests use `MockNativeQueryVerifier`; the
   real `0x…0FD2` path is only exercised by the historical live executions.
2. **Real prover end-to-end** — `attestcoinClient` against `prover.cc3-testnet` is
   not under automated test.
3. **Live agent loop** (`tenantRunner` against real RPCs) — manual runs only.
4. **Frontend component/integration tests** — none; CI runs build only.
5. **RPC failure handling** — burst `-32600`/timeout behavior untested (see
   KNOWN_ISSUES #6).
6. **`index-tenants.js`** — no test; currently broken on full-range scans.

## Regression anchor for future phases

All later phases must keep, per commit: forge 33+ PASS, agent vitest 41+ PASS,
frontend build clean, oxlint clean. Any new contract surface requires regenerating
the committed ABIs (`contracts/script/update-abis.js`) and updating the frontend's
tolerant decoders if shapes change.

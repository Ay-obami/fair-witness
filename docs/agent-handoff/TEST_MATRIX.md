# Test Matrix — Baseline & Coverage Gaps (2026-09-07)

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

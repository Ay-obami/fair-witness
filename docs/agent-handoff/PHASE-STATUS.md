# Phase Status — Master Build Plan

> **Newest common-asset checkpoint (2026-09-08):** Exact asset identity is now
> verified for candidate Sepolia WCTC `0x9cE4…4F2d` ↔ PenguinSwap WCTC
> `0x5607…329E`. The NTT managers are bidirectionally peered and unpaused, but the
> Sepolia token is zero-supply and has not assigned its burn/mint manager as minter.
> Phase 1 remains blocked on external NTT activation and source-pool creation; see
> decision #30. Earlier “no representation” notices below are superseded.

> **Sepolia-only checkpoint (2026-09-08):** Phase 1 is reopened and BLOCKED on a
> comparable Sepolia source market. No Circle-USDC/WCTC Uniswap V3 pool exists at a
> standard fee tier. Mainnet-specific Phase 2–5 completion notices below are
> historical local work, not acceptance for the selected build. See
> SEPOLIA-ONLY-REASSESSMENT.md. No transaction was sent.

> **WCTC identity checkpoint (2026-09-08):** Direct NTT peer traversal shows that
> Sepolia WCTC maps to Creditcoin-testnet token `0x069F…6a67`, not PenguinSwap WCTC
> `0x5607…329E`. The peer token has zero live supply. Phase 1 is blocked on asset
> identity as well as the absent Sepolia pool; see decision #28.

> **Wrapper-provenance checkpoint (2026-09-08):** PenguinSwap WCTC is verified as
> native Creditcoin CTC deposited into a WETH9-style wrapper. It has no bridge hooks
> and no same-address Sepolia deployment. A scan of all liquid PenguinSwap token
> addresses found only three Sepolia address collisions; each reverted on ERC-20
> metadata calls and had different bytecode, so none is a common-asset candidate.

> **Historical pre-Sepolia takeover checkpoint (2026-09-08):** Phase 4 was IN PROGRESS.
> Fresh live reads prove both selected pools still have cardinality/current-next 1/1.
> `contracts/script/audit-live-path.js` now verifies the frozen tuples, chain IDs,
> oracle/precompile state, artifacts, and optional account balances without signing.
> Known tenants have no destination trade tokens and no Ethereum deployer is
> configured. This was superseded by the Sepolia-only checkpoint above. See
> PHASE-4-READINESS.md. No transaction was sent.

> **Phase 5 checkpoint (2026-09-08):** Treasury hardening is COMPLETE locally.
> `FairWitnessTreasury` composes the immutable validator and PenguinSwap adapter;
> `FairWitnessTreasuryFactory` creates isolated tenant instances. Foundry is 103/103,
> agent is 42/42 plus build, and frontend lint/build pass. No deployment or blockchain
> transaction occurred. See [PHASE-5-REPORT.md](PHASE-5-REPORT.md). Phase 4 remains
> IN PROGRESS at its live acceptance boundary.

> **Architecture freeze V2 (2026-09-08):** Phase 1 reassessment is COMPLETE.
> [PHASE-1-FREEZE-V2.md](PHASE-1-FREEZE-V2.md) supersedes the incompatible F1–F4
> freeze in `PHASE-1-REPORT.md` and the earlier BLOCKED notices below. The selected
> source is Ethereum-mainnet Uniswap V3 USDT/WCTC; the destination is Creditcoin-
> testnet PenguinSwap V3 WCTC/USD-TCoin. Stable-quote parity is ASSUMED and must be
> disclosed. No new-path implementation, deployment, cardinality change, proof, or
> swap is claimed by this checkpoint. User continuation on 2026-09-08 authorizes
> Phase 2 implementation; state-changing network work remains a later reviewed step.

> **Security checkpoint (2026-09-08):** Same-proof/different-index replay reproduced locally; source now binds both indices to verified Merkle positions. See [PROOF-IDENTITY-FIX.md](PROOF-IDENTITY-FIX.md). Deployed instances unchanged; live exploit/execution not tested. Phase 1 market acceptance remains blocked.

> **Continuation checkpoint (2026-09-07):** Phase 1 reassessment is BLOCKED. Read [PHASE-1-REASSESSMENT.md](PHASE-1-REASSESSMENT.md) for fresh RPC evidence, invalid historical pool address, mandatory source correction, asset-comparability blocker and proof-index replay concern. This supersedes prior completion claims; no functional changes or transactions performed.

> **Repair notice (2026-09-07):** Handoff repair stop checkpoint. Historical COMPLETE labels below are NOT VERIFIED against the supplied master. Partial Phase 2/D3 ACL code and five passing tests already exist uncommitted, contradicting NOT STARTED. Real source-market integration is mandatory, not optional; F2 requires reassessment. Do not start another phase during repair. See REPAIR_AUDIT.md.

| Phase | Status | Evidence |
| --- | --- | --- |
| **Phase 0 — Repository audit** | **COMPLETE** (2026-09-07) | CURRENT_STATE.md (all 15 audit items), DEPLOYMENTS.md, TEST_MATRIX.md |
| **Phase 1 — Research + architecture freeze** | **IN PROGRESS — REOPENED/BLOCKED** (2026-09-08) | Exact Sepolia representation of PenguinSwap WCTC found, but it is zero-supply, NTT minter setup is incomplete, and no Sepolia USDC/WCTC pool exists. See SEPOLIA-ONLY-REASSESSMENT.md and decision #30. |
| **Phase 2 — Source market** | **HISTORICAL LOCAL WORK; NOT ACCEPTED FOR CURRENT TARGET** | Implementation is mainnet/chain-key-3 specific and must wait for the new Phase 1 freeze. |
| **Phase 3 — Attestcoin hardening** | **PARTIALLY REUSABLE; CURRENT TARGET NOT VERIFIED** | ABI/index hardening remains useful; chain-key/freshness integration must be revalidated for Sepolia key 1. |
| **Phase 4 — Real Creditcoin market** | **PAUSED BEHIND PHASE 1** | Destination adapter remains locally tested; no live swap and destination cardinality is still 1. |
| **Phase 5 — Treasury hardening** | **HISTORICAL LOCAL WORK; NOT DEPLOYED** | Generic policy is reusable, but it has not been integrated with an accepted Sepolia source path. |
| Phase 6+ | **NOT STARTED** | Must satisfy the separate phase acceptance checkpoints in MASTER_INSTRUCTIONS.md |

## Phase 0 completion checklist (all satisfied)

1. ✅ Repo structure mapped (no root package.json — by design; CI covers all packages).
2. ✅ Every contract + agent TS module + docs read in full.
3. ✅ Baselines: forge **33/33**, agent vitest **41/41**, frontend build **PASS** (fresh 2026-09-07.).
4. ✅ Live chain verification(re-done via RPC, not trusted from docs):chainIds 102031/11155111;
   all seven live addresses have deployed bytecode or precompile behavior(0x…0FD2 "Unknown selector");immutables match deploy defaults;journalLength A=6,B=1.

5. ✅ Execution history reconciled: 7 Blockscout txs ↔ 7 journal entries;entry(0) timestamp==block 5420062.

6. ✅ STOP conditions confirmed(KNOWN_ISSUES #1–3).
7.. ✅ Stale docs identified(PRD pre-pivot;DEPLOYMENT punted PenguinSwap ABI.

8.. ✅ Open questions + blockers + recommendations written(CURRENT_STATE §13–14;.
9.. ✅ Handoff dossier created(docs/agent-handoff/,10 files incl. this one);(now 11 with PHASE-1-REPORT.md..

## Verification protocol(repeat for later phases)

- Never trust cached claims; re-verify with `eth_chainId` / `eth_getCode` / `eth_call` / Blockscout API / fresh runs..
- Label everything `VERIFIED` / `UNVERIFIED` / `NOT VERIFIED`;carry the label into any doc that repeats it..
- No fabricated addresses/tx hashes — truncated evidence stays truncated or gets re-queried..
- Never weaken security to ship;runtime AI stays Gemini..

## ⛔ STOP — checkpoint before Phase 2

Phase 1 is complete. **Do not proceed to Phase 2 (build / real-venue integration)
without explicit user confirmation at this checkpoint.**

**Phase 1 deliverable:** `PHASE-1-REPORT.md` + updated `RESEARCH.md` — all seven gate
questions R1–R7 RESOLVED,with VERIFIED evidence or an explicit negative + Phase 2 carry-over
(open items D1–D6). Architecture frozen:PHASE-1-REPORT.md §2 (F1–F4).

- **F1** — Destination: new deployments replace MockDexRouter → PenguinSwap testnet(chainId
  102031) via a **V3 adapter**(`exactInputSingle`;QUOTE=WCTC,BASE=USD-TCoin|USDC-T 6-dec);
  existing live instances stay unchanged(additive-pivot redeploy.**Destination-price-drift gap
  (Task C/D2) is OPEN on the V3 case — open pre-condition before any real-pool bind.**
- **F2** — Source: keep `PriceObservation`,**restrict writers**(ACL= allowlisted observers,enforced);
  continue attestation of each observation tx;real-market-event attest postponed to Phase 2, gated
  on live re-verification of the chosen Sepolia venue — **never assume a stale/hardcoded Sepolia
  address(verified:the canonical Uniswap V2 factory address is NOT responsive on Sepolia**).
- **F3** — Source chain key unchanged:`SOURCE_CHAIN_KEY=1`(Sepolia;chainKey 1 VERIFIED);
  Ethereum(chainKey 3)also supported.
- **F4** — No bridging;stateless precompile re-verification remains.

**Phase 2 entry criteria:** the Phase 1 freeze(F1–F4)must hold unless re-verified live;the
build backlog is open items D1–D6 from PHASE-1-REPORT.md §4.

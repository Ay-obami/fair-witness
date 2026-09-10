# Phase 0 Audit Report — Repository Current State (2026-09-07)

> **Newest common-asset checkpoint (2026-09-08):** A global Sepolia NTT peer-event
> scan found the correct representation of PenguinSwap WCTC:
> `0x9cE462d2B56C385d0B15AEFc74413896AEa34F2d`, through Sepolia manager
> `0x84bE…aA41` and Creditcoin manager `0x7f31…B1ECc`. The peer link is exact and
> bidirectional. However, the Sepolia token has zero supply and its current minter is
> the external owner, not its burn/mint NTT manager, so inbound bridge completion
> would fail at `mint`. No source pool exists. This supersedes the earlier conclusion
> that no representation exists, but Phase 1 remains BLOCKED. See decision #30.

> **Sepolia-only architecture checkpoint (2026-09-08):** The user explicitly
> replaced the Ethereum-mainnet source with Sepolia for a testnet-only build. Phase 1
> is reopened. Chain key 1 and Sepolia WCTC/USDC contracts are live, but Uniswap V3
> returns no USDC/WCTC pool at any standard fee tier. Mainnet-specific Phase 2–5
> source assumptions are not accepted for the selected build. See
> SEPOLIA-ONLY-REASSESSMENT.md. No transaction was sent.

> **WCTC identity checkpoint (2026-09-08):** The Sepolia token's live NTT manager
> has a bidirectional Creditcoin peer, but that peer controls Creditcoin token
> `0x069F7fD9C1dc4156416ff3d5748ae94e329d6a67` (live total supply `0`), not the
> PenguinSwap pool's WCTC `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`.
> Therefore the proposed source/destination tokens are not the same NTT-linked
> asset. The audit now fails this identity check in addition to the missing source
> pool and destination cardinality. Phase 1 remains blocked; no transaction was sent.

> **Destination-wrapper checkpoint (2026-09-08):** Verified source and live state
> show PenguinSwap WCTC `0x5607…329E` is a plain native-CTC wrapper (`deposit` /
> `withdraw`), not an NTT token. Its total supply exactly equals its Creditcoin native
> balance, and its address has no Sepolia bytecode. No bridge-linked Sepolia
> representation was found. See decision #29.

> **Takeover/readiness checkpoint (2026-09-08):** Fresh regressions remain green
> (Foundry 103/103, agent 42/42 + build, frontend lint/build). Direct RPC reads
> reconfirmed chains 1/102031, both frozen venue tuples and nonzero liquidity, but
> both pools remain at observation cardinality/current-next 1/1. A fail-closed,
> read-only audit now records exact preconditions; known tenant wallets hold no WCTC
> or USD-TCoin and no Ethereum deployer is configured. Phase 4 remains blocked before
> broadcast; no transaction was sent. See PHASE-4-READINESS.md.

> **Phase 5 checkpoint (2026-09-08):** The new local path now includes a composed,
> per-tenant `FairWitnessTreasury` and immutable `FairWitnessTreasuryFactory`.
> Treasury policy independently verifies facts, direction, drift, destination
> spot/TWAP deviation, worst-case cost-adjusted edge, trade size, slippage, replay,
> rate limit, authorization, and journal state. Regressions: Foundry 103/103, agent
> 42/42 plus TypeScript build, frontend lint/build PASS. No new-path contracts are
> deployed and no blockchain state was changed. Phase 4 live acceptance remains
> open. See PHASE-5-REPORT.md; older audit narrative below is historical.

> **Current checkpoint (2026-09-08):** Phase 1 freeze V2, Phase 2 real-source
> implementation, and Phase 3 Attestcoin hardening are complete locally. Phase 4 has
> a fixed PenguinSwap adapter but remains IN PROGRESS because no real deployment/swap
> is verified and both selected pools require oracle-cardinality preparation. Current
> regressions: Foundry 85/85, agent 42/42 + build, frontend build PASS. No blockchain
> state was changed. PHASE-1-FREEZE-V2.md and PHASE-2/3/4-REPORT.md supersede older
> checkpoint notices below.

> **Security checkpoint (2026-09-08):** Same-proof/different-index replay reproduced locally; source now binds both indices to verified Merkle positions. See [PROOF-IDENTITY-FIX.md](PROOF-IDENTITY-FIX.md). Deployed instances unchanged; live exploit/execution not tested. Phase 1 market acceptance remains blocked.

> **Continuation checkpoint (2026-09-07):** Phase 1 reassessment is BLOCKED. Read [PHASE-1-REASSESSMENT.md](PHASE-1-REASSESSMENT.md) for fresh RPC evidence, invalid historical pool address, mandatory source correction, asset-comparability blocker and proof-index replay concern. This supersedes prior completion claims; no functional changes or transactions performed.

> **Repair notice (2026-09-07):** Current checkpoint: handoff repair only. HEAD ad1a71a has inherited source ACL/fixture changes and five untracked ACL tests. Fresh baseline: contracts 38/38, agent 41/41, frontend build PASS with chunk warning. Phase 0/1 completion requires reassessment against MASTER_INSTRUCTIONS.md. Reasoning is file-only, not Supabase-backed; live state not re-queried. Read LAST_SESSION.md and REPAIR_AUDIT.md. Remainder is historical.

Scope: full audit of `attested-arbitrage-journal` @ `abc931f3` (master) as the entry
gate to the master build plan. Method: every contract and TS module read in full; all
claims re-verified live via RPC (`eth_chainId`, `eth_getCode`, `eth_call`), Blockscout
API, fresh test runs, and git archaeology. Labels: **VERIFIED** (proven this session,
evidence cited), **UNVERIFIED** (claimed somewhere but not proven here), **NOT
VERIFIED** (checked and found false).

---

## 1. Repository structure (VERIFIED)

```
attested-arbitrage-journal/
├── contracts/          Foundry project (forge 1.5.1-stable)
│   ├── src/            ASCTreasuryJournal.sol (634 lines), ASCTreasuryFactory.sol,
│   │                   interfaces/{INativeQueryVerifier,IDexRouter}.sol,
│   │                   mocks/{MockDexRouter,MockERC20,MockNativeQueryVerifier}.sol,
│   │                   source-chain/PriceObservation.sol
│   ├── test/           33 tests (unit + invariant)
│   ├── script/         deploy-factory.js, register-agent.js, index-tenants.js,
│   │                   update-abis.js, .stage-tenants.env (gitignored, testnet-only)
│   └── out/            forge artifacts + committed agent/frontend ABI JSONs
├── agent/              Node 22 + TypeScript decision/execution engine
│   └── src/            index, config, decisionEngine (Gemini), attestcoinClient,
│                       submitter, tenantRunner, sepoliaWatcher, reasoningStore
│                       (Supabase + local fallback), replay CLI, dexPriceReader,
│                       tenants, treasuryGuardrails, keys + vitest tests (41)
├── frontend/           React 19 + Vite + oxlint; Thirdweb embedded wallets
│   └── src/            routes (Home, Verify, Treasury, ActionDetail, Architecture,
│                       CausalExplorer, Help), lib/{config,dataProvider,
│                       contractReader,mockData,types}, supabase/migrations/
├── docs/               DESIGN, PRD, ARCHITECTURE_V2, CURRENT_REALITY, DEPLOYMENT,
│                       ROADMAP, HELP + agent-handoff/ (these files)
├── DEVLOG.md           24 sessions of build history (authoritative narrative)
├── IMPLEMENTATION_PLAN.md  Parts 1–3 with progress logs
└── .github/workflows/ci.yml   forge test + agent vitest + frontend build
```

No root package.json (correct for a polyglot monorepo; CI handles per-package jobs).

## 2. Architecture map (VERIFIED — code + live chain)

- **Contracts.** `ASCTreasuryFactory` permissionlessly deploys independent
  `ASCTreasuryJournal` instances, each with **immutable, constructor-set** guardrails
  (MAX_TRADE_SIZE, MAX_SLIPPAGE_BPS, MIN_ARB_WIDTH_BPS, MAX_DRIFT_BPS,
  MAX_CONFIRM_GAP_BLOCKS, MAX_ACTIONS_PER_EPOCH, EPOCH_LENGTH) and immutable chain
  config (VERIFIER, DEX_ROUTER, BASE_ASSET, QUOTE_ASSET, PRICE_CONTRACT). The factory
  deliberately keeps **no registry** — enumeration is by `TreasuryDeployed` events.
  Instances have **no owner withdraw/sweep** of funds (custody separation is
  load-bearing). Agents are per-instance allowlisted by the instance owner
  (`registerAgent`); only allowlisted agents can `executeArbitrage`.
- **Agent.** `sepoliaWatcher` polls the Sepolia `PriceObservation` for `observePrice`
  events → `attestcoinClient` (via `@gluwa/usc-sdk` + `prover.cc3-testnet.creditcoin.network`)
  builds native-query proofs for the observation tx → `decisionEngine` asks **Gemini**
  (`gemini-flash-latest`, `@google/genai`) to decide within rigid rules →
  `treasuryGuardrails` mirrors the on-chain bounds as a pre-flight filter →
  `submitter` sends `executeArbitrage` to Creditcoin → `reasoningStore` persists the
  reasoning payload whose keccak hash is committed on-chain. `tenantRunner` runs one
  loop per entry in `tenants.json`; `replay` CLI re-verifies past actions offline.
- **Frontend.** React/Vite read the journal straight from the chain
  (`contractReader.ts`), with an honest **demo mode** (`mockData.ts`) that is
  explicitly labeled illustrative and swapped out per-call by `dataProvider.ts`.
  Thirdweb embedded wallets power tenant sign-up through the factory.

## 3. Execution flow (VERIFIED end-to-end, historically)

Proven by live journal entries + Blockscout txs (see DEPLOYMENTS.md §Manifest):
observe (Sepolia) → prove (Attestcoin prover → precompile verify on-chain) → decide
(Gemini) → guardrail-check → execute on the Creditcoin DEX → journal with
`decisionHash` commitment. 6 executions on Tenant A, 1 on Tenant B (2026-09-02/03),
each carrying verifier-attested source/confirm block heights.

## 4. Attestcoin verification flow (VERIFIED where stated)

- The Attestcoin precompile is **live at `0x…0FD2` on Creditcoin testnet**: `eth_getCode`
  returns `0x` (normal for a precompile) but a bogus-selector `eth_call` **reverts with
  `"Unknown selector"`** — a live handler is validating selectors there (VERIFIED).
- Both live instances were constructed with `VERIFIER = 0x…0FD2` (read via `eth_call`),
  and their 7 executions succeeded — meaning the **real precompile verify path ran
  successfully with real prover-built proofs** during those trades (VERIFIED,
  indirect but strong). The agent's proof-builder targets
  `https://prover.cc3-testnet.creditcoin.network/` (env; VERIFIED configured).
- `SOURCE_CHAIN_KEY=1` for Sepolia is documented in `agent/.env` as confirmed via
  `PrecompileChainInfoProvider.getSupportedChains()` — **UNVERIFIED this session**
  (re-verify in Phase 1; the live executions imply the chain key they used was valid).

## 5. AI decision flow (VERIFIED)

`decisionEngine.ts` calls Gemini via `@google/genai`; model `gemini-flash-latest`
(2.5-flash is unavailable to new keys — documented in `.env`). The LLM only *recommends*
within rigid rules; the contract independently re-checks prices, drift, width, and
guardrails at execution time. Reasoning is committed via `decisionHash` (keccak of a
strictly-ordered JSON payload) — the frontend re-hashes and shows match/mismatch
honestly, including pre-3.10 payloads without `outcome`/`direction`.

## 6. Source-chain flow (VERIFIED, with STOP condition)

Source of truth is `PriceObservation.sol` deployed on Sepolia at
`0x23433fcA0f35CC5e801b6888293B2B11017900c7` — bytecode contains exactly
`observePrice(uint256)` = `0x108766da`, `latestPrice()` = `0xa3e6ba94`,
`latestTimestamp()` = `0x8205bf6a` (VERIFIED). **STOP condition #3**: `observePrice`
is **permissionless** — anyone can write any price; there is no USDC market behind it.
The system's honesty comes from re-verifying the observation *on the destination chain
via Attestcoin* (which proves "a tx at block N said X", not "X is the market price").

## 7. Destination-chain flow (VERIFIED, with STOP conditions)

Destination DEX is **`MockDexRouter`** (`0x8D40f9D47886f21223357874e1a99a22DD4f9E5e`;
bytecode carries `swapExactTokensForTokens` `0x38ed1739` + `getAmountOut`
`0xb8239ebb`) with **`MockERC20`** tokens (BASE `0x0bFA…115A` has public `mint`
`0x40c10f19`; QUOTE `0x6A97…DAA1` is the same family). **STOP condition #1**: the
live demo path is entirely mock DEX + mock tokens. **STOP condition #2**: no
mainnet-grade liquidity exists on Creditcoin testnet. PenguinSwap integration was
abandoned in Task 3.12/DEVLOG session 7 (no USDC/WCTC pool on testnet) and is a
Phase-1 research item, **UNVERIFIED** whether a usable PenguinSwap router exists.

## 8. Deployment state (VERIFIED — full manifest in DEPLOYMENTS.md)

Factory + 2 tenant instances live on Creditcoin testnet since 2026-09-01; immutables
read live from Tenant A match the deploy script defaults exactly (VERIFIED via
`eth_call` of BASE_ASSET()/DEX_ROUTER()/PRICE_CONTRACT()/VERIFIER()/QUOTE_ASSET()).
Journal lengths: A=6, B=1, reconciled 1:1 with Blockscout execution txs.

## 9. Test state (VERIFIED — fresh runs, 2026-09-07)

| Suite | Result |
| --- | --- |
| `forge test` (contracts) | **33/33 PASS** |
| agent `vitest` | **41/41 PASS** |
| frontend `npm run build` | **PASS** (775 ms; one chunk-size warning) |
| frontend lint (oxlint) | clean per DEVLOG session 24 (not re-run this session) |

Coverage gaps are itemized in TEST_MATRIX.md (notably: no CI coverage of the live
agent loop against the real RPC/precompile, and no test of the real prover end-to-end
inside vitest — the mock verifier stands in).

## 10. Security-critical functions (VERIFIED — source read)

- `executeArbitrage(...)`: only allowlisted agent; double-proof verification via
  precompile (source + confirmation, same-chain enforced **in source since 3.6**),
  drift + width + slippage + trade-size + epoch-rate guardrails enforced on-chain;
  reentrancy-guarded; no admin escape hatch for funds.
- `registerAgent`/`deregisterAgent`: owner-only, per instance.
- Factory `createTreasury`: permissionless but validates chain config + guardrail
  sanity; emits `TreasuryDeployed` with the exact immutable bounds.
- **Interface drift (important):** the **deployed** instances are pre-3.6/3.7/3.10
  builds: legacy 8-field `JournalEntry` (with the since-removed fabricated
  `attestedAt` field — observed equal to `actedAt` in live entries), legacy 4+1-field
  actionPayload, `executeArbitrage` selector `0xc296ff5e`, **no** chain-mismatch or
  selector-validation checks, **no** evidence-identifier fields. Current *source*
  (12-field struct, `0xd5aa9654`) is strictly stronger; the frontend decodes both
  shapes tolerantly (VERIFIED in `contractReader.ts`). Redeploying tenants is a
  product decision (additive-pivot model), documented in DEVLOG session 17.

## 11. Mocks in the live path (VERIFIED — STOP conditions live here)

Live instances are bound (immutably) to `MockDexRouter` + `MockERC20`s with public
`mint`, and the source contract is a permissionless `PriceObservation`. All three
master-prompt STOP conditions therefore apply to the **deployed** system. The *source
tree* has since hardened the journal; the DEX/token/source replacements are exactly
what later phases must deliver (real PenguinSwap-or-better router, real token pair,
real source market) — see RESEARCH.md.

## 12. Documentation state (VERIFIED)

- `CURRENT_REALITY.md` is the reconciled source of truth and matches observed reality
  (mock DEX, Gemini-only, Vercel hosting) — spot-checked against live chain facts.
- `docs/PRD.md` still describes the **pre-pivot** plan (PenguinSwap as the destination
  DEX, "verify() x2 via 0x0FD2 → execute via PenguinSwap"). It is a historical
  requirements doc; CURRENT_REALITY supersedes it. Consider a banner in a later phase.
- `docs/DEPLOYMENT.md` matches live addresses; still lists "confirm PenguinSwap's real
  router address and ABI" as an open task (now the Phase 1 research item).
- `DEVLOG.md` (24 sessions) is accurate and unusually honest; treat it as ground
  truth for *why*, these handoff docs for *what is*.

## 13. Blockers to submission-readiness

None hard-block progress. The material gaps (in priority order):
1. Mock DEX/tokens + permissionless source in the live path (STOP 1–3).
2. No real-market liquidity on Creditcoin testnet to demo meaningful arbitrage.
3. Deployed instances lag the hardened source (legacy struct, weaker checks).
4. `contracts/script/index-tenants.js` fails on the full block range (RPC 10s
   getLogs limit) — needs chunked scanning (workaround proven this session).
5. Hosting: Vercel auto-deploy not connected (CLI-only); GitHub Pages mirror stale.

## 14. Recommended changes (for later phases, not Phase 0)

- Replace mock DEX/tokens with the best real testnet venue discoverable in Phase 1
  (PenguinSwap or fallback per PRD §12), and re-point new deployments only — never
  mutate existing instances (immutables).
- Make `PriceObservation` writes restricted or attest a **real** Sepolia market event
  type instead; decide after Phase 1 research.
- Chunk `index-tenants.js` getLogs scans (proven fix this session) and add RPC retry/
  backoff in agent reads (intermittent `-32600 Invalid request` bursts observed).
- Redeploy tenant instances from current source once STOP conditions are resolved, so
  the journal carries evidence fields and the stronger validation set.
- PRD banner; connect Vercel Git integration; retire GH Pages mirror.

## 15. Evidence index

- Chain IDs: `eth_chainId` → `0x18e8f` (Creditcoin, =102031), `0xaa36a7` (Sepolia).
- Bytecode/selector proofs: see DEPLOYMENTS.md §Bytecode evidence.
- Execution txs + journal decode: DEPLOYMENTS.md §Manifest.
- Test outputs: TEST_MATRIX.md (fresh 2026-09-07 runs).
- Git archaeology: `git show 651479b` (stage-1 sources matching deployed bytecode).

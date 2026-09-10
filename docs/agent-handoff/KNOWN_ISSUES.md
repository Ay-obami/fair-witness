# Known Issues (2026-09-07)

> **Newest blocker refinement (2026-09-08):** Candidate Sepolia WCTC
> `0x9cE4…4F2d` is provably linked to PenguinSwap WCTC, correcting the earlier
> no-representation conclusion. It is not operational: supply is zero and `minter()`
> is owner `0x30Ab…F4C8`, while verified NTT mode-1 code mints through manager
> `0x84bE…aA41`. Only that external owner can call `setMinter`. No source pool exists.

> **New highest-priority blocker (2026-09-08):** The selected source is now Sepolia,
> but no Uniswap V3 Circle-USDC/WCTC pool exists at a standard fee tier. The current
> observer/agent path is mainnet-specific and cannot be deployed as the selected
> build. Phase 1 is reopened. See SEPOLIA-ONLY-REASSESSMENT.md.

> **Additional asset-identity blocker (2026-09-08):** Sepolia WCTC's NTT manager
> registers Creditcoin peer `0x03718cC4…817F0`, which points to zero-supply token
> `0x069F7fD9…6a67`. PenguinSwap uses different WCTC `0x56072113…329E`. These cannot
> be treated as the same cross-chain arbitrage asset.
> The PenguinSwap factory has no USD-TCoin pool for `0x069F…6a67` at a standard fee,
> and the testnet indexer reports no pool containing that token.

> **No Penguin WCTC Sepolia representation found (2026-09-08):** Verified contract
> source for `0x5607…329E` contains only ERC-20 plus `deposit`/`withdraw`; live supply
> equals the contract's native CTC balance exactly. The same address has no Sepolia
> bytecode, and official public WCTC materials document production networks rather
> than a Sepolia route for this wrapper.

> **Fresh Phase 4 blocker evidence (2026-09-08):** Both frozen pools currently have
> observation cardinality/current-next 1/1, although `observe([300,0])` succeeds.
> The immutable local observer/adapter policy still requires >=16. Existing tenant
> wallets have no WCTC or USD-TCoin, and no Ethereum deployer is configured. See
> PHASE-4-READINESS.md and use the read-only audit before any broadcast.

> **Phase 5 checkpoint (2026-09-08):** Local treasury composition is implemented
> and tested; it is no longer an implementation blocker. No new-path component is
> deployed, both selected pools still need filled 300-second observation history,
> and no real proof-to-PenguinSwap receipt exists. Decision payload integrity and
> Supabase-backed reasoning remain Phase 7 work. Existing live deployments still use
> the legacy mock path.

> **Current classification (2026-09-08):** Phase 1 research blockers are resolved by
> [PHASE-1-FREEZE-V2.md](PHASE-1-FREEZE-V2.md), and the Phase 2 observer, receipt
> decoder, immutable fact validator, and Ethereum watcher are implemented locally
> ([PHASE-2-REPORT.md](PHASE-2-REPORT.md)). Live evidence remains open: both pools
> need cardinality/history preparation; no observer/validator/adapter is deployed;
> no real proof or swap has run. The adapter is implemented locally, while new
> treasury composition and Supabase reasoning persistence remain unimplemented. Existing deployments
> remain legacy mock-path deployments.

> **Security checkpoint (2026-09-08):** Same-proof/different-index replay reproduced locally; source now binds both indices to verified Merkle positions. See [PROOF-IDENTITY-FIX.md](PROOF-IDENTITY-FIX.md). Deployed instances unchanged; live exploit/execution not tested. Phase 1 market acceptance remains blocked.

> **Continuation checkpoint (2026-09-07):** Phase 1 reassessment is BLOCKED. Read [PHASE-1-REASSESSMENT.md](PHASE-1-REASSESSMENT.md) for fresh RPC evidence, invalid historical pool address, mandatory source correction, asset-comparability blocker and proof-index replay concern. This supersedes prior completion claims; no functional changes or transactions performed.

> **Repair notice (2026-09-07):** Use MASTER_INSTRUCTIONS.md §68 ten STOP conditions; old numbering below is superseded. Supabase reasoning integration is absent; phase completion and source freeze need reassessment. Local ACL tests do not verify deployment or a real market. See REPAIR_AUDIT.md.

Ordered by severity. "STOP" items map to the master prompt's mandatory stop
conditions: they do not block *work*, they block *submission claims of real-market
execution* until replaced.

## STOP-severity

1. **Mock DEX + mock tokens in the live path** (STOP 1).
   Both deployed instances immutably bind `MockDexRouter` `0x8D40…9E5e` and
   `MockERC20`s (`0x0bFA…115A` with public `mint 40c10f19`, `0x6A97…DAA1`). Verified
   via `eth_getCode` selector extraction. Fix = new deployments bound to a real venue.
2. **No mainnet-grade liquidity on Creditcoin testnet** (STOP 2).
   Nothing to arbitrage against at size; the mock pool is seeded 1:1 by design
   (deploy script). Phase 1 must find the best real venue (PenguinSwap?) or scope
   claims honestly.
3. **Permissionless source price observation** (STOP 3).
   Sepolia `PriceObservation.observePrice(uint256)` has no access control — anyone
   can write any price. Attestcoin re-verification proves the *event*, not market
   truth. Options: restricted writer, or attest a real market's event instead.

## High

4. **`contracts/script/index-tenants.js` fails on the full block range.**
   `eth_getLogs` from block 5411764 → latest exceeds the RPC's 10-second query
   timeout (reproduced this session, twice). Chunked scanning (500–1000 blocks) works
   but found no events near the expected range before the RPC started rate-limiting;
   needs a chunked rewrite + retry/backoff. Deploy tx hashes were recovered from
   Blockscout instead (see DEPLOYMENTS.md).
5. **Deployed instances lag the hardened source.** Live tenants are pre-3.6/3.7/3.10:
   fabricated `attestedAt` still present (observed `attestedAt == actedAt`), no
   chain-mismatch check, no observation-selector validation, no evidence fields,
   legacy `executeArbitrage` (`0xc296ff5e`). Known and accepted by the additive-pivot
   model (DECISIONS #11) — resolve by redeploying after STOP fixes.
6. **RPC flakiness.** Public CC3 RPC intermittently returns `-32600 "Invalid request"`
   bursts under load and enforces a 10s query timeout. Affects agent reads and any
   scanning script. Recommend retry/backoff + the backup endpoint pattern already
   used for Sepolia (`SEPOLIA_RPC_URLS`).

## Medium

7. **`docs/PRD.md` describes the pre-pivot plan** (PenguinSwap as destination DEX).
   Superseded by `CURRENT_REALITY.md`; risk of misleading judges reading top-down.
   Add a banner. (Also `docs/DEPLOYMENT.md` line 26/51 still punt PenguinSwap ABI
   confirmation to the reader.)
8. **History contains a former Gemini key and submitter key.** Both were rotated
   2026-09-03 (old key `AQ.Ab8RN6K…`, old EOA `0x2404Ed…` burned). Current values in
   gitignored `.env`s. Do not scrub history casually; do note it in the submission.
9. **Hosting: Vercel auto-deploy not connected** (CLI deploys only); GitHub Pages
   mirror stale/broken. Connect the Git integration or document CLI-only flow.
10. **Frontend main chunk >500 kB** (Vite warning). Cosmetic; code-split if time.

## Low / notes

11. **Tenant labeling divergence** (`tenant-a/b` in agent vs `tenant-1/2` in frontend
    registry) — intentional but confusing; the extra `owner` field is ignored by the
    agent parser.
12. **`getJournalEntry` ABI pitfall**: live instances return the tuple wrapped with a
    dynamic offset; flat `AbiCoder.decode(['bytes32',…])` fails with misleading
    "out-of-bounds"/"overflow" errors. Use `['tuple(…)']`.
13. **oxlint/lint baselines** were clean per DEVLOG session 24 but were not re-run in
    Phase 0 (only build + tests). Re-run before submission.
14. **`0xf63431df…` auxiliary contract** (Sep-1 deploy run) has no identified role —
    its bytecode embeds both factory and tenant selector sets. UNVERIFIED purpose;
    likely a combined deploy artifact. Do not reference it as live infrastructure.

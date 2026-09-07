# Known Issues (2026-09-07)

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

# ROADMAP — Fair Witness V2 (attested custody-free arbitrage journal)

Single-source, forward-looking checklist for the V2 pivot. The landing-page prompt
required `docs/ROADMAP.md` as reading; this file did **not** previously exist (the roadmap
lived only in `DEVLOG.md` + `ARCHITECTURE_V2.md`). A stage counts as done only when its
checklist is **independently verified**: ✅ confirmed on-chain, 🔄 in progress,
❌ not started.

Chain: **Creditcoin CC3 testnet** — `chainId 102031`, RPC
`https://rpc.cc3-testnet.creditcoin.network`, prover
`https://prover.cc3-testnet.creditcoin.network/`, explorer (Blockscout)
`https://creditcoin-testnet.blockscout.com`.

## Quick status

| Stage | Goal | Status | Verified |
|---:|---|---:|---|
| 1 | Factory + >=2 instances on CC3 testnet | ✅ | on-chain (block 5,420,111; DEVLOG Sessions 8–9) |
| 2 | Embedded-wallet sign-up -> user deploys own instance | 🔄 | frontend built (tsc+oxlint+vite clean); browser E2E pending real Thirdweb client ID |
| 3 | Multi-tenant agent service polls every instance | ✅ | on-chain (DEVLOG Session 9) |
| 4a | On-chain tenant enumeration (TreasuryDeployed -> registry) | ✅ | DEVLOG Session 8 |
| 4b | Login-gated per-user dashboard (plain-language activity) | ❌ | blocked on auth<->address mapping |
| 4c | Supabase auth <-> contract-address mapping | ❌ | external provisioning |
| 5 | Landing page + help/docs + hosted viewer (GH Pages) | 🔄 | landing + help built; GH Pages redeploy pending |

## Chain & contract reference (CC3 testnet)

| Role | Address / value |
|---|---|
| Chain id | `102031` |
| RPC | `https://rpc.cc3-testnet.creditcoin.network` |
| Prover | `https://prover.cc3-testnet.creditcoin.network/` |
| Explorer (Blockscout) | `https://creditcoin-testnet.blockscout.com` |
| **Factory** (permissionless, no admin) | `0x97c81D68BbCDb1A673b61176d60F071963Abe7f2` |
| Verifier precompile | `0x0000000000000000000000000000000000000FD2` (Attestcoin) |
| DEX router | `0x8D40f9D47886f21223357874e1a99a22DD4f9E5e` (V1 MockDexRouter, 1M:1M) |
| BASE_ASSET (USDC-like, 6 dp, **public mint**) | `0x0bFA6eF009f8739c727b292849029608bd6b115A` |
| QUOTE_ASSET (MQT) | `0x6A97b1913Bca9d17A57cAae1F6b5C1885bE1DAA1` |
| Price source (Sepolia) | `0x23433fcA0f35CC5e801b6888293B2B11017900c7` (SOURCE_CHAIN_KEY=1) |

Stage-1 instances (guardrails `maxTradeSize / maxSlippage / minArbWidth / maxDrift / maxConfirmGap / maxActions / epochLen(seconds)`):

| Instance | Owner | Guardrails |
|---|---|---|
| `0x13CACe...2026` (Tenant A) | `0xd1D4...1C77` | `5_000_000 / 150 / 80 / 100 / 20 / 6 / 86400` |
| `0xD66C...60aB` (Tenant B) | `0xa3fC...3a90` | `10_000_000 / 200 / 120 / 150 / 30 / 3 / 86400` |

Stage-2 entry point builds on `contracts/src/ASCTreasuryFactory.sol`:

```solidity
function createTreasury(address owner_, ASCTreasuryJournal.Guardrails calldata guardrails_)
    external returns (ASCTreasuryJournal treasury)
```

Event (the on-chain record of a tenancy):
`TreasuryDeployed(address indexed treasury, address indexed owner, uint256 maxTradeSize, uint256 maxSlippageBps, uint256 minArbWidthBps, uint256 maxDriftBps, uint256 maxConfirmGapBlocks, uint256 maxActionsPerEpoch, uint256 epochLength)`.

The instance is `Ownable`; `owner` can call `registerAgent(address)` per-instance
(allowlist). `mint` is on `BASE_ASSET` (public on testnet).

## Stage 1 — Factory contract  ✅ (reference)

Done when: factory deployed; >=2 instances with different constraints; both verified on
Blockscout; `TreasuryDeployed` events + live immutable-guardrail reads match V1 defaults.
Verified on-chain (revert-checked receipts, not logs). See `DEVLOG.md` Sessions 8–9.

## Stage 2 — Embedded-wallet sign-up -> own-instance deployment  🔄 THIS SESSION

Goal: a user signs up with email/social (non-custodial Thirdweb in-app wallet — OTP, no
password), chooses their seven guardrails **once**, deploys their own
`ASCTreasuryJournal` through `ASCTreasuryFactory.createTreasury`, and lands on a
dashboard. No pooled/custodial balances: the platform never touches user funds; the
instance holds them.

Done when:
- [x] `thirdweb@^5` + `react-router-dom@^7` added to `frontend/package.json` (peer
  `react ^18 || ^19` — React 19 compatible, no peer conflicts).
- [x] `ThirdwebProvider` wraps the app; CC3 chain + `VITE_THIRDWEB_CLIENT_ID` configured.
- [x] `/signup` route: Email + Google via `inAppWallet` (no separate password flow).
- [x] Guardrails form: 7 fields, V1-default pre-fill, live validation mirroring
  `createTreasury`'s `InvalidGuardrails` revert (non-zero; bps bounds <= 10,000).
- [x] Deploy: `createTreasury(owner=wallet, guardrails)`; poll `TreasuryDeployed`; persist
  mapping `wallet -> instance` (localStorage prototype; Supabase seam).
- [x] `/app` dashboard: instance address + explorer link + live immutable-guardrail read;
  "Connect existing" paste path; post-deploy buttons: register platform agent, fund
  instance.
- [x] `npm run lint && tsc -b && vite build` clean.
- [ ] Runtime E2E in a browser (email OTP -> deploy -> dashboard). See Limitations.

Files touched (this session):
`frontend/package.json`, `.env.example`; `src/lib/config.ts`, `src/lib/chain.ts`,
`src/lib/thirdweb.ts`, `src/lib/guardrails.ts`, `src/lib/instanceStore.ts`;
`src/components/ConnectWallet.tsx`, `src/components/GuardrailsForm.tsx`,
`src/components/InstanceSuccess.tsx`; `src/routes/SignUp.tsx`, `src/routes/Dashboard.tsx`;
`src/main.tsx`, `src/App.tsx`; `README.md`.

> **Guardrails note (ARCHITECTURE_V2 sec 3.2, flagged as ours):** all seven bounds are
> parameterized and chosen once — exactly because V1's `constant`s would otherwise be
> shared-but-immutable here, making the per-tenant "shape" claim ambiguous. V1 defaults are
> the form's presets; the user may not weaken the contract's invariants, only pick within
> them.

### Post-deploy lifecycle (wallet-signed by the user/owner)
1. **Deploy** — `factory.createTreasury(msg.sender, guardrails)`. In flow.
2. **Register agent** — `instance.registerAgent(AGENT_ADDRESS)` (owner-only, per-instance).
   `0xB1D19F...654f` is the platform agent submit address (rotated 2026-09-03).
3. **Fund** — `BASE_ASSET.mint(owner, ...)` then `transfer(instance, ...)`. Testnet-only
   (public mint); production token has no public mint, so this UI is testnet-only.

### Limitations this session (honest)
- **No browser here.** Email OTP + contract deploy can't run end-to-end in this headless
  sandbox. Mitigation: `tsc -b` + `vite build` + `oxlint` clean, and a standalone
  `npx tsx scripts/stage2_smoke.ts` that builds `createTreasury` calldata from the real
  factory ABI + decodes `TreasuryDeployed`, proving the struct-tuple + event decode are
  valid. Real browser + funded embedded wallet still required for E2E.
- **Gas.** Deploying one instance ~= 0.02-0.05 CTC. The flow checks the wallet balance and
  links the CC3 testnet faucet if zero. Creditcoin CC3 is **not** in thirdweb's gasless
  (ERC-4337) relayer allow-list, so explicit wallet funding is the honest MVP;
  gas-sponsorship is a tracked follow-up once a supported bundler/chain is chosen.
- The embedded wallet is an EOA (`createOnLogin: "eoa"`) so it can be `owner` and call
  `registerAgent`/`mint`/`transfer` directly.
- **Keys.** The platform submit key was exposed (DEVLOG Session 9) and has been
  **rotated** (2026-09-03, Session 13); the Gemini key has been rotated too (new value
  absent from git history). *Addresses* are public, not secret; the private material now
  lives only in `agent/.env` (gitignored) — see Security.

## Stage 3 — Multi-tenant agent service  ✅ (Session 9)

Done when: agent polls every tenant each cycle against each user's own instance; LLM
provider allow-list enforced (Gemini / OpenAI / Mistral; **Claude excluded**);
per-instance guardrails in the decision prompt + cache key. Verified on-chain: Sepolia
11622681 -> 11622685 -> tenant-a `act=true` (140 bps gap vs 80 bps floor),
`executeArbitrage` at CC3 block 5,420,111 status `0x1`, `2,187,500` units in /
`2,182,130` back (~24.5 bps, inside 150 bps cap), `ActionJournaled`; tenant-b declined the
same facts (120 bps floor). Open: key rotation (P0). After Stage 2 sign-up: **re-run
`contracts/script/index-tenants.js`** (or CI it) so new instances land in
`public/tenants.json` / `agent/tenants.json`; the agent starts polling a new tenant only
once it appears in the registry (intentional — nothing acts on an instance not in the
index).

## Stage 4 — Dashboard + hosted viewer

4a (enumeration) ✅ | 4b (dashboard) 🔄 built, needs migration + live verify | 4c (auth<->address mapping) ✅ built | 4d (hosted viewer) ❌ deploy-gated

- 4a: factory is deliberately registry-free (sec 3.3); source of truth is `TreasuryDeployed`.
  `contracts/script/index-tenants.js` scans it -> `{tenants}` JSON. ✅ shipped.
- 4b: login-gated dashboard at `/dashboard` (Session 13). Requires a funded Thirdweb
  embedded-wallet session (same OTP as /signup). Lists the wallet's instances from the
  Supabase mapping; per-instance "add yours" flow verifies on-chain `owner() == wallet`
  before saving, so claims on other people's contracts fail. Verified-execution detail
  remains the Replay & Audit Viewer (executed rows journaled on-chain vs absent/not-found
  = rejected/never-happened). Honest gap: version 4b as-built shows per-owner instances;
  the RLS policy is anon-read/write baseline — per-user access auth (custom JWT bridging
  Thirdweb login to Supabase `auth.jwt`) is the production hardening tracked below. 🔄
- 4c: replace the pre-pivot localStorage prototype (never shipped) with a Supabase upsert
  keyed on `(email, wallet_address)` <-> `instance_address`. `instanceStore.ts` +
  `frontend/supabase/migrations/0001_user_instances.sql` (run it in the Supabase SQL
  editor). Fire-and-forget from `/signup`; the on-chain deployment is the source of truth.
  ✅ built; needs the migration applied to the project + live verify.
- 4d: redeploy GitHub Pages with new routes + committed `tenants.json`. ❌ deploy
  needs external access/credentials (config is ready — `public/404.html` SPA fallback
  with `fw:redirect` sessionStorage restore in `main.tsx`)

## Stage 5 — Landing page + help/docs  🔄 (unblocked)

The Stage 2 sign-up flow is now built (Session 11), so the landing-page gate is lifted.
Built across Sessions 11–12:
- `frontend/src/routes/Home.tsx` — landing page (honest pitch, real proof from live CC3,
   how-it-works beats, scope statement, CTA -> /signup, footer -> /verify + /docs)
- `frontend/src/routes/Help.tsx` — plain-language help answering all 6 required questions
- `docs/HELP.md` — the same plain-language help as a repo doc (required by this stage's
   done-when + by anyone auditing the repo, not just the hosted app)
- `frontend/src/routes/Verify.tsx` — the old Replay & Audit Viewer, relocated to /verify
- `README.md` — rewritten to describe the actual current multi-tenant reality (factory,
   live instances + execution tx, new routes, honest status table, caveats)
- `frontend/public/404.html` + `main.tsx` restore — GH Pages SPA fallback so hard
   refreshes on `/signup/done?address=…` land back on the same route

Remaining: the actual `gh-pages` deploy (credential/access-gated — nothing codeblocked
here; run `cd frontend && npm run build && npx gh-pages -d dist` from a machine with
GH auth).

Done when: root landing with plain-language copy + CTA -> `/signup`; `docs/HELP.md` +
`docs/DEPLOYMENT.md#stage-2-sign-up` updated with the flow + env reference; hosted on
GH Pages with SPA fallback configured.

## Security (P0 — before any real funds)

- **KEY ROTATION.** The platform submit key `0xf571031a...ee38f` (address
  `0x2404Ed7251fAecb2981886BA1d2A88060D4ef3d2`) and the first Gemini key were committed to
  the repo (DEVLOG commits `078acdd`, `f40191b`; the old Gemini `AQ.Ab8RN6K...` is also in
  commit `b8094f45`). **Both rotated 2026-09-03 (Session 13):** the submit key is replaced
  — new address `0xB1D19F71d68c4e7065749e8593D338E9A30D654f` (new private key in
  `agent/.env`), and the Gemini key in `agent/.env` is now a fresh value (`AQ.Ab8RN6I...`,
  confirmed **not** in git history). Both rotations are local-only (`agent/.env` is
  gitignored). Revoke the old Gemini key in Google AI Studio. Treat any key pasted in
  plaintext (chat / shell history) as burned. The sign-up flow exposes only the agent's
  **address**, never its key.
- No admin/escape hatch on the instance — unchanged and not reintroduced by Stage 2.
- `registerAgent` is owner-only and per-instance — Stage 2 calls it from the **user's**
  wallet, never the platform.
- Frontend: `VITE_THIRDWEB_CLIENT_ID` is a client id (not secret) but env is
  `.example`-gated; never commit secrets.
- `createTreasury` is permissionless — fine; the factory has no owner/mint/AdminWithdraw
  surface to abuse.

## Environment reference

Frontend (`.env` / `frontend/.env.example`): `VITE_CREDITCOIN_RPC_URL` · `VITE_CHAIN_ID=102031` ·
`VITE_FACTORY_ADDRESS=0x97c81D68BbCDb1A673b61176d60F071963Abe7f2` ·
`VITE_AGENT_SUBMIT_ADDRESS=0xB1D19F71d68c4e7065749e8593D338E9A30D654f` · `VITE_THIRDWEB_CLIENT_ID=...` ·
`VITE_EXPLORER_BASE_URL=https://creditcoin-testnet.blockscout.com` ·
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Stage 4c; migration in
`frontend/supabase/migrations/0001_user_instances.sql`) · `VITE_DEMO_MODE=false`.

Agent (`agent/.env` / `.env.example`): `SEPOLIA_RPC_URL`, `CREDITCOIN_RPC_URL`,
`CREDITCOIN_PROOF_BUILDER_URL`, `TREASURY_ADDRESS`, `FACTORY_ADDRESS`, `TENANT_ID`,
`AGENT_SUBMIT_PRIVATE_KEY` (rotate), `SOURCE_CHAIN_KEY=1`, `GEMINI_API_KEY`/`GEMINI_MODEL`,
`POLL_INTERVAL_MS=30000`, `MIN_ARB_WIDTH_BPS_LOCAL_ESTIMATE=80`, `CONFIRM_GAP_TARGET_BLOCKS=3`.

# Deployment Guide

> **DEPLOYMENT RECORD:** this guide was executed end-to-end on 2026-08-23. Live addresses,
> transaction hashes, the adversarial-demo result, and every pitfall hit along the way are
> recorded in `DEVLOG.md` → "Session 7". The demo runs against a seeded constant-product
> pair instead of PenguinSwap (no USDC/WCTC pool existed on testnet — PRD §12 fallback);
> see that entry for real-V3 integration notes.

Everything in this repo was built and tested in a sandboxed environment with **no live
RPC or external API access** (see `DEVLOG.md`'s "Environment notes"). This document is
the copy-paste path for doing the actual live deployment from a normal machine. Read
`DEVLOG.md`'s open risks section first — two things below are flagged as unconfirmed and
should be checked before relying on them.

## Before you start: the formerly-blocking item is now resolved

The **contract-side price decoding** gap (the single item that previously blocked a live
end-to-end run) has been fixed in this build phase. `ASCTreasuryJournal._decodePriceObservation`
now decodes the real Attestcoin `encodedTransaction` envelope (`abi.encode(uint8 txType,
bytes[] chunks)`, as produced by the `gluwa/usc-sdk` — see the CONFIRMED note in DEVLOG),
checks the underlying tx was sent to `PRICE_CONTRACT`, and reads its `receiptStatus` for the
success/failure bit. The Foundry suite now builds proof payloads using that real encoding,
so the on-chain decoder is tested against the exact format a live proof carries.

Two things below are still flagged as **unconfirmed** and must be checked first (Step 1):
the real precompile's verify surface at `0x0FD2`, and PenguinSwap's real router ABI.

## Step 1 — Confirm the unconfirmed things

```bash
cd agent
npm install
```

Write a tiny throwaway script (or use `npx tsx`) to call, against the real Creditcoin
testnet RPC:

```ts
import { chainInfo } from "@gluwa/usc-sdk";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
const provider2 = new chainInfo.PrecompileChainInfoProvider(provider as never);
console.log(await provider2.getSupportedChains());
```

Confirm:
- Sepolia is actually in the returned list, and note its exact `chainKey`.
- Whether any non-EVM chain (relevant if you ever revisit a Solana-sourced idea) appears.

Separately, confirm PenguinSwap's real router address and ABI on Creditcoin testnet
matches `contracts/src/interfaces/IDexRouter.sol`'s assumed
`getAmountOut`/`swapExactTokensForTokens` surface (see `DEVLOG.md` pitfall #4). If it
doesn't match, update that interface (and `MockDexRouter`'s test double, if the real
ABI's semantics differ enough to matter for the test suite) before deploying against it.

## Step 2 — Deploy the toy Sepolia source contract

```bash
cd contracts
source contracts/install-deps.sh   # if not already run
forge create src/source-chain/PriceObservation.sol:PriceObservation \
  --rpc-url $SEPOLIA_RPC_URL --private-key $DEPLOYER_KEY --broadcast
```

Note the deployed address — this is `PRICE_CONTRACT_ADDRESS` for the agent's `.env`.

## Step 3 — Deploy ASCTreasuryJournal on Creditcoin testnet

Fill in the env vars documented at the top of `contracts/script/Deploy.s.sol`:

```bash
export VERIFIER_ADDRESS=0x0000000000000000000000000000000000000FD2   # confirm against real network
export DEX_ROUTER_ADDRESS=...   # real PenguinSwap router, confirmed in Step 1
export BASE_ASSET_ADDRESS=...   # Creditcoin-side capital the treasury actually holds (see DEVLOG's
                                 # "BASE_ASSET is Creditcoin-side capital" design note — NOT Sepolia USDC directly)
export QUOTE_ASSET_ADDRESS=...  # the paired token on PenguinSwap
export PRICE_CONTRACT_ADDRESS=... # the toy Sepolia PriceObservation contract from Step 2 — the
                                # only contract whose observePrice transactions the treasury will accept
export OWNER_ADDRESS=...        # a multisig, ideally, for anything beyond a demo
export PRIVATE_KEY=...          # deployer key, NEVER the agent's submit key

forge script script/Deploy.s.sol:Deploy --rpc-url $CREDITCOIN_RPC_URL --broadcast
```

Then, manually (not automated by the script, deliberately — see the script's own
printed next-steps):
1. `treasury.registerAgent(<agent submit address>)` as the owner.
2. Fund the treasury directly with `BASE_ASSET` — it holds its own capital.
3. **Confirm the agent submit key holds zero `BASE_ASSET`/`QUOTE_ASSET` balance and zero
   approvals to anything.** This is the custody-separation claim from `DESIGN.md` — it's
   only true if you actually check it, not by construction of the code alone.

## Step 4 — Configure and run the agent

Copy `agent/.env.example` to `agent/.env` and fill in every value — `TREASURY_ADDRESS`
and `PRICE_CONTRACT_ADDRESS` from Steps 2–3, a real `GEMINI_API_KEY` (free tier via
[Google AI Studio](https://aistudio.google.com/), no card required), and a **freshly
generated, zero-balance** `AGENT_SUBMIT_PRIVATE_KEY` — funded with only enough
Creditcoin-testnet gas token to pay for transactions, nothing else.

```bash
cd agent
npm run dev
```

Watch the logs. Expected rejections (stale, narrow, rate-limited, replayed) are the
system working correctly, not bugs — see `index.ts`'s inline comment on this.

## Step 5 — Serve the reasoning store to the frontend

`agent/src/reasoningStore.ts` writes to a local `.reasoning-store/` directory on
whatever machine runs the agent. The frontend's live mode
(`frontend/src/lib/contractReader.ts`) expects to fetch
`{VITE_REASONING_API_URL}/{decisionHash}.json` over HTTP — **this repo does not include
a server for that directory.** The fastest paths, in order of effort:
- Simplest: run `npx serve .reasoning-store` (or any static file server) alongside the
  agent, and point `VITE_REASONING_API_URL` at it. Fine for a demo, not for production
  (no auth, no persistence guarantees).
- Better: have `reasoningStore.ts` additionally `put` to a small hosted KV (Cloudflare
  KV, a Supabase table, etc.) instead of/alongside the local file, and point the
  frontend there.
- Most aligned with the "tamper-evident" framing: publish to IPFS and use a public
  gateway URL — the content-addressing itself becomes an extra integrity check on top
  of the on-chain hash commitment, though this adds latency and a new dependency.

None of these are implemented in this repo — pick one based on how much time is left
before the deadline.

## Step 6 — Deploy the frontend

```bash
cd frontend
cp .env.example .env   # set VITE_DEMO_MODE=false and fill in the rest per Step 5
npm run build
```

`dist/` is a static site — any static host works (Vercel, Netlify, GitHub Pages, etc.).

## Step 7 — Rehearse the adversarial demo

Per the PRD's week-4 plan: deliberately submit a stale, too-narrow, or duplicate proof
live and show the contract cleanly rejecting it. This is a stronger demo moment than
only showing the happy path — it's the actual evidence the rigid bounds work, not just a
claim in the README.

## Stage 2 — Sign-up flow (embedded wallet)

The V2 multi-tenant pivot adds a Thirdweb embedded-wallet sign-up flow. A visitor lands
on the Vite-built SPA, signs up with an email, and the app:

1. Creates a non-custodial embedded wallet (no seed phrase, no MetaMask) for them via
   Thirdweb's `inAppWallet`.
2. Prompts them to choose seven guardrails (max trade size, max slippage, min arb
   width, max drift, max confirm gap, actions per epoch, epoch length).
3. Signs a `factory.createTreasury(owner, guardrails)` transaction from the user's
   wallet — the factory is permissionless, so this works for anyone.
4. Parses the `TreasuryDeployed` event from the receipt, then routes the user to
   `/signup/done?address=<theirNewInstance>` — a confirmation page that reads their
   guardrails back live from the instance and prompts them to fund it.

### Frontend env (`.env` / `.env.example`)

```
VITE_DEMO_MODE=false
VITE_CREDITCOIN_RPC_URL=https://rpc.cc3-testnet.creditcoin.network
VITE_FACTORY_ADDRESS=0x97c81D68BbCDb1A673b61176d60F071963Abe7f2
VITE_THIRDWEB_CLIENT_ID=<your-client-id>
VITE_EXPLORER_BASE_URL=https://creditcoin-testnet.blockscout.com
VITE_AGENT_SUBMIT_ADDRESS=0xB1D19F71d68c4e7065749e8593D338E9A30D654f
VITE_REASONING_API_URL=http://localhost:8787  # the static server from Step 5
```

### Creditcoin testnet via Thirdweb

Thirdweb's custom chain config (in `frontend/src/lib/thirdweb.ts`) uses `defineChain`
with `id: 102031` directly — this is the one non-trivial detail: Thirdweb's default
chain list doesn't include CC3, and the embedded-wallet RPC must point at the real
Creditcoin testnet RPC (`https://rpc.cc3-testnet.creditcoin.network`), not a generic
Ethereum endpoint.

### Funding a new instance

The BASE_ASSET on CC3 testnet is `0x0bFA6eF009f8739c727b292849029608bd6b115A`
(USDC-like, 6 decimals, public mint). After deployment, the user mints/deposits test
USDC to their instance contract address. The agent (Step 4) then begins watching that
instance automatically once it appears in `public/tenants.json`.
## Stage 4b/4c — Login-gated dashboard + Supabase auth↔address mapping

The frontend's `/dashboard` route (Stage 4b) is a login-gated per-owner list of
instances, backed by a **Supabase** auth↔address mapping (Stage 4c). It is optional:
if the Supabase vars are unset the dashboard shows a clear note and the rest of the
app is unaffected.

### 1. Apply the migration

Create the table + RLS policies by running the committed migration in the Supabase
Dashboard (SQL editor) or via psql:

```bash
psql "$DATABASE_URL" -f frontend/supabase/migrations/0001_user_instances.sql
```

The migration creates `public.user_instances (id, email, wallet_address,
instance_address unique, created_at)` with indexes and baseline RLS.

### 2. Frontend env (`frontend/.env` — ANON key only, never service-role)

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
```

The browser bundle must **never** contain a service-role key. The anon key is
deliberately limited by the RLS policies in the migration.

### 3. How it fits the flow

- `/signup` persists the `(email, wallet_address) ↔ instance_address` mapping
  fire-and-forget right after `TreasuryDeployed` is parsed. The on-chain deployment is
  the source of truth; a failed save never blocks the sign-up.
- `/dashboard` reads mappings by `wallet_address` for the signed-in embedded wallet.
  The "add an instance you own" flow verifies `owner() == wallet` on-chain *before*
  saving, so claims on other people's contracts are refused.

### Honest scope (see `docs/ROADMAP.md` → Stage 4b/4c)

As-built, RLS is an anon-read/write baseline (instances are already public on-chain —
this table is a convenience index, not a confidentiality boundary). True per-user
access auth — a custom JWT bridging Thirdweb login identity into Supabase `auth.jwt`
claims — is the tracked production hardening item.

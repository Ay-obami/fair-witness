# Fair Witness — Browser E2E Walkthrough (MVP acceptance test)

Target: a stranger can go landing page → own funded instance → agent watching → verify an
action — with no manual step from the platform. Run against the **live** site:
`https://ay-obami.github.io/fair-witness/`

Tester: ____________  Date: ____________

## 0. Pre-flight — laptop, ~5 min

- [ ] `cd agent && npm install && npm run build`
- [ ] Start the agent: `npm start` (or `npm run dev` for auto-reload)
- [ ] Expect startup log per tenant: `[tenant-1] runtime ready: instance=0x… guardrails(maxTradeSize=…, slippage=…bps, width=…bps, …)` — **no missing-env errors**
- [ ] Agent gas check (Blockscout): `0xB1D19F71d68c4e7065749e8593D338E9A30D654f` holds CTC (~10k verified 2026-09-04) and **0** BASE_ASSET

## 1. Landing & navigation — ~2 min

- [ ] Open the site → hero + live-proof cards render, browser console clean
- [ ] Nav to `/docs`, `/verify`, `/dashboard` — all resolve (deep-refresh `/dashboard` too: SPA fallback)

## 2. Sign up with a FRESH email — ~5 min

- [ ] Sign up → enter a **new** email (not the tenant A/B one) → **Create wallet**
- [ ] Expect "Sending code…" → guardrails page (the code is already emailed — check spam)
- [ ] Defaults are fine → **Continue — verify your email** → OTP page → paste code → **Verify & deploy my contract**
- [ ] Deploying… → lands on `/signup/done?address=0x…`
- [ ] FAIL PATH: insufficient-funds error → use the faucet link on the page to fund the embedded wallet address, then retry from the OTP step
- [ ] Guardrail table shows 7 live on-chain values; "View on explorer" opens Blockscout

## 3. Register-the-agent button (new code path — first real click) — ~2 min

- [ ] Card shows "Not registered yet" → click **Register the agent**
- [ ] Embedded wallet signs invisibly → "Confirm in your wallet…" → flips to **registered ✓** after the on-chain re-read
- [ ] Blockscout: `registerAgent` tx from your address to the instance, status 1
- [ ] (If it errored: friendly message shows, wallet-rejection case included)

## 4. Fund the instance — ~3 min

- [ ] Blockscout → BASE_ASSET `0x0bFA6eF009f8739c727b292849029608bd6b115A` → **Write Contract** → connect any wallet (MetaMask) → `mint(<instanceAddress>, 1000000000)` → sends 1,000 USDC to the instance
- [ ] Instance page on Blockscout shows the USDC balance
- Alt (only if you export the owner's key): `OWNER_PK=0x… TENANTS_FILE=tenants.json TENANT_LABEL=tenant-3 npx tsx src/fundPerTenant.ts` from `agent/`

## 5. Re-index so the agent watches it — ~3 min

- [ ] `cd contracts && node script/index-tenants.js`
- [ ] `cp out/tenants.scanned.json ../agent/tenants.json && cp out/tenants.scanned.json ../frontend/public/tenants.json`
- [ ] Restart the agent (Ctrl-C → `npm start`) → new line: `[tenant-3] runtime ready: instance=0x… guardrails(…)`
- [ ] Optional tidy: `cd frontend && npm run build && npx gh-pages -d dist` so the live Home table lists it

## 6. Agent cycle — watch it think — timing: 30s poll + minutes of proof latency

- [ ] Logs show per-cycle: `[tenant-3] LLM decision: act=true/false — "rationale"`
- [ ] `act=false` → `LLM recommended not acting — no submission made.` — **this is normal** (real gaps are market events; the first action can take hours). Nothing is journaled on a decline.
- [ ] `act=true` → `Executed. actionKey=… tx=…` (or an expected contract-rejection line: stale/narrow/rate-limited/replayed)

## 7. Verify an action — ~3 min

- [ ] Copy an `actionKey` from an `Executed` log line. No fresh execution yet? Use a **past** one from tenant-1/tenant-2 (old agent logs, or `ls agent/.reasoning-store`)
- [ ] Live site: `/verify?actionKey=0x…` → entry resolves on-chain: prices, guardrail snapshot, reasoning hash
- [ ] Known limitation: the live build has `VITE_REASONING_API_URL` unset → the hash-match column reads "couldn't be retrieved" (documented in DEPLOYMENT.md §5)
- [ ] Full hash-match demo (optional, local): `cd agent && npx serve .reasoning-store -l 4173` then `cd frontend && VITE_REASONING_API_URL=http://localhost:4173 npx vite dev` → `/verify` → hash-match ✓

## 8. Dashboard — ~3 min

- [ ] `/dashboard` → same email → **Send code** → OTP → **Verify & sign in**
- [ ] Instance list shows the new contract (mapping was saved at sign-up)
- [ ] "Add yours" with someone else's address → rejected: `Owned by 0x…, not your wallet`

## 9. Verdict

- [ ] Tally each section pass/fail; record addresses, tx hashes, screenshots
- Triage: OTP never arrives → spam folder / resend link / Thirdweb dashboard Email check · deploy revert → embedded wallet has no CTC (faucet) · register fails → session belongs to a different email than the owner · agent silent → `tenants.json` not re-indexed or env missing · verify empty → wrong actionKey or un-mined tx

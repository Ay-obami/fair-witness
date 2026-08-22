# Replay & Audit Viewer

React + Tailwind frontend for the Attested Custody-Free Arbitrage Journal. Given an
`actionKey`, reconstructs the full attestation -> decision -> action chain and
independently re-hashes the retrieved off-chain reasoning to confirm it matches the
on-chain `decisionHash` commitment - the concrete "prove the reasoning wasn't edited
after the fact" moment described in `docs/DESIGN.md`.

## Quick start

```bash
npm install
npm run dev
```

Runs in **demo mode** by default (`VITE_DEMO_MODE=true`) - no live RPC needed. Three
sample entries are provided via the quick-pick chips, illustrating:
1. A normal, hash-verified execution.
2. A deliberately tampered reasoning payload, to prove the mismatch detector actually
   catches something rather than always showing a green checkmark.
3. A decisionHash with no retrievable reasoning, to show the honest "unverifiable, not
   assumed either way" state.

## Live mode

Set `VITE_DEMO_MODE=false` and fill in `VITE_CREDITCOIN_RPC_URL`,
`VITE_TREASURY_ADDRESS`, and `VITE_REASONING_API_URL` (see `.env.example`). Note:
`VITE_REASONING_API_URL` must point at something that actually serves the agent's
locally-stored reasoning payloads over HTTP - `agent/src/reasoningStore.ts`'s local file
store isn't reachable from a browser as-is. See `docs/DEPLOYMENT.md`.

## Design

Deliberately not a generic indigo/purple SaaS palette - a dark "forensic ledger"
aesthetic (near-black slate, monospace data, a single teal "verified" accent and amber
"alert" accent) matching the audit-tool nature of what this actually is.

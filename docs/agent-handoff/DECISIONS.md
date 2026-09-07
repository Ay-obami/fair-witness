# Decisions Log

Why the system is the way it is. Sources: DEVLOG.md sessions, git history, and this
session's live verification. Add new decisions at the bottom with date + rationale.

| # | Decision | Rationale (evidence) |
| --- | --- | --- |
| 1 | **MockDexRouter + MockERC20 as the live demo DEX/tokens** | PenguinSwap on Creditcoin testnet had no USDC/WCTC pool (DEVLOG session 7 "PenguinSwap reality check"; Task 3.12). PRD §12 explicitly budgets for this fallback. Consequence: STOP conditions 1–2 (KNOWN_ISSUES). |
| 2 | **Permissionless `PriceObservation` on Sepolia as source** | Keeps the source chain dependency-free; honesty restored by re-verifying the observation via Attestcoin on the destination chain (proves "a tx at block N said X", not that X is the market price). Consequence: STOP condition 3. |
| 3 | **Runtime AI = Gemini only** (`gemini-flash-latest` via `@google/genai`) | Deliberate choice, re-confirmed in Task 3.12 docs reconciliation (DEVLOG session 22, 1167). Do not swap providers. |
| 4 | **Immutable per-instance guardrails, set at construction** | Guardrails cannot be loosened post-deploy; different tenants get different rigid bounds via the factory (factory test proves immutability). |
| 5 | **Factory keeps no tenant registry** | A mutable shared tenant list would be centralized state; enumeration is via `TreasuryDeployed` events (`index-tenants.js`). (ARCHITECTURE_V2 §2, §3.3.) |
| 6 | **No owner withdraw/sweep of funds** | Custody separation is load-bearing; fund recovery = redeploy + publicly visible migration, never a silent admin pull (DEVLOG "Design decision: no admin escape hatch"). |
| 7 | **Remove `attestedAt` (Task 3.7) instead of faking it** | A Creditcoin contract cannot read a Sepolia block timestamp; a self-reported timestamp inside permissionless `observePrice` would be weaker evidence than block heights. Observation moments are identified by verifier-attested `sourceBlockHeight`/`confirmBlockHeight`. Live instances pre-date this fix (observed: `attestedAt == actedAt`). |
| 8 | **Evidence identifiers in the journal (Task 3.6)** + chain-mismatch + `observePrice` selector validation | Closes cross-chain confirmation pairing, calldata-shape assumption, and journal-opacity holes. Not yet in deployed instances. |
| 9 | **Commit the decision outcome (Task 3.10)** | `decisionHash` payload gained `outcome` (and `direction`), serialized in a fixed key order so pre-3.10 payloads still hash-match; frontend mirrors the order exactly (contractReader.ts). |
| 10 | **Tolerant dual-shape decoding in the frontend** | Live instances are pre-3.6; the viewer decodes extended (12-field) first, legacy (8-field) fallback, showing "not recorded" honestly rather than inventing values (contractReader.ts). |
| 11 | **Additive-pivot redeploy model** | Hardened source changes *future* deployments; the two live instances stay as-is (DEVLOG session 17). Never try to "fix" deployed immutables. |
| 12 | **Key hygiene** | Gemini key + agent submitter key both rotated 2026-09-03 after the old values appeared in git history (`0x2404Ed…` burned → `0xB1D1…654f`). Stage-1 demo tenant keys are gitignored and testnet-only. |
| 13 | **Frontend demo mode is honest** | `mockData.ts` is explicitly illustrative, mirrored to the two real instances, and swapped per-call by `dataProvider.ts`; live mode reads chain directly. Demo ≠ presented-as-chain-data. |
| 14 | **Vercel is canonical hosting** | https://fair-witness.vercel.app deployed via CLI (session 24); GH Pages mirror stale/broken and deprioritized. Auto-deploy pending dashboard Git connection. |
| 15 | **Reasoning store: Supabase + local file fallback** | `reasoningStore.ts` keeps the off-chain reasoning payload retrievable for hash verification; frontend's `VITE_REASONING_API_URL` stays empty unless the store is served over HTTP. |

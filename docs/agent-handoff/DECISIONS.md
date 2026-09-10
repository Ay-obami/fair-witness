# Decisions Log

> **Repair notice (2026-09-07):** Historical entries preserved, not endorsed. #15 conflicts with file-only reasoning storage; #17 cannot waive mandatory real source; #19 repeats a gas-unit error. See REPAIR_AUDIT.md.

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
| 16 | **Real destination venue (F1):PenguinSwap (V3) on Creditcoin testnet** | Phase 1 (2026-09-07): real,official Creditcoin-ecosystem DEX(Gluwa);app bundle+testnet indexer/router-service VERIFIED (130 pools/75 liquid, WCTC↔USD-TCoin live quote at pool `0x04a3…2e9`). New deployments replace MockDexRouter with this via a V3 adapter. Existing instances immutable, unchanged;;additive-pivot. |
| 17 | **Summary/F2 — source market FROZEN to restricted-writer PriceObservation** | Permissionless `observePrice` (STOP 3) gets an ACL(allowlisted observer agents)enforced;observations stay OUR writes,attested to be a header-observed event(not market truth). Real-market-event attest (Uniswap V2/Chainlink AnswerUpdated)postponed to Phase 2,gated on live re-verification — no stale/hardcoded Sepolia address may be assumed(the canonical Uniswap V2 factory address is NOT responsive on Sepolia,Phase 1 VERIFIED|
| 18 | **F3/F4 — source chain key + no-bridge preserved** | `SOURCE_CHAIN_KEY=1` maps to Sepolia(chainId 11155111,chainKey 1—— VERIFIED live via getSupportedChains();chainKey 3=Ethereum also supported). Stateless precompile re-verification remains(no messaging introduced..)
| 19 | **News from the R6 gas data feeds guardrail sizing** | 7 execution receipts: ~468k gas/exec @ 500 gwei = ~0.23 CTC/tx.(Phase 1 VERIFIED.inserted into the economics input used for new deployment guardrails. |


## 20 — 2026-09-07: Restore persistent instructions and session checkpoint

Persist complete supplied master as version 1.0 ACTIVE, dated 2026-09-07. This is
initial persistence, not an architectural amendment. Create LAST_SESSION.md,
establish hierarchy/session-end protocol in README.md, and record contradictions in
REPAIR_AUDIT.md. Preserve inherited functional edits and qualified historical docs.
No security requirements or architecture changed; no next phase authorized. The old
reference to decision #20 predates this entry and was not an existing freeze decision.


## 21 — 2026-09-07: Reopen Phase 1 acceptance; no new freeze

User requested continuation after repair. Read-only reassessment verified Sepolia
V3 candidates and recovered/re-queried a valid destination pool address. Old F2
cannot make real market integration optional. Asset comparability and proof-bound
identity remain unresolved; Phase 1 is BLOCKED. No master or architecture change
approved or implemented. See PHASE-1-REASSESSMENT.md and its raw RPC evidence.


## 22 — 2026-09-08: Bind submitted transaction indices to verified Merkle positions

The targeted same-proof/different-index regression failed before the fix: the
second execution did not revert. Preserve existing fact/action-key formulas and
require source and confirmation indices to match calculateTxIndex on their verified
Merkle paths. SDK ABI and read-only live precompile calls establish uint64 semantics.
This closes a concrete local policy defect without weakening or changing master
requirements. No deployment; Phase 1 market freeze remains blocked.
See PROOF-IDENTITY-FIX.md and evidence/proof-index-semantics.json.


## 23 — 2026-09-08: Replace the incompatible Phase 1 freeze with real comparable WCTC markets

Freeze Ethereum-mainnet Uniswap V3 USDT/WCTC as the source market and Creditcoin-
testnet PenguinSwap V3 WCTC/USD-TCoin as the destination. The source fact comes from
a new immutable `EthereumV3MarketObserver.observe()` call that derives a 300-second
TWAP from the frozen pool; callers cannot supply a price. The destination uses a
fixed-purpose V3 adapter and new treasury instances use WCTC as the 18-decimal base.
Attestcoin source key is 3, submitted proof indices are bound to their Merkle paths,
and absolute proof age is measured against the chain-info precompile's latest
attested Ethereum height. USDT/USD-TCoin parity is explicitly ASSUMED, so the demo
cannot claim fungibility or risk-free profit. Pool observation cardinality >=16 and
a filled 300-second history are deployment preconditions. This supersedes decisions
#16–#18 where incompatible. See PHASE-1-FREEZE-V2.md and its cited raw evidence.


## 24 — 2026-09-08: Constrain PenguinSwap through a fixed-purpose adapter

The new destination adapter immutably binds the verified PenguinSwap V3
router/factory/pool/WCTC/USD-TCoin/500-fee tuple. Its only variable execution inputs
are direction, amount, minimum output, and deadline; route, recipient, and router
calldata are code-defined. It checks destination TWAP availability before swaps,
uses bounded temporary approval, and verifies exact input spend plus actual output
balance delta. This keeps arbitrary DEX calldata outside the AI and treasury trust
surface. See PHASE-4-REPORT.md. Live deployment/execution remains NOT VERIFIED.


## 25 — 2026-09-08: Compose immutable per-tenant execution authority

Use `FairWitnessTreasury` as the new execution authority, immutably bound to one
`VerifiedMarketFactValidator` and one `PenguinV3Adapter`, and create tenant instances
through an administrator-free `FairWitnessTreasuryFactory`. Preserve the fact-derived
replay key across caller/reasoning changes and keep proof age/confirmation gap inside
the immutable validator. Require gross edge to cover the tenant minimum, configured
maximum slippage, rounded-up V3 pool fee, and a 20 bps execution reserve. Add protocol
ceilings for configurable slippage, drift, spot/TWAP deviation, rate, and epoch
duration so constructor immutability cannot freeze an effectively disabled policy.
Preserve the established no-withdraw and no-renounce custody model. Local tests
verify atomic rollback and tenant isolation; no deployment is claimed. See
PHASE-5-REPORT.md.


## 26 — 2026-09-08: Resume the incomplete Phase 4 gate before Phase 6

Takeover verification found that both frozen V3 pools still report observation
cardinality/current-next 1/1 and that no new-path deployment or funded swap exists.
Although Phase 5 was completed locally and the prior last-session note proposed
Phase 6, master phase ordering and the user's explicit no-skip instruction require
returning to Phase 4 live acceptance. Add a read-only, address-only readiness audit;
do not create or run a broadcaster until the Ethereum/Creditcoin signers, tenant,
agent, funding asset/quantity, current chain state, and transaction targets are
reviewed. See PHASE-4-READINESS.md. No security architecture changed.


## 27 — 2026-09-08: Testnet-only source means Sepolia; reopen Phase 1

The user explicitly requires a testnet-only build and selected Sepolia as the source.
Set the target source to chain ID 11155111 / Attestcoin chain key 1 and forbid the
mainnet chain-key-3 path. This supersedes decision #23's Ethereum-mainnet source but
does not waive real-market or asset-comparability requirements. Fresh RPC reads found
verified-code Sepolia WCTC and Circle USDC, but no Uniswap V3 USDC/WCTC pool at fee
100/500/3000/10000. Phase 1 is therefore reopened and blocked on a truthful source
market. Recommended resolution: a fully disclosed controlled Sepolia Uniswap V3
USDC/WCTC pool if legitimate token acquisition and liquidity seeding are possible.
See SEPOLIA-ONLY-REASSESSMENT.md. No transaction was sent.

## 28 — 2026-09-08: Reject the discovered Sepolia NTT token for the PenguinSwap path

Direct live reads traversed Sepolia WCTC manager
`0xe6fE381bd1B4C5EBdf0a83aE39434169eE7b2e78` through `getPeer(59)` to
Creditcoin manager `0x03718cC4A5B02f2127C891B0e6f05A42a7E817F0`, then verified
the reverse `getPeer(10002)` link. The Creditcoin manager's `token()` is
`0x069F7fD9C1dc4156416ff3d5748ae94e329d6a67`, whose live total supply is zero.
It is not PenguinSwap WCTC `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`.
Therefore a source pool built with the discovered Sepolia token would not price the
same bridged asset traded by the selected destination pool. Reject this pairing;
do not describe identical names/symbols or same-address mainnet branding as asset
identity. No transaction was sent.

The PenguinSwap testnet factory additionally returned zero for the linked Creditcoin
token against USD-TCoin at every standard fee tier, and the PenguinSwap indexer
returned no pool containing it. Switching the destination to that token therefore
does not currently provide a real-market fallback.

## 29 — 2026-09-08: Treat PenguinSwap WCTC as Creditcoin-native only

Blockscout-verified source and direct RPC establish that PenguinSwap WCTC
`0x56072113e08015e1c40A3F3f656b1C1Fa78E329E` is a plain WETH9-style wrapper:
`deposit()` mints against native CTC and `withdraw()` releases native CTC. Its live
total supply equals the contract's native balance exactly
(`224507489811958139103326995` wei). It has no owner/minter/peer/bridge interface,
and the same address has no Sepolia bytecode. Do not claim that the Sepolia NTT token
or ticker equality represents this testnet-native wrapper. Phase 1 stays blocked on
a provably common testnet asset; no transaction was sent.

## 30 — 2026-09-08: Select the exact Penguin WCTC Sepolia candidate, but require NTT activation

A global Sepolia `PeerUpdated(uint16,bytes32,uint8,bytes32,uint8)` log query filtered
to Wormhole CreditCoin ID 59 found six managers. Sepolia manager
`0x84bE3C8f42D98B8B33504B14Ae2309E6896faA41` controls token
`0x9cE462d2B56C385d0B15AEFc74413896AEa34F2d` and points to Creditcoin manager
`0x7f31479f589eEfA04E43f216f7F1fF33f20B1ECc`. That manager controls the exact
PenguinSwap WCTC `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E` and points back.

Treat `0x9cE4…4F2d` as the only currently verified Sepolia common-asset candidate.
This supersedes decision #29 only where it concluded that no representation exists;
decision #28 remains correct for the unrelated `0xeB32…1E53` deployment.

Do not yet freeze or deploy the market. The Sepolia token has total supply zero and
its `minter()` is owner `0x30Ab…F4C8`, not the NTT manager. Sepolia manager mode is
burning (`1`), and its verified implementation calls `token.mint()` on inbound
completion. Therefore the bridge cannot mint until the external owner assigns the
manager as minter. The official Uniswap V3 factory also returns zero for Circle
USDC/`0x9cE4…4F2d` at fee 100/500/3000/10000. Phase 1 remains blocked; no transaction
was sent.

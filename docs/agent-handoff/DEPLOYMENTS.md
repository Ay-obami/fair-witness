# Deployments — Verified Manifest (2026-09-07)

> **Newest external NTT discovery (2026-09-08; not a project deployment):** Sepolia
> token `0x9cE4…4F2d` / manager `0x84bE…aA41` is exactly peered with Creditcoin
> manager `0x7f31…B1ECc` / PenguinSwap WCTC `0x5607…329E`. Both managers have live
> proxy bytecode and reciprocal peers. The Sepolia token has zero supply and its
> minter remains the external owner rather than its NTT manager, so this is not yet
> an operational deployment dependency. No transaction was sent.

> **Fresh no-deployment checkpoint (2026-09-08):** Direct RPC reads re-verified the
> legacy bytecode, tenant journal lengths 6/1, immutable mock bindings, recorded
> deployment receipts, and a sampled execution receipt. No new-path address is
> present in repository configuration and no transaction was sent. Phase 4 readiness
> evidence is in PHASE-4-READINESS.md.

> **Read-only NTT discovery (2026-09-08; not a project deployment):** Sepolia token
> `0xeB32…1E53` uses manager `0xe6fE…2e78` (Wormhole ID 10002), which is
> bidirectionally peered with Creditcoin-testnet manager `0x0371…17F0` (ID 59).
> That peer controls zero-supply token `0x069F…6a67`, not PenguinSwap WCTC
> `0x5607…329E`. These external contracts were not deployed by this session and do
> not constitute a usable Fair Witness market path. No transaction was sent.

> **External destination token provenance (2026-09-08):** PenguinSwap WCTC
> `0x5607…329E` was deployed in successful tx `0x7592e008…c153f` on 2024-11-21.
> Verified source is a native-CTC deposit/withdraw wrapper; live supply equals native
> backing. The same address has no Sepolia bytecode. This is not a Fair Witness
> deployment and no transaction was sent during verification.

> **Phase 5 checkpoint (2026-09-08):** `FairWitnessTreasury` and
> `FairWitnessTreasuryFactory` exist only in local source. They have no address,
> deployment transaction, block, or live bytecode to record. No blockchain
> transaction was sent during Phases 2–5. Entries below describe legacy deployments.

> **Continuation checkpoint (2026-09-07):** Phase 1 reassessment is BLOCKED. Read [PHASE-1-REASSESSMENT.md](PHASE-1-REASSESSMENT.md) for fresh RPC evidence, invalid historical pool address, mandatory source correction, asset-comparability blocker and proof-index replay concern. This supersedes prior completion claims; no functional changes or transactions performed.

> **Repair notice (2026-09-07):** Network claims below are historical and UNVERIFIED in this repair. No deployments, transactions or RPC checks performed. Local ACL code does not prove deployment. Re-query critical claims before relying on them. See REPAIR_AUDIT.md.

Every address below was re-verified this session via RPC (`eth_chainId`,
`eth_getCode`, `eth_call`) and/or the Creditcoin Blockscout API
(`https://creditcoin-testnet.blockscout.com/api`). Nothing is copied from docs.

## Chains

| Chain | chainId | RPC | Notes |
| --- | --- | --- | --- |
| Creditcoin testnet (CC3) | 102031 (`0x18e8f`) | `https://rpc.cc3-testnet.creditcoin.network` | destination chain; Blockscout at `https://creditcoin-testnet.blockscout.com`; prover at `https://prover.cc3-testnet.creditcoin.network/` |
| Sepolia | 11155111 (`0xaa36a7`) | `https://ethereum-sepolia-rpc.publicnode.com` (+ backups) | source chain |

## Live contracts (Creditcoin testnet) — VERIFIED

| Role | Address | Evidence |
| --- | --- | --- |
| Attestcoin verifier (precompile) | `0x0000000000000000000000000000000000000FD2` | `eth_getCode` = `0x` (precompile-normal); bogus-selector `eth_call` reverts `"Unknown selector"` → live handler |
| MockDexRouter (destination DEX) | `0x8D40f9D47886f21223357874e1a99a22DD4f9E5e` | code present; selectors incl. `38ed1739` swapExactTokensForTokens, `b8239ebb` getAmountOut |
| BASE_ASSET (USDC-like MockERC20) | `0x0bFA6eF009f8739c727b292849029608bd6b115A` | ERC20 selectors + public `mint` `40c10f19` |
| QUOTE_ASSET (MQT MockERC20) | `0x6A97b1913Bca9d17A57cAae1F6b5C1885bE1DAA1` | ERC20 selectors |
| Sepolia PriceObservation | `0x23433fcA0f35CC5e801b6888293B2B11017900c7` (Sepolia) | selectors `108766da` observePrice(uint256), `a3e6ba94` latestPrice(), `8205bf6a` latestTimestamp() |
| ASCTreasuryFactory | `0x97c81D68BbCDb1A673b61176d60F071963Abe7f2` | created by tx `0x9e0637f154aa1016ca247b6f34647a2dfa124a4dfb4514084b1887a88551ed18`, block 5411764 (2026-09-01 12:23:45 UTC); bytecode has `createTreasury` `9bf20334` |
| Tenant A instance | `0x13CACe3989b295048De47C68F32Ff3d844AC2026` | created tx `0xb0bb01e60dc1086cd5c75eb66ba31f91b0aff95449578c354edd1e33295daf30` (block 5411765) |
| Tenant B instance | `0xD66C607072df7dB98A75aEe81fCA4089462c60aB` | created tx `0xdd657fa6291c4924789131ba4d3ab63f0b3eb4ea540f14ab378947e33d1345d2` (block 5411766) |

## Tenant instances — live state (read via eth_call, VERIFIED)

| Field | Tenant A | Tenant B |
| --- | --- | --- |
| owner | `0xd1D4020279C86e41FE688A1D7F31f7F8436A1C77` | `0xa3fC15a9F8899E10bBe77456e9E6466C274c3a90` |
| journalLength | **6** | **1** |
| MAX_TRADE_SIZE | 5,000,000 | 10,000,000 |
| MIN_ARB_WIDTH_BPS | 80 | 120 |
| MAX_DRIFT_BPS | 100 | 150 |
| MAX_SLIPPAGE_BPS | 150 | 200 |
| VERIFIER | `0x…0FD2` | same (shared factory config) |
| DEX_ROUTER | `0x8D40…9E5e` | same |
| BASE_ASSET | `0x0bFA…115A` | same |
| QUOTE_ASSET | `0x6A97…DAA1` | same |
| PRICE_CONTRACT | `0x2343…00c7` (Sepolia) | same |
| JournalEntry shape | **legacy 8-field** (pre-3.6): `attestedAt == actedAt` observed | legacy 8-field |
| executeArbitrage selector | `0xc296ff5e` (pre-3.10 signature) | same |

(MAX_SLIPPAGE_BPS values come from the factory event args + agent/frontend config,
not a direct re-read this session — labeled UNVERIFIED value, VERIFIED presence of
the guardrail family.)

## Execution manifest (VERIFIED via Blockscout + journal decode)

Deployer/submitter EOA of record: `0x2404Ed7251fAecb2981886BA1d2A88060D4ef3d2`
(pre-rotation agent key; burned 2026-09-03 — current submitter is `0xB1D1…654f`
per `frontend/.env`).

| # | Block (UTC time) | Tx hash | Instance | Note |
| --- | --- | --- | --- | --- |
| 1 | 5420062 (09-02 23:04:00) | `0x86591836ccd1a0219d5e815ac18555423c1150b96fc9a711c632ed3626ec2f55` | A | journal entry 0 (decoded below) |
| 2 | 5420102 (09-02 23:14:15) | `0x7db12759d35e233ea4aa31e0ce639ecf4ff8da2f70f0a0c86c57f316d6eaf4f5` | A | |
| 3 | 5420111 (09-02 23:16:30) | `0xae01e705cc993a578c4a5da092241142750e82cffe7c858654111a82a358106b` | A | |
| 4 | 5420466 (09-03 00:45:30) | `0x1ee1e32c724e355dccc0c58ec6790eacbbbd8e25f093db4b37b8f10a4092f8b8` | A | |
| 5 | 5420469 (09-03 00:46:15) | `0x757289a70d0db56a333891e0119e143b2c941adca2e1d0b93d49fcfea5f9ec12` | **B** | Tenant B's single journal entry |
| 6 | 5420868 (09-03 02:26:00) | `0x0d17fee685e8fe01aaea50b73500d84498b5065a3b5190f87c7acb185f5fb7b9` | A | |
| 7 | 5420912 (09-03 02:37:00) | `0x0d701330dc864c3ce20be6feb2f445934534da36b8e715ebdfe5e06b3d023ae3` | A | |

Reconciliation: 6 txs → Tenant A (`journalLength` 6), 1 tx → Tenant B (1). Entry 0's
`actedAt` (1788390240 = 2026-09-02T23:04:00Z) equals block 5420062's timestamp exactly.

**Entry 0 (decoded from raw `getJournalEntry`):** actionKey
`0xbde1f837f19c5a80000f15a5165e54e5036e267d407fb958890579b871392cbc`, factKey
`0xebc1d4ff0efa64116b8c206dbcbc71997ce25a88bedc41bcb2779084b17d4324`, agent
`0x2404Ed…`, type 0 (ARBITRAGE, legacy enum), tradeSize 2,187,500, srcPrice
1,010,000, confPrice 1,011,000, widthBps 140, amountOut 2,180,868.
(`attestedAt == actedAt` — the pre-3.7 fabricated-timestamp behavior, since removed
from source; live instances still carry it.)

## Bytecode evidence (selectors extracted from live code, 2026-09-07)

- Factory: `9bf20334 createTreasury`, `f06a1e13`, `c55ed10e`, `8f6d3e54`, `7af11ac0`, `08c84e70`.
- Tenant A (26 selectors incl.): `8da5cb5b owner`, `acdb5208 MAX_TRADE_SIZE`,
  `ebfe0347 journalLength`, `b0781e78 getJournalEntry`, `306b9bb9 registerAgent`,
  `8f6c0f92 deregisterAgent`, `c296ff5e executeArbitrage` (pre-3.10),
  `3b1c57cb executedActions`, `dc7ed79c validateGuardrails`, `715018a6
  renounceOwnership`, `f2fde38b transferOwnership`.
- Sepolia PriceObservation: `108766da observePrice(uint256)`, `a3e6ba94 latestPrice()`,
  `8205bf6a latestTimestamp()`.
- MockDexRouter: `38ed1739 swapExactTokensForTokens`, `b8239ebb getAmountOut`
  (+ `0fc63d10 tokenA`, `5f64b55b tokenB`, `19e36f3b`, `8d7e076d`).
- Selector↔signature mapping computed with ethers `id()` from the agent's ethers copy.

## Historical / deprecated (do not reference as live)

| Contract | Address | Status |
| --- | --- | --- |
| V0 single-tenant treasury (Aug 22–24, 8 exec txs) | `0x78c986079ee1c8701a56eed7303ac2301403e1dd` | superseded (historical) |
| V1 multi-tenant factory (Aug 28) | `0x26b84ac2859e4489c5198489b1aeee50994fa3db` | superseded; created 2 short-lived instances (txs `0xb88f437b9988d5ed03a0e0fbd414f9e353564c27eba324c56e62533e6c121588`, `0x81631a3eb95c41a6429c2be8b948ec2d69bed627c3ca9f7ab551a7988c21cc48`) |
| Auxiliary deploy (Sep 1, tx `0xa61412e1232b2552ced03ce49a89f0f7852579d788884b64fb1cc8b7701daed5`) | `0xf63431df9eaf0c53717cd2c6bb2f2f1ab85ea5b9` | created in the same Sep-1 run; runtime bytecode carries BOTH factory and tenant selector sets — exact role **UNVERIFIED** (likely combined deploy artifact) |

## Deployment timeline (Blockscout, all VERIFIED)

| Date (UTC) | Event |
| --- | --- |
| 2026-08-22/24 | V0 single-tenant treasury era; 8 executions |
| 2026-08-28 21:56 | V1 factory + 2 instances; funding of tenant wallets `0xd1D4…` (A), `0xa3fC…` (B) |
| 2026-09-01 12:22–12:24 | Live-era run: deploy (`0xa61412e1…` → `0xf63431df…`), factory (`0x9e0637f1…`, block 5411764), Tenant A (block 5411765), Tenant B (block 5411766) |
| 2026-09-02/03 | 7 real executions (table above); agent key rotated off `0x2404Ed…` on 09-03 |

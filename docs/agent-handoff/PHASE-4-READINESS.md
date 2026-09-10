# Phase 4 Live Readiness Checkpoint

> **SUPERSEDED SOURCE ASSUMPTION (2026-09-08):** The user selected a Sepolia-only
> testnet build after this checkpoint. All Ethereum-mainnet source steps below are
> historical and must not be executed. Phase 1 is reopened; use
> `SEPOLIA-ONLY-REASSESSMENT.md` and the revised read-only audit.

Date: 2026-09-08
Status: BLOCKED before broadcast; read-only manifest implemented

## Outcome

Added `contracts/script/audit-live-path.js`, a fail-closed, read-only readiness
audit for the frozen Phase 1 V2 market path. It accepts addresses only, never private
keys, never signs, and never broadcasts. It independently verifies actual RPC chain
IDs, pool/factory/token/fee/decimal provenance, bytecode, liquidity, lock state,
oracle cardinality, 300-second `observe` behavior, PenguinSwap router provenance,
Attestcoin chain-key freshness, BlockProver precompile behavior, local deployment
artifacts, and optional account balances. RPC values are not printed, preventing a
credential-bearing endpoint from leaking into logs.

Command:

```bash
cd contracts && node script/audit-live-path.js
```

Exit `0` means all listed preconditions are satisfied. Exit `2` is the expected
blocked state and prints the exact blockers. Exit `1` means the audit itself failed.

## Fresh live evidence

Read at `2026-09-08T08:49:46Z`:

| Property | Observed result | Classification |
| --- | --- | --- |
| Ethereum RPC chain | `1` | VERIFIED |
| Creditcoin RPC chain | `102031` | VERIFIED |
| Source pool provenance | factory/token0/token1/fee match the frozen USDT/WCTC/3000 tuple | VERIFIED |
| Source pool liquidity/unlocked | `190887061704807046`, unlocked | VERIFIED at read block |
| Source pool cardinality | current `1`, next `1` | VERIFIED blocker |
| Source `observe([300,0])` | succeeds despite cardinality 1 | VERIFIED; does not waive the immutable >=16 policy |
| Destination pool provenance | factory/token0/token1/fee match the frozen WCTC/USD-TCoin/500 tuple | VERIFIED |
| Destination pool liquidity/unlocked | `2237366368764625`, unlocked | VERIFIED at read block |
| Destination pool cardinality | current `1`, next `1` | VERIFIED blocker |
| Destination `observe([300,0])` | succeeds despite cardinality 1 | VERIFIED; does not waive the immutable >=16 policy |
| PenguinSwap router | bytecode present; `factory()` matches frozen factory | VERIFIED |
| Attestcoin chain key 3 | Ethereum head `25931561`, latest attestation `25931520`, lag 41; exists/attestation true | VERIFIED at read time |
| BlockProver `0x...0FD2` | rejects `0xdeadbeef` with `Unknown selector` | VERIFIED precompile behavior, not a real proof |
| New deployment artifacts | observer, validator, adapter, factory creation/runtime bytecode present | VERIFIED locally |

Separate balance reads derived the existing gitignored Creditcoin testnet keys
without printing private keys:

- tenant A `0xd1D4020279C86e41FE688A1D7F31f7F8436A1C77`: about `0.499795397` CTC, zero WCTC, zero USD-TCoin;
- tenant B `0xa3fC15a9F8899E10bBe77456e9E6466C274c3a90`: about `0.499817565` CTC, zero WCTC, zero USD-TCoin;
- low-privilege agent `0xB1D19F71d68c4e7065749e8593D338E9A30D654f`: `10000` CTC, zero WCTC, zero USD-TCoin.

These are point-in-time reads, not authorization to reuse any key or transfer funds.

## Exact remaining blockers

1. Source cardinality is 1, below the frozen minimum 16.
2. Destination cardinality is 1, below the frozen minimum 16.
3. No Ethereum-mainnet deployer address/signing authority is configured.
4. No reviewed Creditcoin deployer, tenant owner, and agent address set is supplied
   to the readiness command. Known addresses can be audited by passing address-only
   environment variables.
5. Known tenant wallets have no WCTC or USD-TCoin, so a treasury cannot execute a
   real swap until the funding asset and provenance are resolved.
6. No broadcast script is provided yet. Creating one before the signer, balances,
   exact funding amount, and reviewed transaction targets exist would convert unknowns
   into unsafe defaults.

## Ordered broadcast plan once blockers are resolved

1. Re-run the audit with `ETHEREUM_DEPLOYER_ADDRESS`, `CC_DEPLOYER_ADDRESS`,
   `TENANT_OWNER_ADDRESS`, and `AGENT_ADDRESS` set to reviewed addresses.
2. On chain 1, call the frozen source pool's
   `increaseObservationCardinalityNext(16)`; capture signer, gas estimate, transaction,
   receipt, block, status, and post-state.
3. On chain 102031, make the same call on the frozen destination pool and capture the
   same evidence.
4. Wait for the pools to write enough initialized observations; re-run the audit until
   cardinality is at least 16 and the 300-second observation succeeds on both.
5. Deploy `EthereumV3MarketObserver` on chain 1 with only the frozen tuple.
6. On chain 102031 deploy, in order, `VerifiedMarketFactValidator` (chain key 3,
   max age 64, max gap 12), `PenguinV3Adapter`, and
   `FairWitnessTreasuryFactory`; verify every constructor getter and runtime bytecode.
7. Create one tenant treasury with the checkpoint guardrails, register the reviewed
   low-privilege agent, and fund only the bounded input asset. Exact funding quantity
   remains BLOCKED pending asset acquisition and a quoted minimal test trade.
8. Produce two real observer receipts and Attestcoin proofs, execute one bounded swap,
   and verify receipt status, pool `Swap`, adapter event, treasury journal, balance
   deltas, and exact replay rejection.

No blockchain transaction was sent in this checkpoint. Phase 4 remains IN PROGRESS.

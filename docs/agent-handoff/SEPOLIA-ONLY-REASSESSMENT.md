# Sepolia-Only Source Reassessment

Date: 2026-09-08
Status: PHASE 1 REOPENED — source venue blocked

> **Newest correction (2026-09-08):** Chain-wide NTT event enumeration found an
> exact representation of PenguinSwap WCTC at Sepolia `0x9cE4…4F2d`. Its manager
> `0x84bE…aA41` is bidirectionally peered with Creditcoin manager `0x7f31…B1ECc`,
> whose token is PenguinSwap WCTC `0x5607…329E`. The token is currently unusable:
> zero supply and external-owner minter instead of its burning-mode NTT manager.
> Earlier statements below that no representation exists are superseded; the
> `0xeB32…1E53` rejection remains correct.

## User constraint

The build is testnet-only. The source chain is now fixed to Ethereum Sepolia
(`chainId 11155111`, Attestcoin chain key `1`); Ethereum mainnet and chain key `3`
must not be used by the selected live path. Creditcoin testnet (`chainId 102031`)
remains the destination.

This explicit user decision supersedes the Ethereum-mainnet source portions of
`PHASE-1-FREEZE-V2.md` and decision #23. It does not weaken the requirement for a
real, economically comparable source-market event.

## Fresh read-only evidence

Command:

```bash
cd contracts && node script/audit-live-path.js
```

Observed at `2026-09-08T09:09:55Z`:

- Sepolia RPC returned chain ID `11155111`.
- Creditcoin ChainInfo returned a latest Sepolia attestation at height `11660100`
  while the Sepolia endpoint reported head `11660134` (34-block lag); the result
  existed and was marked an attestation.
- BlockProver `0x0000000000000000000000000000000000000FD2`
  rejected an unknown selector, confirming current precompile dispatch behavior.
- Officially documented Circle Sepolia USDC
  `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` has bytecode and 6 decimals.
- Sepolia address `0xeB32AD88b09fB94129a8B972876Ad02EaAc91E53`
  has verified `PeerToken` source, reports `Wrapped CTC` / `WCTC`, 18 decimals,
  owner `0x30Ab12D7254ee06bc856b30a0524D3e77c89F4C8`, and minter
  `0xe6fE381bd1B4C5EBdf0a83aE39434169eE7b2e78`. The minter is an ERC1967 proxy
  whose live getters report this token, mode `1`, Wormhole chain ID `10002`, and
  threshold `1`. This strongly supports a test NTT deployment, but an official
  Creditcoin source explicitly listing Sepolia for this WCTC address was not found.
  Treat official cross-chain identity as NOT VERIFIED.
- A deeper live NTT check found an explicit Creditcoin peer, but it proves the
  proposed market pairing is wrong rather than validating it. Sepolia manager
  `0xe6fE381bd1B4C5EBdf0a83aE39434169eE7b2e78` reports Wormhole chain ID `10002`
  (Sepolia) and `getPeer(59)` returns Creditcoin manager
  `0x03718cC4A5B02f2127C891B0e6f05A42a7E817F0`. On Creditcoin testnet that manager
  has bytecode, reports chain ID `59`, and its `getPeer(10002)` points back to the
  Sepolia manager. However, its `token()` is
  `0x069F7fD9C1dc4156416ff3d5748ae94e329d6a67`, not PenguinSwap WCTC
  `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`; the peer token's live total supply
  is `0`. This is a verified, bidirectional NTT test deployment for a different
  Creditcoin token and cannot establish economic identity with the selected pool.
  PenguinSwap's factory returned zero for this peer token paired with USD-TCoin at
  fee 100/500/3000/10000, and the live PenguinSwap indexer returned no pools involving
  the peer token at all.
- The official `gluwa/native-token-transfers` main branch was checked read-only and
  contains no deployment record for the Sepolia token, minter, WCTC symbol, or these
  addresses. Wormhole's public SDK documentation describes NTT mechanics but does
  not establish a public Creditcoin-testnet-to-Sepolia route for this deployment.
- Blockscout reports four current WCTC holders. The repository's known agent and
  tenant addresses each have zero Sepolia ETH and zero Sepolia WCTC. No permissionless
  WCTC faucet or authoritative acquisition instructions were verified.
- Sepolia Uniswap V3 factory
  `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` returned the zero address for
  Circle USDC/WCTC at all standard fee tiers: 100, 500, 3000, and 10000.
- The real Sepolia USDC/WETH pools found earlier remain unsuitable: WETH and WCTC
  are different assets, so their prices cannot be compared as one arbitrage pair.
- The Creditcoin PenguinSwap WCTC/USD-TCoin pool remains correctly registered,
  liquid and unlocked, but cardinality/current-next remains `1/1`.
- PenguinSwap WCTC itself was then traced. Verified Solidity shows a plain
  WETH9-style native wrapper with `deposit()` and `withdraw()` and no owner, minter,
  NTT peer, or bridge hook. Live `totalSupply()` equals the contract's native CTC
  balance exactly (`224507489811958139103326995` wei), proving direct native backing.
  Address `0x5607…329E` has no bytecode on Sepolia.
- A same-address scan covered every token in all 130 indexed PenguinSwap pools with
  nonzero-liquidity filtering. Three addresses also had Sepolia code, but all were
  unrelated contracts: runtime hashes differed and ERC-20 metadata calls reverted.
  No common-asset candidate was found.

Primary external references:

- Uniswap official deployments: `https://developers.uniswap.org/deployments`
- Circle official testnet USDC addresses:
  `https://developers.circle.com/stablecoins/usdc-contract-addresses`
- Creditcoin WCTC update (documents Ethereum/Creditcoin/BSC, not Sepolia):
  `https://creditcoin.org/blog/wctc-new/`
- Wormhole chain IDs (10002 Sepolia; 59 CreditCoin):
  `https://wormhole.com/docs/products/reference/chain-ids/`
- Verified Sepolia PeerToken source/state:
  `https://eth-sepolia.blockscout.com/api/v2/smart-contracts/0xeB32AD88b09fB94129a8B972876Ad02EaAc91E53`
- Verified PenguinSwap WCTC source/state:
  `https://creditcoin-testnet.blockscout.com/address/0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`

## Consequences

1. Phase 1 is reopened. The V2 mainnet source freeze is no longer the selected
   architecture.
2. Existing Phase 2–5 code/tests remain useful local work, but source chain key `3`,
   chain ID `1`, mainnet pool constants, mainnet watcher checks, and mainnet readiness
   assumptions are not accepted for the Sepolia-only build.
3. Do not point the system at the active Sepolia USDC/WETH pool: that would compare
   ETH with WCTC and manufacture an arbitrage signal from non-comparable assets.
4. Do not create a Sepolia pool around `0xeB32…1E53` for the current PenguinSwap
   destination: its verified Creditcoin NTT representation is not `0x5607…329E`.
5. Do not describe PenguinSwap WCTC as operationally bridgeable to Sepolia. A
   matching representation is now verified, but it is zero-supply and its NTT
   manager lacks the required minter role.
6. No functional runtime migration or deployment may proceed until the source pool
   and token-access story are frozen with evidence.

## Recommended resolution

The exact representation is now identified as `0x9cE4…4F2d`, but Gluwa-controlled
NTT state must first become operational: the external owner must assign Sepolia
manager `0x84bE…aA41` as token minter, and a real bridge round trip or inbound receipt
must prove mint/unlock behavior. This repository cannot perform that owner-only step.

After activation, acquire the exact linked WCTC through the verified NTT route and
consider a clearly labeled **CONTROLLED TESTNET MARKET** on official Sepolia Uniswap
V3 with Circle USDC. Record who seeded it, exact assets, fee, initial price,
positions, cardinality, liquidity limitations, and why it is not independent or
mainnet-grade liquidity.

Before creating it, verify:

- live NTT minter assignment and a successful exact-token bridge receipt;
- available Sepolia ETH, USDC, and WCTC balances for a dedicated test-only signer;
- official Sepolia NonfungiblePositionManager/router addresses and bytecode;
- chosen fee/tick spacing and initial price encoding;
- a minimal liquidity/funding amount;
- that the resulting pool can fill at least 16 observations and a 300-second history;
- exact deployment/initialization/liquidity transaction manifest.

If Sepolia WCTC cannot be acquired legitimately, Phase 1 remains BLOCKED. Deploying
an arbitrary mock token or substituting WETH would require a new explicit architecture
decision and would materially weaken the market claim.

The acquisition check did not find an authoritative usable path in the official
materials inspected, so the current status is **BLOCKED** pending external token/faucet
or bridge information. This is not evidence that no such path exists; it is evidence
that one is not presently verified.

No blockchain transaction was sent during this reassessment.

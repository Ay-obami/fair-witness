# Schema-v1 Deployment Readiness — 2026-09-09

Status: **BLOCKED — NO BROADCAST**

The check was read-only. It accepted no private key, signed nothing, sent no transaction and changed no chain state.

## Verified live state

- Sepolia chain ID: `11155111`.
- Creditcoin testnet chain ID: `102031`, matching current official Creditcoin documentation.
- Attestcoin ChainInfo returned an existing Sepolia attestation at height `11666530`; Sepolia head was `11666569` (39-block observation lag at `2026-09-09T07:42:43.619Z`).
- The Creditcoin BlockProver at `0x0000000000000000000000000000000000000FD2` exhibited the expected unknown-selector rejection.
- PenguinSwap pool `0x04a3227587a1D2b79f8AFE6F0e361fAbD6EEB6E9` had code, matched its factory/pair/fee, was unlocked, had nonzero liquidity and answered a 300-second observation query.
- Creditcoin WCTC `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E` had 18 decimals and supply equal to native backing at the sampled block.
- The NTT peer link was bidirectional and pointed to the same Creditcoin WCTC used by PenguinSwap.
- Required compiled artifacts existed. Runtime sizes remained 20,954 bytes for `FairWitnessTreasury` and 24,521 bytes for `FairWitnessTreasuryFactory`.

These observations are time-specific and must be repeated immediately before any later deployment.

## Blocking failures

1. Sepolia WCTC `0x9cE462d2B56C385d0B15AEFc74413896AEa34F2d` had total supply `0`.
2. Its configured NTT manager was not the token minter; the current minter was `0x30Ab12D7254ee06bc856b30a0524D3e77c89F4C8`.
3. No Sepolia Uniswap V3 USDC/WCTC pool existed at fee tier 100, 500, 3000 or 10000.
4. The destination PenguinSwap pool observation cardinality was `1`, below the locked minimum `16`.
5. Deployment owner, agent, funding values and numeric mandate have not been reviewed or approved.

## Required resolution

- The external NTT/token owner must activate the Sepolia representation and correctly assign mint authority.
- A comparable Sepolia WCTC/stable market must exist and satisfy identity, liquidity, history and cardinality checks. If controlled liquidity is used, label it controlled and make no natural-arbitrage claim.
- Increase and age the destination pool observation cardinality until the required TWAP history is genuinely available.
- Review owner/agent separation, funding, complete constructor policy and the independently recomputed expected policy hash.
- Re-run `node contracts/script/audit-live-path.js` and require `ready: true`.
- Fill and review `contracts/deployments/schema-v1.candidate.json`; `validate-schema-v1-manifest.js` must return `broadcastReady: true` before a separate broadcast tool may be introduced or invoked.

## Decision

No deployment was attempted. Local contract readiness does not override failed external market and role gates. Existing published addresses remain legacy arbitrage deployments.

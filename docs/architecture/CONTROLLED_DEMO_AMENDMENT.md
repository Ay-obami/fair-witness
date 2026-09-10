# Controlled Demo Market Amendment

Status: **AUTHORIZED — 2026-09-09**

Authorization: the repository owner explicitly selected public controlled markets on Sepolia and Creditcoin testnet, retaining genuine Attestcoin verification.

## Decision

Phase 10 may deploy a dedicated 6-decimal stable demo token and 18-decimal WCTC-like demo token independently on each testnet, then create and seed dedicated V3 pools through the official Sepolia Uniswap and Creditcoin PenguinSwap infrastructure.

The tokens share a documented demo asset identifier only. They are not bridged, redeemable, economically pegged, or asserted to be the same production asset. This exception applies only to the controlled hackathon demonstration and does not weaken Attestcoin proof verification or treasury policy.

Prices must change through swaps against the pools. No caller-supplied price setter may feed the verified path. The Sepolia observer derives its 300-second TWAP from the controlled source pool; Attestcoin proves the observer transactions; the Creditcoin treasury independently reads and executes against the controlled destination pool.

## Mandatory label

> Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.

## Deployment constraints

- use new additive addresses; never mutate legacy instances;
- use dedicated demo tokens and pools, never relabel existing unrelated tokens;
- owner-only minting, fixed initial supply plan, and published seeding/manipulation transactions;
- precompute V3 token ordering: Sepolia observer requires stable as token0 and demo WCTC as token1; Creditcoin adapter requires demo WCTC as token0 and stable as token1;
- raise observation cardinality to at least 16 and age genuine 300-second history on both pools;
- freeze exact factory/router/pool/fee/token addresses in observer and adapter;
- treasury owner and agent submitter remain distinct;
- treasury begins paused and only becomes autonomous after immutable readback and rejection smoke tests;
- every UI, manifest, demo script, screenshot, and presentation uses the mandatory label.

## Rejected interpretations

- “Pegged” does not mean bridged, collateralized, redeemable, or price guaranteed.
- Controlled swaps are not naturally occurring arbitrage.
- Testnet outputs are not profits or evidence of production economics.
- An ordinary API value is not Attestcoin evidence.

Implementation agents MUST NOT broaden this demo-only amendment into a generic token, venue, bridge, or price-setting architecture.

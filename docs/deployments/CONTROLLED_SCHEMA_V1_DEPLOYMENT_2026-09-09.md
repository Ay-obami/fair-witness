# Controlled Schema-v1 Deployment — 2026-09-09

> Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.

## Deployment result

The additive schema-v1 controlled demo is deployed on public Sepolia and Creditcoin testnet. The machine-readable source of truth, including every transaction hash and block, is `contracts/deployments/controlled-demo-schema-v1.json`.

| Component | Network | Address |
|---|---|---|
| fwUSD | Sepolia | `0x83821c38Ed36F8A57E64dcDFf36841Dc3CBcCB71` |
| fwWCTC | Sepolia | `0x91A964711d4013a8eC7Cd98abbDd249d0C80ae3c` |
| controlled pool | Sepolia | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |
| observer | Sepolia | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| fwWCTC | Creditcoin | `0x83821c38Ed36F8A57E64dcDFf36841Dc3CBcCB71` |
| fwUSD | Creditcoin | `0x91A964711d4013a8eC7Cd98abbDd249d0C80ae3c` |
| controlled pool | Creditcoin | `0xC696be12663762324fDb0438c4fd85678bd79e78` |
| fixed adapter | Creditcoin | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Attestcoin validator | Creditcoin | `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5` |
| treasury factory | Creditcoin | `0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd` |
| treasury | Creditcoin | `0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3` |

Both pools use fee 3000, initial human price 1 fwUSD/fwWCTC, full-range liquidity `10^16`, and observation cardinality 16. Tokens have fixed one-million-token supplies and no mint function. Same-looking token addresses across chains result from the same deployer/nonce; they do not establish bridge identity.

## Roles and policy

- Owner: `0xF40003d36567478489BcCF1a1fEd094f87EeC9a5`.
- Registered agent: `0xB1D19F71d68c4e7065749e8593D338E9A30D654f`.
- Current automation mode: `PAUSED`.
- Strategies: arbitrage, rebalancing, risk reduction.
- Universal action cap 100 fwUSD; slippage cap 3%; target WCTC 40% ±5%; maximum WCTC exposure 60%; risk reduction cap 50 fwUSD/action and 200 fwUSD/day.

## Smoke evidence

- Agent registration: `0x3c4e348b86088493654d8b3dcd61dd40d319eec80067d7d7b6f95189b37c7038`.
- Paused rejection, attempt 1: `0x6f75c57e0fa3618d25d0562eeab8c3fdf753467421c0303e0bed111f90751eb1`.
- Genuine observations: `0x1c0e67ad9621ec5d23f061d330e1b7b41d69c66646a97358e1be09dfe42e408f` and `0xf87e562164ca1f23dea01df67b0f907cd36f9e2b25d49f99133a74f43a906cbb`, Sepolia blocks 11667084/11667085.
- Both Attestcoin proofs passed local BlockProver verification.
- Valid risk reduction, attempt 2: `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4`; input `40.000719998560002879 fwWCTC`, output `39.722302 fwUSD`.
- Returned to paused: `0x0c8ee214f7e5690bd8b0e379edb5820c8bff02d849c8f1ce2ad736b9fbf522af`.

Phase 13 completed the remaining controlled public-testnet scenarios:

- Oversized Risk Reduction rejection, attempt 3: `0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc`; proposed 7,000 fwWCTC versus approximately 50 fwWCTC permitted, with protected state unchanged.
- Controlled Arbitrage execution, attempt 4: `0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39`; net edge 1,234 bps, exact input 100 fwUSD, output 99.500827701813270733 fwWCTC.
- Controlled Rebalancing execution, attempt 5: `0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f`; verified WCTC allocation 54.99% against a 40% target, exact input 87.014480949919685634 fwWCTC, output 87.037602 fwUSD.
- Source market reset to the declared 1.00 spot baseline: `0x63856acac8456d15fe4469fc9638d8638c0c70fa777d7d8fdb28ddd670077609`; approval cleared.
- Public request `0302054a-aa7e-466d-bc59-77733440a75d` produced Arbitrage attempt 6: observations `0xd5680a9b2c494475db5aba166ff633db119872d3bc3c8b46dd5144739bb5277f` / `0x0c7014cfd31562709f025710aea3ab7cda8d3796d351732b6764de222f955946`, execution `0xe9ea7fa5b420bbc310c6d1b1f7eed24e9a0df025cfda3ced47447b582ab7752a`, exact input 100 fwUSD, output 99.249569462321594722 fwWCTC, and deterministic net edge 1,205 bps.
- Attempt 6 returned to paused in `0xb04757e216e8a249d3f204de3b2c308d46f03afe81449c49eaf712eb58368fc7`; the source market reset to 1.00 in `0x421c286efb1a576bc98c39420089c9792e4eb1f41d638a79ca5b433156e476ff`, with both temporary allowances cleared.
- Latest readback after the 2026-09-10 public-request rehearsal: paused, 6 attempts, 4 executions.

Gemini selected `REBALANCE` and `EXECUTE` for attempt 5 but its rationale incorrectly described arbitrage. This is retained as evidence that AI prose is untrusted: the treasury ignored it and independently authorized only the deterministic rebalancing terms.

For attempt 6, Gemini described the controlled edge using profitability language. That wording is not an economic claim: the tokens are valueless and controlled, while the deterministic policy independently authorized only the bounded testnet action.

## Limitations

This proves mechanics and security boundaries, not natural arbitrage or economic profitability. The paired assets are independently issued test tokens, not bridged or redeemable. Public testnet RPC/proof-builder latency is variable. Schema-v1 source verification and hosted fresh-browser rehearsal completed on 2026-09-10. Live Supabase audit projection remains pending; the independent public demo-request queue is operational.

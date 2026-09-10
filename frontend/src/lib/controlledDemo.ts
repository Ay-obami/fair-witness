export const CONTROLLED_DEMO_LABEL = "Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability."

export const CONTROLLED_DEMO = {
  source: { chainId: 11155111, pool: "0xB88deB0436eAD37A6Dd625e9140AE45D5024424f", observer: "0x9bAF94da27d5C71c42b40D25b43070083DE7296E", stable: "0x83821c38Ed36F8A57E64dcDFf36841Dc3CBcCB71", wctc: "0x91A964711d4013a8eC7Cd98abbDd249d0C80ae3c" },
  destination: { chainId: 102031, pool: "0xC696be12663762324fDb0438c4fd85678bd79e78", wctc: "0x83821c38Ed36F8A57E64dcDFf36841Dc3CBcCB71", stable: "0x91A964711d4013a8eC7Cd98abbDd249d0C80ae3c", adapter: "0x9bAF94da27d5C71c42b40D25b43070083DE7296E", validator: "0x13Dd030815550080Ef80Ff3499fAE8d971A119f5", factory: "0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd", treasury: "0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3" },
  owner: "0xF40003d36567478489BcCF1a1fEd094f87EeC9a5",
  agent: "0xB1D19F71d68c4e7065749e8593D338E9A30D654f",
  riskSmoke: { sourceObservation: "0x1c0e67ad9621ec5d23f061d330e1b7b41d69c66646a97358e1be09dfe42e408f", confirmationObservation: "0xf87e562164ca1f23dea01df67b0f907cd36f9e2b25d49f99133a74f43a906cbb", execution: "0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4", rejection: "0x6f75c57e0fa3618d25d0562eeab8c3fdf753467421c0303e0bed111f90751eb1" },
  arbitrageSmoke: { sourceObservation: "0x382cc3afc4c2b2bf06216eceb7853046d5c95a7139ceaf1e2902a4f692aa7ed1", confirmationObservation: "0x01bf0f9cbf41494ab87beadb3344d4a3fccde0eb012744e608d47ee6302121bf", execution: "0xf023d109ca5e021f933a47aceffafcdcde41797c93fe3186c6c2c6fb4bb62a39" },
  rebalanceSmoke: { sourceObservation: "0x720cd355a9af65e59afecbc54693b95e6dea175924fb318cc0046511a1adf4c5", confirmationObservation: "0xc00761f989abc4256dbfddd30a273d390cfa18dbef273565e23f524d4532d011", execution: "0x776b2e1e2f43625352b8ad2e8f76d67871d082f3b18c1d57cf92be06c6d3dd3f" },
  publicRequestSmoke: { requestId: "0302054a-aa7e-466d-bc59-77733440a75d", strategy: "ARBITRAGE", execution: "0xe9ea7fa5b420bbc310c6d1b1f7eed24e9a0df025cfda3ced47447b582ab7752a", attemptId: 6 },
  oversizedRiskRejection: "0x2fe2274948f467da43fe0ec5f13bc2e80ba01c02fd64d47f03ff2fb296358bdc",
} as const

export const sepoliaTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`
export const creditcoinTx = (hash: string) => `https://creditcoin-testnet.blockscout.com/tx/${hash}`

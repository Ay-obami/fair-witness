import { createThirdwebClient, defineChain } from "thirdweb";
import { inAppWallet } from "thirdweb/wallets";

// Creditcoin testnet (CC3) — the live chain where the factory and all treasury
// instances are deployed. Chain ID confirmed from deploy-factory.js and
// the DEVLOG Session 8 deployed-addresses table (chainId 102031).
export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "Creditcoin Testnet (CC3)",
  nativeCurrency: {
    name: "Testnet Credit",
    symbol: "CTC",
    decimals: 18,
  },
  rpc: ["https://rpc.cc3-testnet.creditcoin.network"],
  blockExplorers: [
    {
      name: "Creditcoin Testnet Explorer (Blockscout)",
      url: "https://creditcoin-testnet.blockscout.com",
    },
  ],
  testnet: true,
});

// Non-custodial embedded wallet — email/social sign-up creates an invisible
// wallet; no seed phrase exposed, no MetaMask required. The client ID is public.
export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID ?? "",
});

export const wallet = inAppWallet({
  client: thirdwebClient,
  authFlow: "standard",
});

export { thirdwebClient as client };


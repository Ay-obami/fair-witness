import { createThirdwebClient, defineChain } from "thirdweb";
import { inAppWallet } from "thirdweb/wallets";

export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "Creditcoin Testnet (CC3)",
  nativeCurrency: { name: "Testnet Credit", symbol: "CTC", decimals: 18 },
  rpc: "https://rpc.cc3-testnet.creditcoin.network",
  blockExplorers: [{ name: "Creditcoin Testnet Explorer (Blockscout)", url: "https://creditcoin-testnet.blockscout.com" }],
  testnet: true,
});

const configuredClientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
export const thirdwebConfigured = Boolean(configuredClientId);
export const thirdwebClient = createThirdwebClient({
  clientId: configuredClientId || "fair-witness-unconfigured-client",
});

// Creditcoin CC3 does not currently expose the default Thirdweb ERC-4337 factory
// expected by the SDK, so social authentication stays on the user's in-app EOA.
// Fair Witness sponsors onboarding gas from its backend without taking ownership:
// every treasury/activation transaction is still signed by this user-controlled EOA.
export const wallet = inAppWallet({
  auth: {
    mode: "popup",
    options: ["google", "apple", "email"],
  },
  executionMode: { mode: "EOA" },
  metadata: { name: "Fair Witness" },
});

export { thirdwebClient as client };

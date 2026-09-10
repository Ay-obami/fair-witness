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

// A missing public client id must never take down the read-only landing page.
// Routes that need authentication check `thirdwebConfigured` before making calls.
const configuredClientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
export const thirdwebConfigured = Boolean(configuredClientId);
export const thirdwebClient = createThirdwebClient({
  // Non-empty inert fallback prevents Thirdweb from throwing at module-import time.
  // It is never used for auth because SignUp gates on thirdwebConfigured.
  clientId: configuredClientId || "fair-witness-unconfigured-client",
});

// The authenticated account is a Thirdweb smart account owned by the user's in-app
// wallet. Thirdweb's paymaster sponsors its transactions, so a new user does not
// need CC3 CTC merely to deploy/activate a Fair Witness treasury.
export const wallet = inAppWallet({
  auth: {
    mode: "popup",
    options: ["google", "apple", "email"],
  },
  smartAccount: {
    chain: creditcoinTestnet,
    sponsorGas: true,
  },
  metadata: {
    name: "Fair Witness",
  },
});

export { thirdwebClient as client };

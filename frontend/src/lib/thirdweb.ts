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

export const wallet = inAppWallet({ executionMode: { mode: "EOA" } });
export { thirdwebClient as client };

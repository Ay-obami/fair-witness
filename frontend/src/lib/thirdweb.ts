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
  // NOTE: thirdweb v5.121 expects a single rpc string here (not an array).
  rpc: "https://rpc.cc3-testnet.creditcoin.network",
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

// Email-OTP auth is driven per-route via preAuthenticate + wallet.connect (see
// routes/SignUp.tsx, routes/Dashboard.tsx). inAppWallet() takes no client — the
// client is passed to each connect/preAuthenticate call (thirdweb v5.121 API).
// executionMode "EOA" is explicit: the embedded wallet must be a plain EOA so it
// can own treasury instances and sign createTreasury directly (no 4337 bundler —
// CC3 isn't on thirdweb's account-abstraction allowlist).
export const wallet = inAppWallet({ executionMode: { mode: "EOA" } });

export { thirdwebClient as client };


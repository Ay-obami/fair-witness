import { useMemo, useState } from "react";
import { Layout } from "../components/layout";
import { useLocation, useNavigate } from "react-router-dom";
import { preAuthenticate } from "thirdweb/wallets/in-app";
import { ethers } from "ethers";
import { creditcoinTestnet, wallet, thirdwebClient, thirdwebConfigured } from "../lib/thirdweb";
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice";
import { humanError } from "../lib/humanError";
import { useAuthSession } from "../lib/authSession";
import { config } from "../lib/config";
import { FAIR_WITNESS_FACTORY_ABI } from "../lib/abi";

const ONBOARDING_KEY = "fair-witness:onboarding";
const DEFAULT_FACTORY_DEPLOYMENT_BLOCK = 5_456_821;
const LOG_CHUNK_SIZE = 25_000;
type SocialStrategy = "google" | "apple";

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const forceNew = useMemo(() => new URLSearchParams(location.search).get("intent") === "new", [location.search]);
  const { setSessionAccount } = useAuthSession();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findExistingTreasury(owner: string): Promise<string | null> {
    const provider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
    const factory = new ethers.Contract(config.factoryAddress, FAIR_WITNESS_FACTORY_ABI, provider);
    const latest = await provider.getBlockNumber();
    const configured = Number(import.meta.env.VITE_FACTORY_DEPLOYMENT_BLOCK ?? DEFAULT_FACTORY_DEPLOYMENT_BLOCK);
    const first = Math.min(Number.isFinite(configured) ? configured : DEFAULT_FACTORY_DEPLOYMENT_BLOCK, latest);
    const filter = factory.filters.TreasuryCreated(null, owner, null);
    let newest: { address: string; block: number } | null = null;

    for (let from = first; from <= latest; from += LOG_CHUNK_SIZE) {
      const events = await factory.queryFilter(filter, from, Math.min(latest, from + LOG_CHUNK_SIZE - 1));
      for (const event of events) {
        if (!(event instanceof ethers.EventLog)) continue;
        const address = ethers.getAddress(event.args.treasury);
        if (!newest || event.blockNumber > newest.block) newest = { address, block: event.blockNumber };
      }
    }
    return newest?.address ?? null;
  }

  async function completeAuthentication(walletAddress: string, authMethod: string, identity = "") {
    if (!forceNew) {
      const existing = await findExistingTreasury(walletAddress);
      if (existing) {
        navigate(`/dashboard?treasury=${existing}`, { replace: true });
        return;
      }
    }

    sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify({ email: identity, walletAddress, authMethod }));
    navigate("/mandate", { replace: true });
  }

  async function socialLogin(strategy: SocialStrategy) {
    if (!thirdwebConfigured) return setError("Embedded-wallet signup is not configured on this deployment. Add VITE_THIRDWEB_CLIENT_ID and redeploy.");
    setBusy(true); setError(null);
    try {
      const account = await wallet.connect({ client: thirdwebClient, chain: creditcoinTestnet, strategy });
      setSessionAccount(account);
      await completeAuthentication(account.address, strategy);
    } catch (err) {
      setError(humanError(err, `${strategy === "google" ? "Google" : "Apple"} sign-in could not be completed.`));
    } finally { setBusy(false); }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!thirdwebConfigured) return setError("Embedded-wallet signup is not configured on this deployment. Add VITE_THIRDWEB_CLIENT_ID and redeploy.");
    if (!email.includes("@")) return setError("Enter a valid email address.");
    setBusy(true); setError(null);
    try {
      await preAuthenticate({ client: thirdwebClient, strategy: "email", email });
      setStep("otp");
    } catch (err) {
      setError(humanError(err, "We could not send the verification code."));
    } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!thirdwebConfigured) return setError("Embedded-wallet signup is not configured on this deployment.");
    setBusy(true); setError(null);
    try {
      const account = await wallet.connect({ client: thirdwebClient, chain: creditcoinTestnet, strategy: "email", email, verificationCode: otp });
      setSessionAccount(account);
      await completeAuthentication(account.address, "email", email);
    } catch (err) {
      setError(humanError(err, "The verification code could not be confirmed."));
    } finally { setBusy(false); }
  }

  return <Layout><main className="mx-auto max-w-2xl px-6 py-16">
    <p className="text-xs uppercase tracking-widest text-copper-400">{forceNew ? "New treasury" : "Access Fair Witness"}</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">{forceNew ? "Create another treasury" : "Sign in to Fair Witness"}</h1>
    <p className="mt-3 text-sm leading-relaxed text-ledger-400">{forceNew
      ? "Authenticate with the identity that will own the new treasury. Your existing treasuries remain unchanged."
      : "Sign in with the same Google, Apple, or email identity you used before. If that wallet already owns a Fair Witness treasury, you will go straight to your dashboard instead of creating another one."}</p>
    <div className="mt-5"><SecurityBoundaryNotice /></div>
    <p className="mt-5 rounded border border-copper-700/40 bg-copper-500/5 p-3 text-sm text-ledger-300">Fair Witness sponsors onboarding transactions on Creditcoin testnet, so you do not need testnet CTC to create and activate a treasury.</p>
    {!thirdwebConfigured && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">Authentication is disabled until the public VITE_THIRDWEB_CLIENT_ID is configured. Read-only product and evidence pages remain available.</p>}
    {error && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}

    {step === "email" ? <>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy || !thirdwebConfigured} onClick={()=>void socialLogin("google")} className="rounded border border-ledger-600 bg-ledger-900 px-5 py-3 font-semibold text-ledger-100 hover:border-copper-500 disabled:opacity-50">Continue with Google</button>
        <button type="button" disabled={busy || !thirdwebConfigured} onClick={()=>void socialLogin("apple")} className="rounded border border-ledger-600 bg-ledger-900 px-5 py-3 font-semibold text-ledger-100 hover:border-copper-500 disabled:opacity-50">Continue with Apple</button>
      </div>
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-ledger-600"><span className="h-px flex-1 bg-ledger-800"/><span>or email</span><span className="h-px flex-1 bg-ledger-800"/></div>
      <form onSubmit={start}>
        <label className="block text-xs text-ledger-400">Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded border border-ledger-700 bg-ledger-900 px-4 py-3 text-ledger-100" placeholder="you@example.com" required /></label>
        <button disabled={busy || !thirdwebConfigured} className="mt-4 w-full rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Connecting…" : forceNew ? "Continue to new treasury" : "Continue with email"}</button>
      </form>
    </> : <form onSubmit={verify} className="mt-8">
      <p className="text-sm text-ledger-400">Enter the one-time code sent to <span className="text-ledger-200">{email}</span>.</p>
      <input value={otp} onChange={e=>setOtp(e.target.value)} className="mt-4 w-full rounded border border-ledger-700 bg-ledger-900 px-4 py-3 text-ledger-100" placeholder="Verification code" required autoFocus />
      <button disabled={busy} className="mt-4 w-full rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Verifying…" : forceNew ? "Verify & configure new treasury" : "Verify & continue"}</button>
      <button type="button" onClick={()=>void preAuthenticate({client:thirdwebClient,strategy:"email",email})} className="mt-4 text-xs text-ledger-400 hover:text-copper-400">Resend code</button>
    </form>}
  </main></Layout>;
}

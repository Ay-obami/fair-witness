import { useEffect, useMemo, useState } from "react";
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
const DEFAULT_FACTORY_DEPLOYMENT_BLOCK = 5_465_730;
const LOG_CHUNK_SIZE = 25_000;
type SocialStrategy = "google" | "apple";

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const forceNew = useMemo(() => new URLSearchParams(location.search).get("intent") === "new", [location.search]);
  const { account, resolving, setSessionAccount } = useAuthSession();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resolving || !account) return;
    if (forceNew) {
      const existing = sessionStorage.getItem(ONBOARDING_KEY);
      if (!existing) sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify({ walletAddress: account.address, authMethod: "session" }));
      navigate("/mandate", { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [account, forceNew, navigate, resolving]);

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
      const connectedAccount = await wallet.connect({ client: thirdwebClient, chain: creditcoinTestnet, strategy });
      setSessionAccount(connectedAccount);
      await completeAuthentication(connectedAccount.address, strategy);
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
      const connectedAccount = await wallet.connect({ client: thirdwebClient, chain: creditcoinTestnet, strategy: "email", email, verificationCode: otp });
      setSessionAccount(connectedAccount);
      await completeAuthentication(connectedAccount.address, "email", email);
    } catch (err) {
      setError(humanError(err, "The verification code could not be confirmed."));
    } finally { setBusy(false); }
  }

  if (resolving || account) {
    return <Layout><main className="mx-auto max-w-2xl px-4 py-16 sm:px-6"><div className="rounded-2xl border border-ledger-700 bg-ledger-900 p-6 text-center"><p className="text-sm text-ledger-300">{account ? (forceNew ? "Opening the mandate builder…" : "Opening your dashboard…") : "Restoring your session…"}</p></div></main></Layout>;
  }

  return <Layout><main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
    <p className="text-xs uppercase tracking-widest text-copper-400">{forceNew ? "New treasury" : "Access Fair Witness"}</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100 sm:text-4xl">{forceNew ? "Create another treasury" : "Sign in to Fair Witness"}</h1>
    <p className="mt-3 text-sm leading-relaxed text-ledger-400">{forceNew
      ? "Sign in once with the Fair Witness account that should own this treasury. If your session is already active, you will skip this screen automatically."
      : "Sign in with the same Google, Apple, or email identity you used before. If that account already owns a Fair Witness treasury, you will go straight to your dashboard instead of creating another one."}</p>
    <div className="mt-5"><SecurityBoundaryNotice /></div>
    <p className="mt-5 rounded-xl border border-copper-700/40 bg-copper-500/5 p-3 text-sm text-ledger-300">Fair Witness sponsors onboarding transactions on Creditcoin testnet, so you do not need testnet CTC to create and activate a treasury.</p>
    {!thirdwebConfigured && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">Authentication is disabled until the public VITE_THIRDWEB_CLIENT_ID is configured. Read-only product and evidence pages remain available.</p>}
    {error && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}

    {step === "email" ? <>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy || !thirdwebConfigured} onClick={()=>void socialLogin("google")} className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-ledger-600 bg-ledger-900 px-5 py-3 font-semibold text-ledger-100 transition hover:border-copper-500 hover:bg-ledger-800 disabled:cursor-not-allowed disabled:opacity-50"><GoogleIcon />Continue with Google</button>
        <button type="button" disabled={busy || !thirdwebConfigured} onClick={()=>void socialLogin("apple")} className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-ledger-600 bg-ledger-900 px-5 py-3 font-semibold text-ledger-100 transition hover:border-copper-500 hover:bg-ledger-800 disabled:cursor-not-allowed disabled:opacity-50"><AppleIcon />Continue with Apple</button>
      </div>
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-ledger-600"><span className="h-px flex-1 bg-ledger-800"/><span>or email</span><span className="h-px flex-1 bg-ledger-800"/></div>
      <form onSubmit={start}>
        <label className="block text-xs text-ledger-400">Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-ledger-700 bg-ledger-900 px-4 py-3 text-base text-ledger-100 outline-none transition focus:border-copper-500" placeholder="you@example.com" required /></label>
        <button disabled={busy || !thirdwebConfigured} className="mt-4 w-full cursor-pointer rounded-xl bg-copper-500 px-5 py-3 font-semibold text-ledger-950 transition hover:bg-copper-400 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Connecting…" : forceNew ? "Continue to new treasury" : "Continue with email"}</button>
      </form>
    </> : <form onSubmit={verify} className="mt-8">
      <p className="text-sm text-ledger-400">Enter the one-time code sent to <span className="text-ledger-200">{email}</span>.</p>
      <input value={otp} onChange={e=>setOtp(e.target.value)} className="mt-4 w-full rounded-xl border border-ledger-700 bg-ledger-900 px-4 py-3 text-base text-ledger-100 outline-none transition focus:border-copper-500" placeholder="Verification code" required autoFocus />
      <button disabled={busy} className="mt-4 w-full cursor-pointer rounded-xl bg-copper-500 px-5 py-3 font-semibold text-ledger-950 transition hover:bg-copper-400 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Verifying…" : forceNew ? "Verify & configure new treasury" : "Verify & continue"}</button>
      <button type="button" onClick={()=>void preAuthenticate({client:thirdwebClient,strategy:"email",email})} className="mt-4 cursor-pointer text-xs text-ledger-400 hover:text-copper-400">Resend code</button>
    </form>}
  </main></Layout>;
}

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0"><path fill="currentColor" d="M21.35 12.25c0-.74-.06-1.29-.2-1.86H12v3.5h5.37a4.63 4.63 0 0 1-1.99 2.95v2.27h3.22c1.89-1.74 2.75-4.3 2.75-6.86Z"/><path fill="currentColor" opacity=".82" d="M12 21.75c2.62 0 4.82-.87 6.43-2.36l-3.22-2.49c-.89.6-2.03.96-3.21.96-2.51 0-4.64-1.7-5.4-3.98H3.27v2.57A9.72 9.72 0 0 0 12 21.75Z"/><path fill="currentColor" opacity=".62" d="M6.6 13.88A5.86 5.86 0 0 1 6.3 12c0-.65.11-1.28.3-1.88V7.55H3.27A9.72 9.72 0 0 0 2.25 12c0 1.57.38 3.06 1.02 4.45l3.33-2.57Z"/><path fill="currentColor" opacity=".42" d="M12 6.14c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.82 3.24 14.62 2.25 12 2.25a9.72 9.72 0 0 0-8.73 5.3l3.33 2.57c.76-2.28 2.89-3.98 5.4-3.98Z"/></svg>;
}

function AppleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current"><path d="M16.7 12.9c0-2.35 1.92-3.48 2.01-3.54a4.32 4.32 0 0 0-3.4-1.84c-1.43-.15-2.82.86-3.55.86-.74 0-1.86-.84-3.07-.81a4.5 4.5 0 0 0-3.78 2.31c-1.65 2.85-.42 7.04 1.16 9.34.79 1.13 1.7 2.39 2.91 2.34 1.18-.05 1.62-.75 3.05-.75 1.42 0 1.83.75 3.06.72 1.27-.02 2.07-1.13 2.83-2.27a9.28 9.28 0 0 0 1.3-2.65 4.1 4.1 0 0 1-2.52-3.71Zm-2.32-6.9a4.18 4.18 0 0 0 .96-3 4.27 4.27 0 0 0-2.76 1.43 3.99 3.99 0 0 0-.99 2.89A3.53 3.53 0 0 0 14.38 6Z"/></svg>;
}

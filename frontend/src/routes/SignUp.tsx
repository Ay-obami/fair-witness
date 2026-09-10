import { useState } from "react";
import { Layout } from "../components/layout";
import { useNavigate } from "react-router-dom";
import { preAuthenticate } from "thirdweb/wallets/in-app";
import { creditcoinTestnet, wallet, thirdwebClient, thirdwebConfigured } from "../lib/thirdweb";
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice";
import { humanError } from "../lib/humanError";

const ONBOARDING_KEY = "fair-witness:onboarding";

type SocialStrategy = "google" | "apple";

export default function SignUp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function completeOnboarding(walletAddress: string, authMethod: string, identity = "") {
    sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify({ email: identity, walletAddress, authMethod }));
    navigate("/mandate");
  }

  async function socialLogin(strategy: SocialStrategy) {
    if (!thirdwebConfigured) return setError("Embedded-wallet signup is not configured on this deployment. Add VITE_THIRDWEB_CLIENT_ID and redeploy.");
    setBusy(true); setError(null);
    try {
      const account = await wallet.connect({ client: thirdwebClient, chain: creditcoinTestnet, strategy });
      completeOnboarding(account.address, strategy);
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
      completeOnboarding(account.address, "email", email);
    } catch (err) {
      setError(humanError(err, "The verification code could not be confirmed."));
    } finally { setBusy(false); }
  }

  return <Layout><main className="mx-auto max-w-2xl px-6 py-16">
    <p className="text-xs uppercase tracking-widest text-copper-400">Launch Fair Witness</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Create your non-custodial account</h1>
    <p className="mt-3 text-sm leading-relaxed text-ledger-400">Sign in with Google, Apple, or email. Your authenticated wallet controls your dedicated schema-v1 Fair Witness treasury; the AI never controls the wallet or treasury.</p>
    <div className="mt-5"><SecurityBoundaryNotice /></div>
    <p className="mt-5 rounded border border-copper-700/40 bg-copper-500/5 p-3 text-sm text-ledger-300">Fair Witness sponsors onboarding transactions on Creditcoin testnet, so you do not need testnet CTC just to create and activate your treasury.</p>
    {!thirdwebConfigured && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">Signup is disabled until the public VITE_THIRDWEB_CLIENT_ID is configured. Read-only product and evidence pages remain available.</p>}
    {error && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}

    {step === "email" ? <>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy || !thirdwebConfigured} onClick={()=>void socialLogin("google")} className="rounded border border-ledger-600 bg-ledger-900 px-5 py-3 font-semibold text-ledger-100 hover:border-copper-500 disabled:opacity-50">Continue with Google</button>
        <button type="button" disabled={busy || !thirdwebConfigured} onClick={()=>void socialLogin("apple")} className="rounded border border-ledger-600 bg-ledger-900 px-5 py-3 font-semibold text-ledger-100 hover:border-copper-500 disabled:opacity-50">Continue with Apple</button>
      </div>
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-ledger-600"><span className="h-px flex-1 bg-ledger-800"/><span>or email</span><span className="h-px flex-1 bg-ledger-800"/></div>
      <form onSubmit={start}>
        <label className="block text-xs text-ledger-400">Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded border border-ledger-700 bg-ledger-900 px-4 py-3 text-ledger-100" placeholder="you@example.com" required /></label>
        <button disabled={busy || !thirdwebConfigured} className="mt-4 w-full rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Connecting…" : "Continue with email"}</button>
      </form>
    </> : <form onSubmit={verify} className="mt-8">
      <p className="text-sm text-ledger-400">Enter the one-time code sent to <span className="text-ledger-200">{email}</span>.</p>
      <input value={otp} onChange={e=>setOtp(e.target.value)} className="mt-4 w-full rounded border border-ledger-700 bg-ledger-900 px-4 py-3 text-ledger-100" placeholder="Verification code" required autoFocus />
      <button disabled={busy} className="mt-4 w-full rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Verifying…" : "Verify & configure mandate"}</button>
      <button type="button" onClick={()=>void preAuthenticate({client:thirdwebClient,strategy:"email",email})} className="mt-4 text-xs text-ledger-400 hover:text-copper-400">Resend code</button>
    </form>}
  </main></Layout>;
}

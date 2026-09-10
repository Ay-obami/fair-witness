import { useState } from "react";
import { Layout } from "../components/layout";
import { useNavigate } from "react-router-dom";
import { preAuthenticate } from "thirdweb/wallets/in-app";
import { creditcoinTestnet, wallet, thirdwebClient } from "../lib/thirdweb";
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice";

const ONBOARDING_KEY = "fair-witness:onboarding";

export default function SignUp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return setError("Enter a valid email address.");
    setBusy(true); setError(null);
    try {
      await preAuthenticate({ client: thirdwebClient, strategy: "email", email });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const account = await wallet.connect({ client: thirdwebClient, chain: creditcoinTestnet, strategy: "email", email, verificationCode: otp });
      sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify({ email, walletAddress: account.address }));
      navigate("/mandate");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return <Layout><main className="mx-auto max-w-2xl px-6 py-16">
    <p className="text-xs uppercase tracking-widest text-copper-400">Launch Fair Witness</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Create your non-custodial account</h1>
    <p className="mt-3 text-sm leading-relaxed text-ledger-400">Your embedded wallet becomes the owner of a dedicated schema-v1 Fair Witness treasury. The AI never controls this wallet or the treasury.</p>
    <div className="mt-5"><SecurityBoundaryNotice /></div>
    {error && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
    {step === "email" ? <form onSubmit={start} className="mt-8">
      <label className="block text-xs text-ledger-400">Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded border border-ledger-700 bg-ledger-900 px-4 py-3 text-ledger-100" placeholder="you@example.com" required /></label>
      <button disabled={busy} className="mt-4 w-full rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Sending code…" : "Continue"}</button>
    </form> : <form onSubmit={verify} className="mt-8">
      <p className="text-sm text-ledger-400">Enter the one-time code sent to <span className="text-ledger-200">{email}</span>.</p>
      <input value={otp} onChange={e=>setOtp(e.target.value)} className="mt-4 w-full rounded border border-ledger-700 bg-ledger-900 px-4 py-3 text-ledger-100" placeholder="Verification code" required autoFocus />
      <button disabled={busy} className="mt-4 w-full rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Verifying…" : "Verify & configure mandate"}</button>
      <button type="button" onClick={()=>void preAuthenticate({client:thirdwebClient,strategy:"email",email})} className="mt-4 text-xs text-ledger-400 hover:text-copper-400">Resend code</button>
    </form>}
  </main></Layout>;
}

// Sign-up flow — Thirdweb embedded wallet + factory.deployed treasury creation.
// Non-custodial: the embedded wallet signs the createTreasury tx with the user's
// chosen guardrails baked in. The user's wallet == the instance owner.
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ethers } from "ethers";
import { creditcoinTestnet, wallet, client as thirdwebClient } from "../lib/thirdweb";
import { config } from "../lib/config";
import { FACTORY_ABI } from "../lib/abi";
import type { GuardrailsInput } from "../lib/types";
import { getUserEmail, preAuthenticate } from "thirdweb/wallets/in-app";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { saveInstanceMapping } from "../lib/instanceStore";

export default function SignUp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "guardrails" | "otp" | "deploying">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardrails, setGuardrails] = useState<GuardrailsInput>({
    maxTradeSize: "5",
    maxSlippageBps: "150",
    minArbWidthBps: "80",
    maxDriftBps: "100",
    maxConfirmGapBlocks: "20",
    maxActionsPerEpoch: "6",
    epochLength: "86400",
  });

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setSendingCode(true);
    try {
      // Email the one-time code now, so it lands while the user picks guardrails.
      await preAuthenticate({ client: thirdwebClient, strategy: "email", email });
      setStep("guardrails");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingCode(false);
    }
  }

  function handleGuardrailsContinue() {
    setError(null);
    setStep("otp");
  }

  async function handleVerifyAndDeploy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("deploying");
    try {
      // 1. Embedded wallet: verify the emailed code. Non-custodial, email-based,
      //    no seed phrase — the same email always resolves to the same wallet.
      const account = await wallet.connect({
        client: thirdwebClient,
        chain: creditcoinTestnet,
        strategy: "email",
        email,
        verificationCode: otp,
      });
      const userAddress = account.address;

      // 2. Deploy treasury with chosen guardrails — the user's wallet signs,
      //    the factory is permissionless, guardrails become immutable.
      //    (thirdweb v5.121 removed wallet.getEthersProvider — the ethers6
      //    adapter bridges the thirdweb account to an ethers v6 signer.)
      const signer = await ethers6Adapter.signer.toEthers({
        client: thirdwebClient,
        chain: creditcoinTestnet,
        account,
      });

      const factoryAddr = config.factoryAddress;
      if (!factoryAddr) throw new Error("Factory address not configured (VITE_FACTORY_ADDRESS)");

      const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, signer);
      const gt = (v: string) => BigInt(Math.round(Number(v) * 1_000_000));
      const gti = (v: string) => BigInt(Math.round(Number(v)));

      const tx = await factory.createTreasury(userAddress, [
        gt(guardrails.maxTradeSize),
        gti(guardrails.maxSlippageBps),
        gti(guardrails.minArbWidthBps),
        gti(guardrails.maxDriftBps),
        gti(guardrails.maxConfirmGapBlocks),
        gti(guardrails.maxActionsPerEpoch),
        gti(guardrails.epochLength),
      ], { gasLimit: 500_000 });

      const receipt = await tx.wait();
      const deployed = receipt.logs
        .map((l: any) => {
          try {
            const parsed = factory.interface.parseLog(l);
            if (parsed?.name === "TreasuryDeployed") return parsed.args?.treasury;
          } catch { /* not our event */ }
          return null;
        })
        .filter(Boolean)[0];

      if (!deployed) throw new Error("TreasuryDeployed event not found in receipt.");
      const addr = ethers.getAddress(deployed);

      // Stage 4c: persist the email/wallet↔instance mapping so the dashboard's "Your
      // instances" can list it. Fire-and-forget: if Supabase is unconfigured or the
      // save fails, the sign-up flow must still succeed (on-chain deployment is the
      // source of truth; the mapping is a convenience index).
      try {
        const signupEmail = await getUserEmail({ client: thirdwebClient });
        await saveInstanceMapping({
          email: signupEmail ?? email,
          walletAddress: userAddress,
          instanceAddress: addr,
        });
      } catch {
        /* mapping is best-effort — never block deployment success on it */
      }

      navigate(`/signup/done?address=${addr}`);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
      setStep("otp"); // back to code entry — the guardrails input is preserved
    }
  }

  function handleChange(field: keyof GuardrailsInput, value: string) {
    setGuardrails({ ...guardrails, [field]: value });
  }

  // --- Step 1: Email ---
  if (step === "email") {
    return (
      <div className="min-h-screen bg-ledger-950">
        <nav className="border-b border-ledger-800">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
            <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
          </div>
        </nav>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-3xl font-bold text-ledger-100">Create your account</h1>
          <p className="mt-3 text-sm leading-relaxed text-ledger-400">
            Enter your email to create a non-custodial embedded wallet. No seed phrase, no
            MetaMask — your wallet is created invisibly and only you can sign with it.
          </p>
          {error && <p className="mt-4 text-sm text-alert-400">{error}</p>}
          <form onSubmit={handleEmailSubmit} className="mt-6">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-ledger-700 bg-ledger-900 px-4 py-3 text-sm text-ledger-100 placeholder-ledger-500 focus:border-verified-500/50 focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={sendingCode}
              className="mt-4 w-full rounded-md bg-verified-500 px-6 py-3 text-sm font-semibold text-ledger-950 hover:bg-verified-400 transition disabled:opacity-50"
            >
              {sendingCode ? "Sending code…" : "Create wallet"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Step 2: Guardrails ---
  if (step === "guardrails") {
    return (
      <div className="min-h-screen bg-ledger-950">
        <nav className="border-b border-ledger-800">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
            <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
          </div>
        </nav>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-3xl font-bold text-ledger-100">Set your guardrails</h1>
          <p className="mt-3 text-sm leading-relaxed text-ledger-400">
            These limits are baked into your contract as immutable code — no one can change
            them later, not even you. This is what makes the safety guarantee real.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ledger-300 uppercase">Max trade size (USDC)</label>
              <input type="number" value={guardrails.maxTradeSize} onChange={(e) => handleChange("maxTradeSize", e.target.value)} className="mt-1 w-full rounded-md border border-ledger-700 bg-ledger-900 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none" />
              <p className="mt-1 text-xs text-ledger-500">e.g. 5 = $5 max per trade.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ledger-300 uppercase">Max slippage (bps)</label>
              <input type="number" value={guardrails.maxSlippageBps} onChange={(e) => handleChange("maxSlippageBps", e.target.value)} className="mt-1 w-full rounded-md border border-ledger-700 bg-ledger-900 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none" />
              <p className="mt-1 text-xs text-ledger-500">e.g. 150 = 1.50% max price impact.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ledger-300 uppercase">Min arb width (bps)</label>
              <input type="number" value={guardrails.minArbWidthBps} onChange={(e) => handleChange("minArbWidthBps", e.target.value)} className="mt-1 w-full rounded-md border border-ledger-700 bg-ledger-900 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ledger-300 uppercase">Max drift (bps)</label>
              <input type="number" value={guardrails.maxDriftBps} onChange={(e) => handleChange("maxDriftBps", e.target.value)} className="mt-1 w-full rounded-md border border-ledger-700 bg-ledger-900 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ledger-300 uppercase">Max confirm gap (blocks)</label>
              <input type="number" value={guardrails.maxConfirmGapBlocks} onChange={(e) => handleChange("maxConfirmGapBlocks", e.target.value)} className="mt-1 w-full rounded-md border border-ledger-700 bg-ledger-900 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ledger-300 uppercase">Actions per epoch</label>
              <input type="number" value={guardrails.maxActionsPerEpoch} onChange={(e) => handleChange("maxActionsPerEpoch", e.target.value)} className="mt-1 w-full rounded-md border border-ledger-700 bg-ledger-900 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ledger-300 uppercase">Epoch length (seconds)</label>
              <input type="number" value={guardrails.epochLength} onChange={(e) => handleChange("epochLength", e.target.value)} className="mt-1 w-full rounded-md border border-ledger-700 bg-ledger-900 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none" />
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-alert-400">{error}</p>}

          <button
            onClick={handleGuardrailsContinue}
            className="mt-6 w-full rounded-md bg-verified-500 px-6 py-3 text-sm font-semibold text-ledger-950 hover:bg-verified-400 transition"
          >
            Continue — verify your email
          </button>
        </div>
      </div>
    );
  }

  // --- Step 3: Email verification code ---
  if (step === "otp") {
    return (
      <div className="min-h-screen bg-ledger-950">
        <nav className="border-b border-ledger-800">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
            <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
          </div>
        </nav>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-3xl font-bold text-ledger-100">Check your email</h1>
          <p className="mt-3 text-sm leading-relaxed text-ledger-400">
            A one-time sign-in code was sent to <span className="text-ledger-200">{email}</span>.
            Enter it below — your wallet is created (or restored) the moment it verifies.
          </p>
          {error && <p className="mt-4 text-sm text-alert-400">{error}</p>}
          <form onSubmit={handleVerifyAndDeploy} className="mt-6">
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit code"
              autoFocus
              className="w-full rounded-md border border-ledger-700 bg-ledger-900 px-4 py-3 text-sm text-ledger-100 placeholder-ledger-500 focus:border-verified-500/50 focus:outline-none"
              required
            />
            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-verified-500 px-6 py-3 text-sm font-semibold text-ledger-950 hover:bg-verified-400 transition"
            >
              Verify &amp; deploy my contract
            </button>
          </form>
          <button
            onClick={() => void preAuthenticate({ client: thirdwebClient, strategy: "email", email })}
            className="mt-4 text-xs text-ledger-400 hover:text-verified-400 transition"
          >
            Didn't get it? Resend the code
          </button>
        </div>
      </div>
    );
  }

  // --- Step 4: Deploying ---
  if (step === "deploying") {
    return (
      <div className="min-h-screen bg-ledger-950">
        <nav className="border-b border-ledger-800">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
            <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
          </div>
        </nav>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <div className="mb-6 text-3xl font-bold text-verified-400">✓</div>
          <h1 className="text-2xl font-bold text-ledger-100">Wallet created — deploying your contract</h1>
          <p className="mt-3 text-sm text-ledger-400">
            Your embedded wallet is ready. Your treasury contract is deploying with your
            chosen guardrails as immutable code...
          </p>
          {error && <p className="mt-4 text-sm text-alert-400">{error}</p>}
        </div>
      </div>
    );
  }

  return null;
}

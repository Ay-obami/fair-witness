// Stage 4b/4c — "Your instances" dashboard.
// Login-gated: requires a Thirdweb embedded-wallet session (same email OTP flow as
// /signup). Shows the instances mapped to the signed-in wallet via Supabase, and lets
// the user add an instance they own (owner is verified on-chain before the mapping is
// saved, so you can't claim someone else's contract). When Supabase is unconfigured the
// page degrades gracefully to a wallet-level read (empty list + a clear note).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { getUserEmail, preAuthenticate } from "thirdweb/wallets/in-app";
import { creditcoinTestnet, wallet, client } from "../lib/thirdweb";
import { config } from "../lib/config";
import { fetchTreasuryInfo } from "../lib/contractReader";
import { fetchInstancesForWallet, saveInstanceMapping, type SupabaseMapping } from "../lib/instanceStore";

export default function Dashboard() {
  // Wallet session is owned locally: thirdweb v5.121's ThirdwebProvider takes no
  // client and programmatic wallet.connect() doesn't populate a React account
  // context — wallet.getAccount()/autoConnect() cover the session + its restore.
  const [account, setAccount] = useState(() => wallet.getAccount());
  useEffect(() => {
    let cancelled = false;
    wallet.autoConnect({ client })
      .then((a) => {
        if (!cancelled && a) setAccount(a);
      })
      .catch(() => { /* no stored session — fine */ });
    return () => {
      cancelled = true;
    };
  }, []);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [loggedEmail, setLoggedEmail] = useState<string | undefined>();
  const [instances, setInstances] = useState<SupabaseMapping[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [newAddr, setNewAddr] = useState("");
  const [addState, setAddState] = useState<{ kind: "idle" | "checking" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  // When a wallet is active, resolve the signed-in identity + pull its mappings.
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void (async () => {
      // Enter an async continuation before touching state (React Compiler
      // set-state-in-effect lint) — same pattern as Verify.tsx.
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setListError(null);
      try {
        const userEmail = await getUserEmail({ client });
        if (cancelled) return;
        setLoggedEmail(userEmail);
      } catch {
        /* email is optional identity — non-fatal */
      }
      const rows = await fetchInstancesForWallet(account.address);
      if (cancelled) return;
      if (rows === null) {
        setListError("Supabase not configured — add VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to frontend/.env (see docs/DEPLOYMENT.md Stage 4c).");
        setInstances([]);
      } else {
        setInstances(rows);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [account]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setAuthError("Enter a valid email to sign in.");
      return;
    }
    setAuthError(null);
    setSigningIn(true);
    try {
      // Same non-custodial email OTP flow as /signup: email a code first, then
      // verify it below — an existing account logs back in to the same embedded
      // wallet (the wallet is the instance owner key).
      await preAuthenticate({ client, strategy: "email", email });
      setAwaitingOtp(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setSigningIn(true);
    try {
      await wallet.connect({
        client,
        chain: creditcoinTestnet,
        strategy: "email",
        email,
        verificationCode: otp,
      });
      setAccount(wallet.getAccount());
      setAwaitingOtp(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleAddInstance(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    let addr: string;
    try {
      addr = ethers.getAddress(newAddr.trim());
    } catch {
      setAddState({ kind: "err", msg: "That doesn't look like a valid address." });
      return;
    }
    setAddState({ kind: "checking" });
    try {
      const info = await fetchTreasuryInfo(addr);
      if (info.owner.toLowerCase() !== account.address.toLowerCase()) {
        setAddState({ kind: "err", msg: `Owned by ${info.owner}, not your wallet — you can only add your own.` });
        return;
      }
      const res = await saveInstanceMapping({
        email: loggedEmail ?? "unknown@embedded-wallet",
        walletAddress: account.address,
        instanceAddress: addr,
      });
      if (!res.ok) {
        setAddState({ kind: "err", msg: res.error ?? "Could not save mapping." });
        return;
      }
      setAddState({ kind: "ok", msg: "Added — list refreshed below." });
      const rows = await fetchInstancesForWallet(account.address);
      setInstances(rows ?? []);
      setNewAddr("");
    } catch (err) {
      setAddState({ kind: "err", msg: err instanceof Error ? err.message : String(err) });
    }
  }

  const explorerBase = config.explorerBaseUrl;

  return (
    <div className="min-h-screen bg-ledger-950">
      <nav className="border-b border-ledger-800">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
          <Link to="/verify" className="text-sm text-ledger-400 hover:text-verified-400 transition">Replay &amp; Audit Viewer</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-2xl font-bold text-ledger-100">Your instances</h1>
        <p className="mt-2 text-sm leading-relaxed text-ledger-400">
          The contracts you own, mapped to your signed-in identity. Everything here is
          public on-chain anyway — this page is just a convenient "mine" view.
        </p>

        {!account && (
          <div className="mt-8 rounded-lg border border-ledger-700 bg-ledger-900 p-6">
            <p className="text-sm font-semibold text-ledger-200">Sign in with your email</p>
            <p className="mt-1 text-xs text-ledger-400">
              Non-custodial embedded wallet — the same login you used at sign-up. No seed phrase.
            </p>
            {!awaitingOtp ? (
              <form onSubmit={handleSignIn} className="mt-4 flex gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 rounded-md border border-ledger-700 bg-ledger-950 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={signingIn}
                  className="rounded-md bg-verified-500 px-5 py-2 text-sm font-semibold text-ledger-950 hover:bg-verified-400 transition disabled:opacity-50"
                >
                  {signingIn ? "Sending code…" : "Send code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpSubmit} className="mt-4">
                <p className="text-xs text-ledger-400">
                  A one-time code was emailed to <span className="text-ledger-200">{email}</span>. Enter it to sign in.
                </p>
                <div className="mt-3 flex gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6-digit code"
                    className="flex-1 rounded-md border border-ledger-700 bg-ledger-950 px-3 py-2 text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={signingIn}
                    className="rounded-md bg-verified-500 px-5 py-2 text-sm font-semibold text-ledger-950 hover:bg-verified-400 transition disabled:opacity-50"
                  >
                    {signingIn ? "Verifying…" : "Verify & sign in"}
                  </button>
                </div>
              </form>
            )}
            {authError && <p className="mt-3 text-sm text-alert-400">{authError}</p>}
          </div>
        )}

        {account && (
          <div className="mt-8 space-y-8">
            <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
              <p className="text-xs uppercase tracking-wider text-ledger-400">Signed in as</p>
              <p className="mt-1 text-sm font-semibold text-verified-400">{loggedEmail ?? "embedded wallet"}</p>
              <code className="mt-1 block font-data text-xs text-ledger-400 break-all">{account.address}</code>
            </div>

            {loading && <p className="text-sm text-ledger-400">Loading your instances…</p>}
            {listError && <p className="rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">{listError}</p>}

            {!listError && instances.length === 0 && (
              <div className="rounded-lg border border-ledger-800 bg-ledger-950 p-6 text-sm text-ledger-400">
                No instances mapped to this wallet yet. Sign up (or add an instance you
                own below) to create your first one.
              </div>
            )}

            {instances.map((m) => (
              <div key={m.instanceAddress} className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-ledger-400">Treasury</p>
                  <a
                    href={`${explorerBase}/address/${m.instanceAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-verified-400 hover:underline"
                  >
                    View on explorer
                  </a>
                </div>
                <code className="mt-2 block font-data text-sm text-verified-400 break-all">{m.instanceAddress}</code>
                <p className="mt-2 text-xs text-ledger-500">Mapped to {m.email}</p>
              </div>
            ))}

            <form onSubmit={handleAddInstance} className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
              <p className="text-sm font-semibold text-ledger-200">Add an instance you own</p>
              <p className="mt-1 text-xs text-ledger-400">
                Owner is checked on-chain before saving — you can't claim someone else's contract.
              </p>
              <div className="mt-4 flex gap-3">
                <input
                  type="text"
                  value={newAddr}
                  onChange={(e) => setNewAddr(e.target.value)}
                  placeholder="0x…"
                  className="flex-1 rounded-md border border-ledger-700 bg-ledger-950 px-3 py-2 font-data text-sm text-ledger-100 focus:border-verified-500/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={addState.kind === "checking"}
                  className="rounded-md border border-ledger-600 px-5 py-2 text-sm font-semibold text-ledger-200 hover:border-verified-500/50 hover:text-verified-400 transition disabled:opacity-50"
                >
                  {addState.kind === "checking" ? "Checking…" : "Add"}
                </button>
              </div>
              {addState.kind === "ok" && <p className="mt-3 text-sm text-verified-400">{addState.msg}</p>}
              {addState.kind === "err" && <p className="mt-3 text-sm text-alert-400">{addState.msg}</p>}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

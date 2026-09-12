import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "../components/layout";
import { ethers } from "ethers";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { creditcoinTestnet, wallet, thirdwebClient } from "../lib/thirdweb";
import { config } from "../lib/config";
import { FAIR_WITNESS_TREASURY_ABI } from "../lib/abi";
import { CONTROLLED_DEMO } from "../lib/controlledDemo";
import { humanError } from "../lib/humanError";
import { ensureSponsoredGas } from "../lib/sponsor";

function useQuery() { return new URLSearchParams(useLocation().search); }
const FAUCET_ABI = ["function claimed(address) view returns(bool)", "function claim(address treasury)"];

export default function SignUpDone() {
  const navigate = useNavigate();
  const address = useQuery().get("address");
  const [account, setAccount] = useState(() => wallet.getAccount());
  const [owner, setOwner] = useState("");
  const [policyHash, setPolicyHash] = useState("");
  const [registered, setRegistered] = useState(false);
  const [mode, setMode] = useState(0);
  const [funded, setFunded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = useMemo(() => new ethers.JsonRpcProvider(config.creditcoinRpcUrl), []);

  useEffect(() => { if (!address) navigate("/signup"); }, [address, navigate]);
  useEffect(() => { wallet.autoConnect({ client: thirdwebClient }).then(() => setAccount(wallet.getAccount())).catch(() => {}); }, []);

  async function readState() {
    if (!address) throw new Error("Treasury address is missing.");
    const treasuryAddress = ethers.getAddress(address);
    const treasury = new ethers.Contract(treasuryAddress, FAIR_WITNESS_TREASURY_ABI, provider);
    const [o, h, r, m] = await Promise.all([
      treasury.owner(),
      treasury.currentPolicyHash(),
      treasury.registeredAgents(config.agentSubmitAddress),
      treasury.automationMode(),
    ]);
    let faucetClaimed = false;
    if (config.faucetAddress) {
      faucetClaimed = Boolean(await new ethers.Contract(config.faucetAddress, FAUCET_ABI, provider).claimed(treasuryAddress));
    }
    return {
      owner: String(o),
      policyHash: String(h),
      registered: Boolean(r),
      mode: Number(m),
      funded: faucetClaimed,
    };
  }

  async function refresh() {
    const state = await readState();
    setOwner(state.owner);
    setPolicyHash(state.policyHash);
    setRegistered(state.registered);
    setMode(state.mode);
    setFunded(state.funded);
  }

  useEffect(() => { void refresh().catch(e => setError(humanError(e, "Could not load treasury status."))); }, [address]);

  async function signer() {
    if (!account) throw new Error("Reconnect through Launch Fair Witness to perform owner actions.");
    if (owner && account.address.toLowerCase() !== owner.toLowerCase()) throw new Error("Connected wallet is not this treasury's owner.");
    await ensureSponsoredGas(account.address);
    return ethers6Adapter.signer.toEthers({ client: thirdwebClient, chain: creditcoinTestnet, account });
  }

  async function fundAndLaunch() {
    if (!address) return;
    if (!config.faucetAddress) {
      setError("The controlled demo faucet has not been deployed/configured yet.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const s = await signer();
      const treasuryAddress = ethers.getAddress(address);
      const treasury = new ethers.Contract(treasuryAddress, FAIR_WITNESS_TREASURY_ABI, s);
      const faucet = new ethers.Contract(config.faucetAddress, FAUCET_ABI, s);

      // Re-read before every step. This makes retries safe when a previous transaction
      // succeeded but a later activation step failed or the browser lost connectivity.
      let state = await readState();
      if (state.owner.toLowerCase() !== s.address.toLowerCase()) {
        throw new Error("Connected wallet is not this treasury's owner.");
      }

      if (!state.funded) {
        const receipt = await (await faucet.claim(treasuryAddress)).wait();
        if (!receipt || receipt.status !== 1) throw new Error("Demo funding transaction did not confirm successfully.");
        state = await readState();
        if (!state.funded) throw new Error("Faucet transaction confirmed, but the treasury is not marked funded.");
        setFunded(true);
      }

      if (!state.registered) {
        const receipt = await (await treasury.registerAgent(config.agentSubmitAddress)).wait();
        if (!receipt || receipt.status !== 1) throw new Error("Agent authorization transaction did not confirm successfully.");
        state = await readState();
        if (!state.registered) throw new Error("Agent authorization confirmed, but registration was not visible on-chain.");
        setRegistered(true);
      }

      if (state.mode !== 1) {
        const receipt = await (await treasury.setAutomationMode(1)).wait();
        if (!receipt || receipt.status !== 1) throw new Error("Autonomous-mode transaction did not confirm successfully.");
        state = await readState();
        if (state.mode !== 1) throw new Error("Autonomous-mode transaction confirmed, but the treasury is still paused.");
        setMode(1);
      }

      await refresh();
    } catch (e) {
      // Refresh whatever did succeed before surfacing the error so the next click resumes
      // from the actual on-chain state instead of replaying completed steps.
      try { await refresh(); } catch { /* preserve original error */ }
      setError(humanError(e, "Fair Witness could not finish launching this treasury. Safe steps that already confirmed will not be repeated on retry."));
    } finally {
      setBusy(false);
    }
  }

  if (!address) return null;
  const treasuryAddress = ethers.getAddress(address);
  const ready = funded && registered && mode === 1;

  return <Layout><main className="mx-auto max-w-3xl px-6 py-14">
    <p className="text-xs uppercase tracking-widest text-verified-400">Treasury deployed</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Fund your treasury</h1>
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ledger-400">
      Add controlled test assets and Fair Witness will finish the required launch setup automatically. The launch flow is retry-safe: any step already confirmed on-chain is detected and skipped.
    </p>

    <section className="mt-7 rounded-xl border border-ledger-700 bg-ledger-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ledger-500">Your treasury</p>
          <code className="mt-2 block break-all text-sm text-verified-400">{treasuryAddress}</code>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${ready ? "border-verified-500/30 bg-verified-500/5 text-verified-400" : "border-ledger-700 text-ledger-400"}`}>
          {ready ? "READY ✓" : "AWAITING LAUNCH"}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-ledger-800 bg-ledger-950 p-4">
          <p className="text-xs text-ledger-500">Funding</p>
          <p className="mt-1 text-lg font-semibold text-ledger-100">100 fwWCTC + 500 fwUSD</p>
          <p className="mt-2 text-xs leading-relaxed text-ledger-500">Assets go directly to your treasury. The agent never receives custody.</p>
        </div>
        <div className="rounded-lg border border-ledger-800 bg-ledger-950 p-4">
          <p className="text-xs text-ledger-500">Launch sequence</p>
          <p className="mt-1 text-lg font-semibold text-ledger-100">Fund → authorize → enable</p>
          <p className="mt-2 text-xs leading-relaxed text-ledger-500">Each completed step is re-read from chain before the next one begins.</p>
        </div>
      </div>

      {!ready && config.faucetAddress && <button
        disabled={busy}
        onClick={() => void fundAndLaunch()}
        className="mt-6 w-full cursor-pointer rounded-lg bg-copper-500 px-5 py-3 text-sm font-semibold text-ledger-950 transition hover:bg-copper-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Funding & launching…" : "Fund & launch treasury"}
      </button>}

      {!config.faucetAddress && <>
        <div className="mt-6 space-y-1 font-data text-xs text-ledger-300"><p>fwWCTC: {CONTROLLED_DEMO.destination.wctc}</p><p>fwUSD: {CONTROLLED_DEMO.destination.stable}</p></div>
        <p className="mt-3 text-xs text-alert-400">The demo faucet address is not configured.</p>
      </>}

      {ready && <div className="mt-6 rounded-lg border border-verified-500/30 bg-verified-500/5 p-4">
        <p className="text-sm font-semibold text-verified-400">Treasury is funded and autonomous ✓</p>
        <p className="mt-1 text-xs text-ledger-400">Your mandate is active and the bounded Fair Witness agent can now submit policy-checked proposals.</p>
      </div>}

      {error && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-4">
        {ready && <Link to={`/dashboard?treasury=${treasuryAddress}`} className="rounded bg-verified-500 px-4 py-2 text-sm font-semibold text-ledger-950">Open dashboard</Link>}
        <a className="px-1 py-2 text-sm text-copper-400" href={`${config.explorerBaseUrl}/address/${treasuryAddress}`} target="_blank" rel="noreferrer">View treasury on explorer ↗</a>
      </div>
    </section>

    <details className="mt-5 rounded-lg border border-ledger-800 bg-ledger-950 p-4 text-xs text-ledger-500">
      <summary className="cursor-pointer text-ledger-400">Technical deployment details</summary>
      <div className="mt-3 space-y-2">
        <p>Owner <span className="font-data break-all text-ledger-300">{owner || "Loading…"}</span></p>
        <p>Policy hash <span className="font-data break-all text-ledger-300">{policyHash || "Loading…"}</span></p>
        <p>Demo funding <span className="text-ledger-300">{funded ? "Confirmed" : "Not yet confirmed"}</span></p>
        <p>Bounded agent <span className="text-ledger-300">{registered ? "Authorized" : "Will be authorized during launch"}</span></p>
        <p>Autonomous mode <span className="text-ledger-300">{mode === 1 ? "Enabled" : "Will be enabled during launch"}</span></p>
      </div>
    </details>
  </main></Layout>;
}

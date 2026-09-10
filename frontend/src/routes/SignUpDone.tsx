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

  async function refresh() {
    if (!address) return;
    const treasury = new ethers.Contract(ethers.getAddress(address), FAIR_WITNESS_TREASURY_ABI, provider);
    const [o, h, r, m] = await Promise.all([
      treasury.owner(),
      treasury.currentPolicyHash(),
      treasury.registeredAgents(config.agentSubmitAddress),
      treasury.automationMode(),
    ]);
    setOwner(o);
    setPolicyHash(h);
    setRegistered(Boolean(r));
    setMode(Number(m));
    if (config.faucetAddress) {
      try {
        setFunded(Boolean(await new ethers.Contract(config.faucetAddress, FAUCET_ABI, provider).claimed(address)));
      } catch {
        setFunded(false);
      }
    }
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

      if (!funded) await (await faucet.claim(treasuryAddress)).wait();
      if (!registered) await (await treasury.registerAgent(config.agentSubmitAddress)).wait();
      if (mode !== 1) await (await treasury.setAutomationMode(1)).wait();

      await refresh();
    } catch (e) {
      setError(humanError(e, "Fair Witness could not finish launching this treasury."));
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
      Add controlled test assets and Fair Witness will finish the required launch setup automatically. Agent authorization and autonomous mode are part of the product, so you do not need to configure them as separate onboarding steps.
    </p>

    <section className="mt-7 rounded-xl border border-ledger-700 bg-ledger-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ledger-500">Your treasury</p>
          <code className="mt-2 block break-all text-sm text-verified-400">{treasuryAddress}</code>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${ready ? "border-verified-500/30 bg-verified-500/5 text-verified-400" : "border-ledger-700 text-ledger-400"}`}>
          {ready ? "READY ✓" : "AWAITING FUNDING"}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-ledger-800 bg-ledger-950 p-4">
          <p className="text-xs text-ledger-500">Funding</p>
          <p className="mt-1 text-lg font-semibold text-ledger-100">100 fwWCTC + 500 fwUSD</p>
          <p className="mt-2 text-xs leading-relaxed text-ledger-500">Assets go directly to your treasury. The agent never receives custody.</p>
        </div>
        <div className="rounded-lg border border-ledger-800 bg-ledger-950 p-4">
          <p className="text-xs text-ledger-500">After funding</p>
          <p className="mt-1 text-lg font-semibold text-ledger-100">Autonomous by default</p>
          <p className="mt-2 text-xs leading-relaxed text-ledger-500">Fair Witness binds the bounded submitter and enables your on-chain mandate automatically.</p>
        </div>
      </div>

      {!ready && config.faucetAddress && <button
        disabled={busy}
        onClick={() => void fundAndLaunch()}
        className="mt-6 w-full rounded-lg bg-copper-500 px-5 py-3 text-sm font-semibold text-ledger-950 transition hover:bg-copper-400 disabled:cursor-not-allowed disabled:opacity-50"
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
        <p>Bounded agent <span className="text-ledger-300">{registered ? "Authorized" : "Will be authorized during launch"}</span></p>
        <p>Autonomous mode <span className="text-ledger-300">{mode === 1 ? "Enabled" : "Will be enabled during launch"}</span></p>
      </div>
    </details>
  </main></Layout>;
}

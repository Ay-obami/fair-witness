import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "../components/layout";
import { ControlledMarketBadge } from "../components/ProductVisuals";
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
type LaunchStage = "idle" | "fund" | "authorize" | "enable" | "done";

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
  const [launchStage, setLaunchStage] = useState<LaunchStage>("idle");
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
    return { owner: String(o), policyHash: String(h), registered: Boolean(r), mode: Number(m), funded: faucetClaimed };
  }

  async function refresh() {
    const state = await readState();
    setOwner(state.owner);
    setPolicyHash(state.policyHash);
    setRegistered(state.registered);
    setMode(state.mode);
    setFunded(state.funded);
    if (state.funded && state.registered && state.mode === 1) setLaunchStage("done");
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
      const signerAddress = await s.getAddress();
      const treasuryAddress = ethers.getAddress(address);
      const treasury = new ethers.Contract(treasuryAddress, FAIR_WITNESS_TREASURY_ABI, s);
      const faucet = new ethers.Contract(config.faucetAddress, FAUCET_ABI, s);
      let state = await readState();
      if (state.owner.toLowerCase() !== signerAddress.toLowerCase()) throw new Error("Connected wallet is not this treasury's owner.");

      if (!state.funded) {
        setLaunchStage("fund");
        const receipt = await (await faucet.claim(treasuryAddress)).wait();
        if (!receipt || receipt.status !== 1) throw new Error("Demo funding transaction did not confirm successfully.");
        state = await readState();
        if (!state.funded) throw new Error("Faucet transaction confirmed, but the treasury is not marked funded.");
        setFunded(true);
      }

      if (!state.registered) {
        setLaunchStage("authorize");
        const receipt = await (await treasury.registerAgent(config.agentSubmitAddress)).wait();
        if (!receipt || receipt.status !== 1) throw new Error("Agent authorization transaction did not confirm successfully.");
        state = await readState();
        if (!state.registered) throw new Error("Agent authorization confirmed, but registration was not visible on-chain.");
        setRegistered(true);
      }

      if (state.mode !== 1) {
        setLaunchStage("enable");
        const receipt = await (await treasury.setAutomationMode(1)).wait();
        if (!receipt || receipt.status !== 1) throw new Error("Autonomous-mode transaction did not confirm successfully.");
        state = await readState();
        if (state.mode !== 1) throw new Error("Autonomous-mode transaction confirmed, but the treasury is still paused.");
        setMode(1);
      }

      await refresh();
      setLaunchStage("done");
    } catch (e) {
      try { await refresh(); } catch { /* preserve original error */ }
      setLaunchStage("idle");
      setError(humanError(e, "Fair Witness could not finish launching this treasury. Safe steps that already confirmed will not be repeated on retry."));
    } finally {
      setBusy(false);
    }
  }

  if (!address) return null;
  const treasuryAddress = ethers.getAddress(address);
  const ready = funded && registered && mode === 1;
  const completed = Number(funded) + Number(registered) + Number(mode === 1);

  return <Layout><main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-20 -top-24 h-72 w-72 bg-verified-500/14" />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Treasury deployed</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Bring your treasury online.</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">The contract already exists and owns its mandate. Launch now funds it with controlled demo assets, authorizes the bounded agent, then enables autonomous mode.</p></div><span className={`fw-status-chip self-start text-[10px] font-data lg:self-auto ${ready ? "text-verified-400" : "text-copper-400"}`}>{ready ? "READY ✓" : `${completed}/3 COMPLETE`}</span></div>
    </header>

    <section className="mt-7 grid gap-5 lg:grid-cols-[1fr_.72fr]">
      <div className="fw-command-surface rounded-3xl border p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Your treasury</p><code className="mt-2 block break-all font-data text-xs text-verified-400 sm:text-sm">{treasuryAddress}</code></div><a className="fw-secondary-button shrink-0 rounded-xl px-3 py-2 text-center text-xs text-ledger-300" href={`${config.explorerBaseUrl}/address/${treasuryAddress}`} target="_blank" rel="noreferrer">Explorer ↗</a></div>

        <div className="mt-7"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Launch sequence</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Three explicit on-chain steps</h2></div>
        <div className="relative mt-5 space-y-3 before:absolute before:bottom-6 before:left-[1.1rem] before:top-6 before:w-px before:bg-ledger-800">
          <LaunchStep index="01" title="Fund treasury" detail="Claim 100 fwWCTC + 500 fwUSD directly into the treasury." complete={funded} working={busy && launchStage === "fund"} />
          <LaunchStep index="02" title="Authorize bounded agent" detail="Register only the configured Fair Witness submitter for this treasury." complete={registered} working={busy && launchStage === "authorize"} />
          <LaunchStep index="03" title="Enable autonomous mode" detail="Allow policy-checked proposals to execute after every prior safeguard passes." complete={mode === 1} working={busy && launchStage === "enable"} />
        </div>

        {!ready && config.faucetAddress && <button disabled={busy} onClick={() => void fundAndLaunch()} className="fw-primary-button mt-6 w-full cursor-pointer rounded-xl px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{busy ? stageLabel(launchStage) : completed > 0 ? "Continue launch →" : "Fund & launch treasury →"}</button>}

        {!config.faucetAddress && <div className="mt-6 rounded-xl border border-alert-500/30 bg-alert-500/5 p-4"><p className="text-sm text-alert-400">The demo faucet address is not configured.</p><div className="mt-3 space-y-1 font-data text-[10px] text-ledger-400"><p className="break-all">fwWCTC: {CONTROLLED_DEMO.destination.wctc}</p><p className="break-all">fwUSD: {CONTROLLED_DEMO.destination.stable}</p></div></div>}

        {error && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
      </div>

      <aside className="space-y-5">
        <div className="rounded-3xl border border-verified-500/20 bg-verified-500/5 p-5 sm:p-6"><p className="text-[10px] uppercase tracking-[.18em] text-verified-400">Custody boundary</p><h2 className="mt-2 text-xl font-semibold text-ledger-100">Assets never go to the agent.</h2><p className="mt-3 text-sm leading-relaxed text-ledger-400">Demo assets are claimed directly to your treasury. The agent receives proposal permission, not withdrawal authority or ownership.</p><div className="mt-5 space-y-2 text-xs text-ledger-300"><p>✓ Treasury remains user-owned</p><p>✓ Mandate is already committed</p><p>✓ Agent registration is treasury-specific</p><p>✓ Pause remains available after launch</p></div></div>

        <div className="fw-command-surface rounded-3xl border p-5 sm:p-6"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Deployment state</p><div className="mt-4 space-y-3"><StateRow label="Demo funding" ok={funded} /><StateRow label="Bounded agent" ok={registered} /><StateRow label="Autonomous mode" ok={mode === 1} /></div><details className="mt-5 text-xs text-ledger-500"><summary className="cursor-pointer text-copper-400">Technical deployment details</summary><div className="mt-3 space-y-3"><p>Owner <span className="mt-1 block break-all font-data text-ledger-300">{owner || "Loading…"}</span></p><p>Policy hash <span className="mt-1 block break-all font-data text-ledger-300">{policyHash || "Loading…"}</span></p></div></details></div>
      </aside>
    </section>

    {ready && <section className="relative mt-7 overflow-hidden rounded-3xl border border-verified-500/30 bg-verified-500/5 p-5 sm:p-7"><div className="fw-ambient-orb -right-24 -top-24 h-64 w-64 bg-verified-500/15" /><div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-verified-400">Launch complete</p><h2 className="mt-2 text-2xl font-semibold text-ledger-100">Your treasury is funded and autonomous.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ledger-400">Fair Witness can now observe verified market evidence and submit only the actions permitted by your mandate.</p></div><Link to={`/dashboard?treasury=${treasuryAddress}`} className="fw-primary-button w-full rounded-xl px-5 py-3 text-center text-sm font-semibold sm:w-auto">Open dashboard →</Link></div></section>}
  </main></Layout>;
}

function LaunchStep({ index, title, detail, complete, working }: { index: string; title: string; detail: string; complete: boolean; working: boolean }) {
  const active = complete || working;
  return <div className="relative flex items-start gap-4 rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4"><span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-ledger-950 font-data text-[9px] ${complete ? "border-verified-500/45 text-verified-400" : working ? "border-copper-500/50 text-copper-400 shadow-[0_0_18px_rgba(213,143,63,.15)]" : "border-ledger-700 text-ledger-600"}`}>{complete ? "✓" : index}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={`text-sm font-semibold ${active ? "text-ledger-100" : "text-ledger-400"}`}>{title}</p>{working && <span className="font-data text-[8px] uppercase tracking-widest text-copper-400">Confirming…</span>}{complete && <span className="font-data text-[8px] uppercase tracking-widest text-verified-400">Confirmed</span>}</div><p className="mt-1 text-xs leading-relaxed text-ledger-500">{detail}</p></div></div>;
}
function StateRow({ label, ok }: { label: string; ok: boolean }) { return <div className="flex items-center justify-between gap-4 border-b border-ledger-800 pb-2 text-xs last:border-0 last:pb-0"><span className="text-ledger-400">{label}</span><span className={ok ? "text-verified-400" : "text-ledger-600"}>{ok ? "✓ Confirmed" : "Pending"}</span></div>; }
function stageLabel(stage: LaunchStage) { if (stage === "fund") return "Funding treasury…"; if (stage === "authorize") return "Authorizing agent…"; if (stage === "enable") return "Enabling autonomous mode…"; return "Checking on-chain state…"; }

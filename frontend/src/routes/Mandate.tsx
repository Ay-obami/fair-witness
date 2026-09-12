import { useMemo, useState } from "react";
import { Layout } from "../components/layout";
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice";
import { ControlledMarketBadge, ExecutionRail } from "../components/ProductVisuals";
import { RECOMMENDED_MANDATE, STRATEGIES, toContractPolicies, validateMandate, type MandateDraft } from "../lib/policyUi";
import { CONTROLLED_DEMO } from "../lib/controlledDemo";
import { FAIR_WITNESS_FACTORY_ABI } from "../lib/abi";
import { config } from "../lib/config";
import { creditcoinTestnet, wallet, thirdwebClient } from "../lib/thirdweb";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import { saveInstanceMapping } from "../lib/instanceStore";
import { humanError } from "../lib/humanError";
import { ensureSponsoredGas } from "../lib/sponsor";
import { useAuthSession } from "../lib/authSession";

const ONBOARDING_KEY = "fair-witness:onboarding";
const PRESETS: Record<string, MandateDraft> = {
  Conservative: {...RECOMMENDED_MANDATE, maxActionValue:"50", maxSlippageBps:150, minNetEdgeBps:150, targetWctcBps:3000, toleranceBps:400, maxWctcExposureBps:4500, maxArbitrageValue:"50", maxRebalanceValue:"50", maxRiskReductionValue:"50", dailyRiskReductionValue:"150"},
  Balanced: {...RECOMMENDED_MANDATE},
  Active: {...RECOMMENDED_MANDATE, maxActionValue:"200", maxSlippageBps:500, minNetEdgeBps:75, targetWctcBps:5000, toleranceBps:750, maxWctcExposureBps:7000, maxArbitrageValue:"200", maxRebalanceValue:"200", maxRiskReductionValue:"200", dailyRiskReductionValue:"500"},
};

type OnboardingSession = { email?: string; walletAddress: string; authMethod?: string };

export default function Mandate() {
  const navigate = useNavigate();
  const { account, resolving } = useAuthSession();
  const [draft, setDraft] = useState<MandateDraft>({...RECOMMENDED_MANDATE, enabledStrategies:{...RECOMMENDED_MANDATE.enabledStrategies}});
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = useMemo(() => validateMandate(draft), [draft]);
  const onboarding = useMemo<OnboardingSession | null>(() => {
    let stored: OnboardingSession | null = null;
    try { stored = JSON.parse(sessionStorage.getItem(ONBOARDING_KEY) ?? "null") as OnboardingSession | null; } catch { stored = null; }
    if (account) {
      if (stored?.walletAddress?.toLowerCase() === account.address.toLowerCase()) return stored;
      return { walletAddress: account.address, authMethod: "session" };
    }
    return stored;
  }, [account]);
  const setPercent = (field:keyof MandateDraft, value:string) => setDraft(prev=>({...prev,[field]:Math.round(Number(value)*100)}));
  const percent = (bps:number) => String(bps/100);
  const enabledCount = Object.values(draft.enabledStrategies).filter(Boolean).length;

  async function deploy() {
    setError(null);
    if (errors.length) return setError(errors[0]);
    if (!onboarding) return setError("Your session expired. Return to Launch Fair Witness and sign in again.");
    const connected = wallet.getAccount();
    if (!connected || connected.address.toLowerCase() !== onboarding.walletAddress.toLowerCase()) return setError("Your Fair Witness session is not connected. Sign in again before deploying a treasury.");
    const factoryAddress = config.factoryAddress || CONTROLLED_DEMO.destination.factory;
    setBusy(true);
    try {
      await ensureSponsoredGas(connected.address);
      const signer = await ethers6Adapter.signer.toEthers({client:thirdwebClient, chain:creditcoinTestnet, account:connected});
      const factory = new ethers.Contract(factoryAddress, FAIR_WITNESS_FACTORY_ABI, signer);
      const policies = toContractPolicies(draft);
      await factory.createTreasury.staticCall(connected.address, policies.universal, policies.arbitrage, policies.rebalance, policies.risk);
      const tx = await factory.createTreasury(connected.address, policies.universal, policies.arbitrage, policies.rebalance, policies.risk);
      const receipt = await tx.wait();
      const created = receipt.logs.map((log: ethers.Log) => { try { return factory.interface.parseLog(log); } catch { return null; } }).find((log: ethers.LogDescription|null)=>log?.name === "TreasuryCreated");
      if (!created) throw new Error("TreasuryCreated event was not found in the deployment receipt.");
      const treasury = ethers.getAddress(created.args.treasury);
      if (!await factory.isFactoryTreasury(treasury)) throw new Error("Factory did not recognize the new treasury.");
      try { await saveInstanceMapping({walletAddress:connected.address,instanceAddress:treasury}); } catch {}
      sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify({...onboarding, walletAddress: connected.address}));
      sessionStorage.setItem("fair-witness:new-treasury", treasury);
      navigate(`/signup/done?address=${treasury}`);
    } catch (err) { setError(humanError(err, "Treasury deployment failed. Please retry or review the transaction configuration.")); }
    finally { setBusy(false); }
  }

  return <Layout><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-16 -top-24 h-72 w-72 bg-copper-500/14" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_.8fr] lg:items-end">
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Policy cockpit</p><ControlledMarketBadge /></div><h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Define the rules before the agent ever acts.</h1><p className="mt-4 max-w-3xl text-sm leading-relaxed text-ledger-400">Every treasury gets its own on-chain mandate. Strategy access, action size, slippage, exposure and execution cadence are fixed into policy before autonomous mode begins.</p></div>
        <div className="rounded-2xl border border-ledger-800 bg-ledger-950/50 p-4"><ExecutionRail active={4} labels={["Identity","Mandate","Deploy","Fund","Execute"]} /><p className="mt-4 text-center text-[10px] uppercase tracking-widest text-ledger-600">You are defining the authorization layer</p></div>
      </div>
    </header>

    <div className="mt-6"><SecurityBoundaryNotice /></div>

    <section className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Choose a starting posture</p><h2 className="mt-1 text-2xl font-semibold text-ledger-100">Risk preset</h2></div><p className="text-xs text-ledger-500">You can fine-tune every field below.</p></div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">{Object.entries(PRESETS).map(([name,preset])=><button key={name} type="button" onClick={()=>setDraft({...preset,enabledStrategies:{...preset.enabledStrategies}})} className="group fw-command-surface cursor-pointer rounded-2xl border p-5 text-left transition hover:-translate-y-1 hover:border-copper-500/40">
        <div className="flex items-center justify-between"><p className="text-lg font-semibold text-ledger-100">{name}</p><span className="font-data text-[10px] text-ledger-600">{name === "Conservative" ? "LOW" : name === "Balanced" ? "MID" : "HIGH"}</span></div>
        <p className="mt-2 text-sm leading-relaxed text-ledger-400">{name==="Conservative"?"Smaller actions, tighter exposure and more selective arbitrage.":name==="Balanced"?"Recommended default for the controlled demonstration market.":"Larger action ceilings and a wider operating range."}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] text-ledger-500"><span>Max action <strong className="block text-ledger-200">{preset.maxActionValue} fwUSD</strong></span><span>Exposure <strong className="block text-ledger-200">{preset.maxWctcExposureBps/100}% WCTC</strong></span></div>
      </button>)}</div>
    </section>

    {!resolving && !account && !onboarding && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">Sign in through Launch Fair Witness before deploying a treasury.</p>}

    <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_.42fr]">
      <div className="grid gap-5 md:grid-cols-2">
        <PolicyGroup title="Enabled strategies" eyebrow={`${enabledCount}/3 enabled`}><div className="space-y-3">{STRATEGIES.map(strategy=><label key={strategy} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ledger-800 bg-ledger-950/40 p-3 text-sm text-ledger-200"><span>{strategy}</span><input type="checkbox" checked={draft.enabledStrategies[strategy]} onChange={e=>setDraft({...draft,enabledStrategies:{...draft.enabledStrategies,[strategy]:e.target.checked}})} className="h-4 w-4 accent-copper-500" /></label>)}</div></PolicyGroup>
        <PolicyGroup title="Universal limits" eyebrow="Every strategy"><Field label="Maximum action (fwUSD)" value={draft.maxActionValue} onChange={v=>setDraft({...draft,maxActionValue:v})}/><Field label="Maximum slippage (%)" value={percent(draft.maxSlippageBps)} type="number" onChange={v=>setPercent("maxSlippageBps",v)}/></PolicyGroup>
        <PolicyGroup title="Portfolio mandate" eyebrow="Allocation"><Field label="Target WCTC (%)" value={percent(draft.targetWctcBps)} type="number" onChange={v=>setPercent("targetWctcBps",v)}/><Field label="Rebalance tolerance (±%)" value={percent(draft.toleranceBps)} type="number" onChange={v=>setPercent("toleranceBps",v)}/><Field label="Maximum WCTC exposure (%)" value={percent(draft.maxWctcExposureBps)} type="number" onChange={v=>setPercent("maxWctcExposureBps",v)}/></PolicyGroup>
        <PolicyGroup title="Strategy limits" eyebrow="Action ceilings"><Field label="Minimum arbitrage edge (%)" value={percent(draft.minNetEdgeBps)} type="number" onChange={v=>setPercent("minNetEdgeBps",v)}/><Field label="Maximum arbitrage value (fwUSD)" value={draft.maxArbitrageValue} onChange={v=>setDraft({...draft,maxArbitrageValue:v})}/><Field label="Maximum rebalance value (fwUSD)" value={draft.maxRebalanceValue} onChange={v=>setDraft({...draft,maxRebalanceValue:v})}/><Field label="Maximum risk-reduction value (fwUSD)" value={draft.maxRiskReductionValue} onChange={v=>setDraft({...draft,maxRiskReductionValue:v})}/></PolicyGroup>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="fw-glass rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Live mandate preview</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Authorization envelope</h2></div><span className={`fw-status-chip text-[9px] ${errors.length ? "text-alert-400" : "text-verified-400"}`}>{errors.length ? `${errors.length} ISSUE${errors.length === 1 ? "" : "S"}` : "VALID"}</span></div>
          <div className="mt-5 space-y-3"><PreviewRow label="Strategies" value={`${enabledCount} enabled`} /><PreviewRow label="Max action" value={`${draft.maxActionValue} fwUSD`} /><PreviewRow label="Max slippage" value={`${percent(draft.maxSlippageBps)}%`} /><PreviewRow label="Target WCTC" value={`${percent(draft.targetWctcBps)}%`} /><PreviewRow label="Exposure ceiling" value={`${percent(draft.maxWctcExposureBps)}%`} /><PreviewRow label="Min arb edge" value={`${percent(draft.minNetEdgeBps)}%`} /></div>
          <div className="mt-5 rounded-xl border border-ledger-800 bg-ledger-950/55 p-4"><p className="text-[10px] uppercase tracking-widest text-copper-400">What the AI cannot change</p><p className="mt-2 text-xs leading-relaxed text-ledger-400">These limits are enforced by the treasury. The reasoning layer cannot increase them, disable replay protection or bypass evidence checks.</p></div>
        </div>
      </aside>
    </section>

    <button type="button" onClick={()=>setAdvanced(!advanced)} className="fw-secondary-button mt-6 cursor-pointer rounded-xl px-4 py-2.5 text-sm text-copper-400">{advanced ? "Hide" : "Show"} advanced policy settings</button>
    {advanced && <section className="fw-command-surface mt-4 grid gap-4 rounded-2xl border p-5 md:grid-cols-2 lg:grid-cols-3"><Field label="Daily risk-reduction value (fwUSD)" value={draft.dailyRiskReductionValue} onChange={v=>setDraft({...draft,dailyRiskReductionValue:v})}/><Field label="Maximum source drift (%)" value={percent(draft.maxSourceDriftBps)} type="number" onChange={v=>setPercent("maxSourceDriftBps",v)}/><Field label="Maximum spot/TWAP deviation (%)" value={percent(draft.maxSpotTwapDeviationBps)} type="number" onChange={v=>setPercent("maxSpotTwapDeviationBps",v)}/><Field label="Attempts per epoch" value={draft.maxAttemptsPerEpoch} type="number" onChange={v=>setDraft({...draft,maxAttemptsPerEpoch:Number(v)})}/><Field label="Executions per epoch" value={draft.maxExecutionsPerEpoch} type="number" onChange={v=>setDraft({...draft,maxExecutionsPerEpoch:Number(v)})}/><Field label="Epoch length (seconds)" value={draft.epochLength} type="number" onChange={v=>setDraft({...draft,epochLength:Number(v)})}/></section>}

    <section className="fw-glass mt-8 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="fw-kicker">Deployment review</p><h2 className="mt-4 text-2xl font-semibold text-ledger-100">Deploy this mandate as a user-owned treasury</h2><p className="mt-3 max-w-2xl text-sm text-ledger-400">Owner signer: <span className="font-data break-all text-ledger-200">{onboarding?.walletAddress ?? "Not connected"}</span></p><p className="mt-1 max-w-2xl text-xs leading-relaxed text-ledger-500">New treasuries start paused. Creating one does not create or switch accounts.</p></div><button type="button" disabled={busy || resolving || errors.length>0 || !onboarding} onClick={()=>void deploy()} className="fw-primary-button cursor-pointer rounded-xl px-6 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Deploying treasury…" : "Deploy treasury →"}</button></div>
      {errors.length > 0 && <ul className="mt-5 list-disc rounded-xl border border-alert-500/25 bg-alert-500/5 p-4 pl-8 text-sm text-alert-400">{errors.map(e=><li key={e}>{e}</li>)}</ul>}
      {error && <p className="mt-4 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
    </section>
  </main></Layout>;
}

function PolicyGroup({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <fieldset className="fw-command-surface rounded-2xl border p-5"><legend className="sr-only">{title}</legend><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-ledger-100">{title}</h2><span className="font-data text-[9px] uppercase tracking-widest text-ledger-600">{eyebrow}</span></div>{children}</fieldset>;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-ledger-800 pb-2 text-xs last:border-0 last:pb-0"><span className="text-ledger-500">{label}</span><span className="font-data text-ledger-200">{value}</span></div>;
}

function Field({label,value,onChange,type="text"}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string}) {
  return <label className="mt-3 block text-[11px] uppercase tracking-wide text-ledger-500">{label}<input type={type} step={type==="number"?"0.01":undefined} value={value} onChange={e=>onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-ledger-700 bg-ledger-950/75 px-3 py-2.5 text-sm normal-case tracking-normal text-ledger-100" /></label>;
}

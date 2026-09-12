import { useMemo, useState } from "react";
import { Layout } from "../components/layout";
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice";
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
      try { await saveInstanceMapping({email:onboarding.email ?? onboarding.authMethod ?? "session",walletAddress:connected.address,instanceAddress:treasury}); } catch {}
      sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify({...onboarding, walletAddress: connected.address}));
      sessionStorage.setItem("fair-witness:new-treasury", treasury);
      navigate(`/signup/done?address=${treasury}`);
    } catch (err) { setError(humanError(err, "Treasury deployment failed. Please retry or review the transaction configuration.")); }
    finally { setBusy(false); }
  }

  return <Layout><main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
    <p className="text-xs uppercase tracking-widest text-copper-400">Create your mandate</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Choose how your agent is allowed to act</h1>
    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Create another treasury under your existing Fair Witness account. Each treasury has its own on-chain mandate, balances, activity journal and lifecycle controls.</p>
    <div className="mt-5"><SecurityBoundaryNotice /></div>
    <section className="mt-7 grid gap-3 sm:grid-cols-3">{Object.entries(PRESETS).map(([name,preset])=><button key={name} type="button" onClick={()=>setDraft({...preset,enabledStrategies:{...preset.enabledStrategies}})} className="cursor-pointer rounded-lg border border-ledger-700 bg-ledger-900 p-4 text-left transition hover:border-copper-500"><p className="font-semibold text-ledger-100">{name}</p><p className="mt-1 text-xs text-ledger-400">{name==="Conservative"?"Smaller actions and tighter exposure.":name==="Balanced"?"Recommended default for the controlled market.":"Larger limits and wider operating range."}</p></button>)}</section>
    {!resolving && !account && !onboarding && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">Sign in through Launch Fair Witness before deploying a treasury.</p>}
    <section className="mt-8 grid gap-6 md:grid-cols-2">
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Enabled strategies</legend>{STRATEGIES.map(strategy=><label key={strategy} className="mt-3 flex gap-3 text-sm text-ledger-200"><input type="checkbox" checked={draft.enabledStrategies[strategy]} onChange={e=>setDraft({...draft,enabledStrategies:{...draft.enabledStrategies,[strategy]:e.target.checked}})} />{strategy}</label>)}</fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Universal limits</legend><Field label="Maximum action (fwUSD)" value={draft.maxActionValue} onChange={v=>setDraft({...draft,maxActionValue:v})}/><Field label="Maximum slippage (%)" value={percent(draft.maxSlippageBps)} type="number" onChange={v=>setPercent("maxSlippageBps",v)}/></fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Portfolio mandate</legend><Field label="Target WCTC (%)" value={percent(draft.targetWctcBps)} type="number" onChange={v=>setPercent("targetWctcBps",v)}/><Field label="Rebalance tolerance (±%)" value={percent(draft.toleranceBps)} type="number" onChange={v=>setPercent("toleranceBps",v)}/><Field label="Maximum WCTC exposure (%)" value={percent(draft.maxWctcExposureBps)} type="number" onChange={v=>setPercent("maxWctcExposureBps",v)}/></fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Strategy limits</legend><Field label="Minimum arbitrage edge (%)" value={percent(draft.minNetEdgeBps)} type="number" onChange={v=>setPercent("minNetEdgeBps",v)}/><Field label="Maximum arbitrage value (fwUSD)" value={draft.maxArbitrageValue} onChange={v=>setDraft({...draft,maxArbitrageValue:v})}/><Field label="Maximum rebalance value (fwUSD)" value={draft.maxRebalanceValue} onChange={v=>setDraft({...draft,maxRebalanceValue:v})}/><Field label="Maximum risk-reduction value (fwUSD)" value={draft.maxRiskReductionValue} onChange={v=>setDraft({...draft,maxRiskReductionValue:v})}/></fieldset>
    </section>
    <button type="button" onClick={()=>setAdvanced(!advanced)} className="mt-6 cursor-pointer text-sm text-copper-400">{advanced ? "Hide" : "Show"} advanced policy settings</button>
    {advanced && <section className="mt-4 grid gap-4 rounded-lg border border-ledger-700 bg-ledger-900 p-5 md:grid-cols-2"><Field label="Daily risk-reduction value (fwUSD)" value={draft.dailyRiskReductionValue} onChange={v=>setDraft({...draft,dailyRiskReductionValue:v})}/><Field label="Maximum source drift (%)" value={percent(draft.maxSourceDriftBps)} type="number" onChange={v=>setPercent("maxSourceDriftBps",v)}/><Field label="Maximum spot/TWAP deviation (%)" value={percent(draft.maxSpotTwapDeviationBps)} type="number" onChange={v=>setPercent("maxSpotTwapDeviationBps",v)}/><Field label="Attempts per epoch" value={draft.maxAttemptsPerEpoch} type="number" onChange={v=>setDraft({...draft,maxAttemptsPerEpoch:Number(v)})}/><Field label="Executions per epoch" value={draft.maxExecutionsPerEpoch} type="number" onChange={v=>setDraft({...draft,maxExecutionsPerEpoch:Number(v)})}/><Field label="Epoch length (seconds)" value={draft.epochLength} type="number" onChange={v=>setDraft({...draft,epochLength:Number(v)})}/></section>}
    <section className="mt-8 rounded-lg border border-copper-700 bg-ledger-900 p-5"><h2 className="text-lg text-ledger-100">Deployment review</h2><p className="mt-2 text-sm text-ledger-400">Owner signer: <span className="font-data break-all text-ledger-200">{onboarding?.walletAddress ?? "Not connected"}</span></p><p className="mt-1 text-sm text-ledger-400">This is the embedded signer for your current Fair Witness session. New treasuries start paused, and creating one does not create or switch accounts.</p>{errors.length > 0 && <ul className="mt-4 list-disc pl-5 text-sm text-alert-400">{errors.map(e=><li key={e}>{e}</li>)}</ul>}{error && <p className="mt-4 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}<button type="button" disabled={busy || resolving || errors.length>0 || !onboarding} onClick={()=>void deploy()} className="mt-5 cursor-pointer rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Deploying…" : "Deploy my Fair Witness treasury"}</button></section>
  </main></Layout>;
}
function Field({label,value,onChange,type="text"}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string}) { return <label className="mt-3 block text-xs text-ledger-400">{label}<input type={type} step={type==="number"?"0.01":undefined} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100" /></label>; }

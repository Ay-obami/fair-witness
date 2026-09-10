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

const ONBOARDING_KEY = "fair-witness:onboarding";

export default function Mandate() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<MandateDraft>({...RECOMMENDED_MANDATE, enabledStrategies:{...RECOMMENDED_MANDATE.enabledStrategies}});
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = useMemo(() => validateMandate(draft), [draft]);
  const onboarding = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(ONBOARDING_KEY) ?? "null") as {email?:string;walletAddress:string;authMethod?:string}|null; } catch { return null; } }, []);

  const setNumber = (field: keyof MandateDraft, value: string) => setDraft(prev => ({...prev, [field]: Number(value)}));

  async function deploy() {
    setError(null);
    if (errors.length) return setError(errors[0]);
    if (!onboarding) return setError("Your onboarding session expired. Return to Launch Fair Witness and sign in again.");
    const account = wallet.getAccount();
    if (!account || account.address.toLowerCase() !== onboarding.walletAddress.toLowerCase()) return setError("Wallet session is not connected. Return to Launch Fair Witness and sign in again.");
    const factoryAddress = config.factoryAddress || CONTROLLED_DEMO.destination.factory;
    setBusy(true);
    try {
      await ensureSponsoredGas(account.address);
      const signer = await ethers6Adapter.signer.toEthers({client:thirdwebClient, chain:creditcoinTestnet, account});
      const factory = new ethers.Contract(factoryAddress, FAIR_WITNESS_FACTORY_ABI, signer);
      const policies = toContractPolicies(draft);
      await factory.createTreasury.staticCall(account.address, policies.universal, policies.arbitrage, policies.rebalance, policies.risk);
      const tx = await factory.createTreasury(account.address, policies.universal, policies.arbitrage, policies.rebalance, policies.risk);
      const receipt = await tx.wait();
      const created = receipt.logs.map((log: ethers.Log) => { try { return factory.interface.parseLog(log); } catch { return null; } }).find((log: ethers.LogDescription|null)=>log?.name === "TreasuryCreated");
      if (!created) throw new Error("TreasuryCreated event was not found in the deployment receipt.");
      const treasury = ethers.getAddress(created.args.treasury);
      if (!await factory.isFactoryTreasury(treasury)) throw new Error("Factory did not recognize the new treasury.");
      try { await saveInstanceMapping({email:onboarding.email ?? onboarding.authMethod ?? "social",walletAddress:account.address,instanceAddress:treasury}); } catch { /* optional projection */ }
      sessionStorage.setItem("fair-witness:new-treasury", treasury);
      navigate(`/signup/done?address=${treasury}`);
    } catch (err) { setError(humanError(err, "Treasury deployment failed. Please retry or review the transaction configuration.")); }
    finally { setBusy(false); }
  }

  return <Layout><main className="mx-auto max-w-4xl px-6 py-12">
    <p className="text-xs uppercase tracking-widest text-copper-400">Schema-v1 mandate</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Define what the agent may do</h1>
    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">These limits are constructor-set in your personal treasury. The AI can recommend EXECUTE or WAIT, but it cannot change assets, venue, sizing rules, strategy limits, or your policy.</p>
    <div className="mt-5"><SecurityBoundaryNotice /></div>
    {!onboarding && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">Sign in through Launch Fair Witness before deploying a treasury.</p>}
    <section className="mt-8 grid gap-6 md:grid-cols-2">
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Enabled strategies</legend>
        {STRATEGIES.map(strategy=><label key={strategy} className="mt-3 flex gap-3 text-sm text-ledger-200"><input type="checkbox" checked={draft.enabledStrategies[strategy]} onChange={e=>setDraft({...draft,enabledStrategies:{...draft.enabledStrategies,[strategy]:e.target.checked}})} />{strategy}</label>)}
      </fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Universal limits</legend>
        <Field label="Maximum action (stable units)" value={draft.maxActionValue} onChange={v=>setDraft({...draft,maxActionValue:v})}/>
        <Field label="Maximum slippage (bps)" value={draft.maxSlippageBps} type="number" onChange={v=>setNumber("maxSlippageBps",v)}/>
      </fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Portfolio mandate</legend>
        <Field label="Target WCTC (bps)" value={draft.targetWctcBps} type="number" onChange={v=>setNumber("targetWctcBps",v)}/>
        <Field label="Rebalance tolerance (bps)" value={draft.toleranceBps} type="number" onChange={v=>setNumber("toleranceBps",v)}/>
        <Field label="Maximum WCTC exposure (bps)" value={draft.maxWctcExposureBps} type="number" onChange={v=>setNumber("maxWctcExposureBps",v)}/>
      </fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><legend className="px-2 text-sm font-semibold text-ledger-200">Strategy limits</legend>
        <Field label="Minimum arbitrage net edge (bps)" value={draft.minNetEdgeBps} type="number" onChange={v=>setNumber("minNetEdgeBps",v)}/>
        <Field label="Maximum arbitrage value" value={draft.maxArbitrageValue} onChange={v=>setDraft({...draft,maxArbitrageValue:v})}/>
        <Field label="Maximum rebalance value" value={draft.maxRebalanceValue} onChange={v=>setDraft({...draft,maxRebalanceValue:v})}/>
        <Field label="Maximum risk-reduction value" value={draft.maxRiskReductionValue} onChange={v=>setDraft({...draft,maxRiskReductionValue:v})}/>
      </fieldset>
    </section>
    <button type="button" onClick={()=>setAdvanced(!advanced)} className="mt-6 text-sm text-copper-400">{advanced ? "Hide" : "Show"} advanced policy settings</button>
    {advanced && <section className="mt-4 grid gap-4 rounded-lg border border-ledger-700 bg-ledger-900 p-5 md:grid-cols-2">
      <Field label="Daily risk-reduction value" value={draft.dailyRiskReductionValue} onChange={v=>setDraft({...draft,dailyRiskReductionValue:v})}/>
      <Field label="Maximum source drift (bps)" value={draft.maxSourceDriftBps} type="number" onChange={v=>setNumber("maxSourceDriftBps",v)}/>
      <Field label="Maximum spot/TWAP deviation (bps)" value={draft.maxSpotTwapDeviationBps} type="number" onChange={v=>setNumber("maxSpotTwapDeviationBps",v)}/>
      <Field label="Attempts per epoch" value={draft.maxAttemptsPerEpoch} type="number" onChange={v=>setNumber("maxAttemptsPerEpoch",v)}/>
      <Field label="Executions per epoch" value={draft.maxExecutionsPerEpoch} type="number" onChange={v=>setNumber("maxExecutionsPerEpoch",v)}/>
      <Field label="Epoch length (seconds)" value={draft.epochLength} type="number" onChange={v=>setNumber("epochLength",v)}/>
    </section>}
    <section className="mt-8 rounded-lg border border-copper-700 bg-ledger-900 p-5"><h2 className="text-lg text-ledger-100">Deployment review</h2>
      <p className="mt-2 text-sm text-ledger-400">Owner: <span className="font-data break-all text-ledger-200">{onboarding?.walletAddress ?? "Not connected"}</span></p>
      <p className="mt-1 text-sm text-ledger-400">Factory: <span className="font-data break-all text-ledger-200">{config.factoryAddress || CONTROLLED_DEMO.destination.factory}</span></p>
      <p className="mt-1 text-sm text-ledger-400">Venue and assets are fixed by the factory adapter. New treasuries start PAUSED.</p>
      <p className="mt-1 text-sm text-ledger-400">Fair Witness tops up only onboarding gas on CC3; this user-controlled wallet still signs the deployment transaction.</p>
      {errors.length > 0 && <ul className="mt-4 list-disc pl-5 text-sm text-alert-400">{errors.map(e=><li key={e}>{e}</li>)}</ul>}
      {error && <p className="mt-4 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
      <button type="button" disabled={busy || errors.length>0 || !onboarding} onClick={()=>void deploy()} className="mt-5 rounded bg-copper-500 px-5 py-3 font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Preparing sponsored deployment…" : "Deploy my Fair Witness treasury"}</button>
    </section>
  </main></Layout>;
}

function Field({label,value,onChange,type="text"}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string}) { return <label className="mt-3 block text-xs text-ledger-400">{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100" /></label>; }

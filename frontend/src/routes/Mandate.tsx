import { useMemo, useState } from "react";
import { Layout } from "../components/layout";
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice";
import { DecisionTimeline } from "../components/DecisionTimeline";
import { STRATEGIES, validateMandate, type MandateDraft } from "../lib/policyUi";
import { CONTROLLED_DEMO } from "../lib/controlledDemo";
import { ControlledDemoNotice } from "../components/ControlledDemoNotice";

const INITIAL: MandateDraft = {
  capitalInstructions: "Fund the treasury only after reviewing its deployed policy hash.",
  enabledStrategies: { Arbitrage: true, Rebalancing: true, "Risk Reduction": true },
  targetWctcBps: 4000, toleranceBps: 500, maxWctcExposureBps: 6000,
  maxActionValue: "100", maxSlippageBps: 300,
  wctc: CONTROLLED_DEMO.destination.wctc, stable: CONTROLLED_DEMO.destination.stable, venue: CONTROLLED_DEMO.destination.adapter, automation: "Paused",
};

export default function Mandate() {
  const [draft, setDraft] = useState(INITIAL);
  const errors = useMemo(() => validateMandate(draft), [draft]);
  const numberField = (field: "targetWctcBps" | "toleranceBps" | "maxWctcExposureBps" | "maxSlippageBps", value: string) =>
    setDraft({ ...draft, [field]: Number(value) });
  return <Layout><main className="mx-auto max-w-4xl px-6 py-12">
    <p className="text-xs uppercase tracking-widest text-copper-400">Schema-v1 mandate planner</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Define the agent's mandate</h1>
    <p className="mt-3 text-sm leading-relaxed text-ledger-400">The controlled schema-v1 mandate is now deployed. This page displays and validates its demo defaults but does not modify on-chain policy.</p>
    <div className="mt-5"><ControlledDemoNotice /></div>
    <div className="mt-6"><SecurityBoundaryNotice /></div>
    <form className="mt-8 grid gap-6 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <legend className="px-2 text-sm font-semibold text-ledger-200">Capital and automation</legend>
        <label className="block text-xs text-ledger-400">Capital instructions<textarea value={draft.capitalInstructions} onChange={e => setDraft({...draft, capitalInstructions:e.target.value})} className="mt-1 min-h-24 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100" /></label>
        <label className="mt-4 block text-xs text-ledger-400">Initial mode<select value={draft.automation} onChange={e => setDraft({...draft, automation:e.target.value as MandateDraft["automation"]})} className="mt-1 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100"><option>Paused</option><option>Autonomous</option></select></label>
        <p className="mt-2 text-xs text-alert-400">Safe default: Paused. Only the owner can change automation mode; the change advances the policy epoch and hash.</p>
      </fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <legend className="px-2 text-sm font-semibold text-ledger-200">Enabled strategies</legend>
        {STRATEGIES.map(strategy => <label key={strategy} className="mt-3 flex items-center gap-3 text-sm text-ledger-200"><input type="checkbox" checked={draft.enabledStrategies[strategy]} onChange={e => setDraft({...draft, enabledStrategies:{...draft.enabledStrategies,[strategy]:e.target.checked}})} />{strategy}</label>)}
        <p className="mt-4 text-xs text-ledger-400">Priority: Risk Reduction → Rebalancing → Arbitrage. Execution invalidates lower-priority candidates for that snapshot.</p>
      </fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <legend className="px-2 text-sm font-semibold text-ledger-200">Allocation and risk (bps)</legend>
        {[["Target WCTC", "targetWctcBps"], ["Rebalance tolerance", "toleranceBps"], ["Maximum WCTC exposure", "maxWctcExposureBps"]].map(([label, field]) => <label key={field} className="mt-3 block text-xs text-ledger-400">{label}<input type="number" value={draft[field as keyof MandateDraft] as number} onChange={e => numberField(field as "targetWctcBps" | "toleranceBps" | "maxWctcExposureBps", e.target.value)} className="mt-1 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100" /></label>)}
      </fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <legend className="px-2 text-sm font-semibold text-ledger-200">Universal bounds</legend>
        <label className="block text-xs text-ledger-400">Maximum action value (stable units)<input value={draft.maxActionValue} onChange={e => setDraft({...draft,maxActionValue:e.target.value})} className="mt-1 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100" /></label>
        <label className="mt-3 block text-xs text-ledger-400">Maximum slippage (bps)<input type="number" value={draft.maxSlippageBps} onChange={e => numberField("maxSlippageBps",e.target.value)} className="mt-1 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100" /></label>
        <p className="mt-3 text-xs text-ledger-400">Protocol hard ceilings still apply even if this draft requests more.</p>
      </fieldset>
      <fieldset className="rounded-lg border border-ledger-700 bg-ledger-900 p-5 md:col-span-2">
        <legend className="px-2 text-sm font-semibold text-ledger-200">Allowed assets and venue</legend>
        {(["wctc","stable","venue"] as const).map(field => <label key={field} className="mt-3 block text-xs uppercase text-ledger-400">{field}<input value={draft[field]} onChange={e => setDraft({...draft,[field]:e.target.value})} className="font-data mt-1 w-full rounded border border-ledger-700 bg-ledger-950 p-2 text-ledger-100" /></label>)}
      </fieldset>
    </form>
    <section className="mt-6 rounded-lg border border-alert-500/30 bg-alert-500/5 p-5"><h2 className="text-sm font-semibold text-alert-400">Immutable deployment review</h2><p className="mt-2 text-xs text-ledger-300">Assets, venue, and numeric strategy policy are constructor-set in schema v1. Changing them requires a new treasury deployment and capital migration. Automation mode is the only owner-controlled operational switch.</p>{errors.length ? <ul className="mt-3 list-disc pl-5 text-xs text-alert-400">{errors.map(error => <li key={error}>{error}</li>)}</ul> : <p className="mt-3 text-xs text-verified-400">Draft passes client-side review. On-chain validation remains authoritative.</p>}</section>
    <section className="mt-10"><h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ledger-200">Strategy status</h2><div className="grid gap-3 md:grid-cols-3">{STRATEGIES.map(strategy => <article key={strategy} className="rounded-lg border border-ledger-700 bg-ledger-900 p-4"><h3 className="text-sm text-ledger-100">{strategy}</h3><p className={draft.enabledStrategies[strategy] ? "mt-2 text-xs text-verified-400" : "mt-2 text-xs text-ledger-500"}>{draft.enabledStrategies[strategy] ? `Enabled · ${draft.automation}` : "Disabled by mandate"}</p><p className="mt-2 text-xs text-ledger-400">No live portfolio snapshot — status is mandate preview only.</p></article>)}</div></section>
    <section className="mt-10"><h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ledger-200">Every decision remains reconstructable</h2><DecisionTimeline /></section>
  </main></Layout>;
}

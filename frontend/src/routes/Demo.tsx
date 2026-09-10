import { useState } from "react"
import { Layout } from "../components/layout"
import { ControlledDemoNotice } from "../components/ControlledDemoNotice"
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice"
import { CONTROLLED_DEMO, creditcoinTx, sepoliaTx } from "../lib/controlledDemo"
import { DEMO_STRATEGIES, submitDemoRequest, type DemoStrategy } from "../lib/demoRequest"

const scenarios = [
  { title: "Arbitrage", state: "Live evidence captured", text: "A controlled 1.15 source price produced a Gemini EXECUTE decision; policy independently derived a 1,234 bps net edge and exact 100 fwUSD input." },
  { title: "Rebalancing", state: "Live evidence captured", text: "Verified holdings measured 54.99% WCTC versus the 40% target. Policy independently derived and executed the bounded adjustment." },
  { title: "Risk Reduction", state: "Live evidence captured", text: "A valid reduction executed; a later 7,000 fwWCTC proposal was rejected against the roughly 50 fwWCTC policy maximum with protected state unchanged." },
]

export default function Demo() {
  const [submitting, setSubmitting] = useState<DemoStrategy | null>(null)
  const [requestResult, setRequestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function requestLiveDemo(strategy: DemoStrategy) {
    setSubmitting(strategy)
    setRequestResult(null)
    const result = await submitDemoRequest(strategy)
    setSubmitting(null)
    setRequestResult(result.ok
      ? { ok: true, message: `Request accepted. Reference: ${result.requestId}` }
      : { ok: false, message: result.error ?? "The request could not be submitted." })
  }

  return <Layout><main className="mx-auto max-w-5xl px-6 py-12">
    <p className="text-xs uppercase tracking-widest text-copper-400">Public testnet evidence</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Controlled strategy demonstrations</h1>
    <div className="mt-5"><ControlledDemoNotice /></div>
    <div className="mt-5"><SecurityBoundaryNotice /></div>
    <section className="mt-8 rounded-lg border border-copper-700 bg-ledger-900 p-5">
      <h2 className="text-lg text-ledger-100">Request a supervised live demonstration</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ledger-400">Anyone may request a scenario. A human operator reviews the queue and runs approved demonstrations using the protected operator environment. Submitting a request cannot authorize a transaction or access treasury keys.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {DEMO_STRATEGIES.map((strategy) => <button key={strategy} type="button" disabled={submitting !== null} onClick={() => void requestLiveDemo(strategy)} className="rounded-md border border-copper-500 px-4 py-2 text-sm text-copper-300 transition hover:bg-copper-500/10 disabled:cursor-not-allowed disabled:opacity-50">{submitting === strategy ? "Submitting…" : `Request ${strategy.replace("_", " ")}`}</button>)}
      </div>
      {requestResult && <p role="status" className={`mt-4 break-all text-sm ${requestResult.ok ? "text-verified-400" : "text-copper-400"}`}>{requestResult.message}</p>}
      <p className="mt-4 text-xs text-ledger-400">Latest completed public request: <span className="font-data">{CONTROLLED_DEMO.publicRequestSmoke.requestId}</span> → {CONTROLLED_DEMO.publicRequestSmoke.strategy} attempt {CONTROLLED_DEMO.publicRequestSmoke.attemptId} <a className="text-copper-400" href={creditcoinTx(CONTROLLED_DEMO.publicRequestSmoke.execution)} target="_blank" rel="noreferrer">execution receipt ↗</a></p>
    </section>
    <section className="mt-8 grid gap-4 md:grid-cols-3">{scenarios.map(item => <article key={item.title} className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><h2 className="text-lg text-ledger-100">{item.title}</h2><p className="mt-2 text-xs uppercase tracking-wide text-verified-400">{item.state}</p><p className="mt-3 text-sm leading-relaxed text-ledger-400">{item.text}</p></article>)}</section>
    <section className="mt-8 rounded-lg border border-ledger-700 bg-ledger-900 p-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-ledger-200">Frozen execution boundary</h2><dl className="mt-4 grid gap-3 text-xs md:grid-cols-2"><div><dt className="text-ledger-500">Treasury</dt><dd className="font-data break-all text-ledger-200">{CONTROLLED_DEMO.destination.treasury}</dd></div><div><dt className="text-ledger-500">Treasury owner</dt><dd className="font-data break-all text-ledger-200">{CONTROLLED_DEMO.owner}</dd></div><div><dt className="text-ledger-500">Registered agent</dt><dd className="font-data break-all text-ledger-200">{CONTROLLED_DEMO.agent}</dd></div><div><dt className="text-ledger-500">Fixed adapter</dt><dd className="font-data break-all text-ledger-200">{CONTROLLED_DEMO.destination.adapter}</dd></div></dl></section>
    <section className="mt-8 rounded-lg border border-ledger-700 bg-ledger-900 p-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-ledger-200">Genuine Attestcoin-backed evidence</h2><div className="mt-4 grid gap-5 text-sm md:grid-cols-3">
      <Evidence title="Arbitrage" source={CONTROLLED_DEMO.arbitrageSmoke.sourceObservation} confirmation={CONTROLLED_DEMO.arbitrageSmoke.confirmationObservation} outcome={CONTROLLED_DEMO.arbitrageSmoke.execution} outcomeLabel="Execution" />
      <Evidence title="Rebalancing" source={CONTROLLED_DEMO.rebalanceSmoke.sourceObservation} confirmation={CONTROLLED_DEMO.rebalanceSmoke.confirmationObservation} outcome={CONTROLLED_DEMO.rebalanceSmoke.execution} outcomeLabel="Execution" />
      <Evidence title="Risk reduction" source={CONTROLLED_DEMO.riskSmoke.sourceObservation} confirmation={CONTROLLED_DEMO.riskSmoke.confirmationObservation} outcome={CONTROLLED_DEMO.riskSmoke.execution} outcomeLabel="Valid execution" />
    </div><p className="mt-5 text-sm text-copper-400"><a href={creditcoinTx(CONTROLLED_DEMO.oversizedRiskRejection)} target="_blank" rel="noreferrer">Oversized risk proposal rejected on-chain ↗</a></p><p className="mt-3 text-xs text-ledger-400">The rebalancing AI selected REBALANCE/EXECUTE but described arbitrage in its rationale. Policy ignored that untrusted prose and authorized only the deterministic rebalance. This is direct evidence of the security boundary.</p></section>
  </main></Layout>
}

function Evidence({ title, source, confirmation, outcome, outcomeLabel }: { title: string; source: string; confirmation: string; outcome: string; outcomeLabel: string }) {
  return <div><h3 className="text-ledger-200">{title}</h3><ul className="mt-2 space-y-2 text-copper-400"><li><a href={sepoliaTx(source)} target="_blank" rel="noreferrer">Source observation ↗</a></li><li><a href={sepoliaTx(confirmation)} target="_blank" rel="noreferrer">Confirmation ↗</a></li><li><a href={creditcoinTx(outcome)} target="_blank" rel="noreferrer">{outcomeLabel} ↗</a></li></ul></div>
}

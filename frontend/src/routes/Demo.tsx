import { Layout } from "../components/layout"
import { ControlledDemoNotice } from "../components/ControlledDemoNotice"
import { SecurityBoundaryNotice } from "../components/SecurityBoundaryNotice"
import { CONTROLLED_DEMO, creditcoinTx, sepoliaTx } from "../lib/controlledDemo"

const scenarios = [
  { title: "Risk Reduction", state: "Executed + adversarial rejection", text: "Verified exposure crossed the risk boundary. A bounded reduction executed; a later 7,000 fwWCTC proposal was rejected against the deterministic policy maximum with protected state unchanged." },
  { title: "Rebalancing", state: "Executed", text: "Verified holdings measured 54.99% WCTC against a 40% target. Deterministic accounting derived the exact bounded adjustment; AI could only EXECUTE or WAIT." },
  { title: "Arbitrage", state: "Executed", text: "A controlled cross-market price discrepancy produced genuine Attestcoin proofs. Policy independently derived direction, net edge and exact permitted input before execution." },
]

export default function Demo() {
  return <Layout><main className="mx-auto max-w-5xl px-6 py-12">
    <p className="text-xs uppercase tracking-widest text-copper-400">Protocol evidence lab</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Inspect the security boundary on public testnets</h1>
    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">This page is evidence, not the product workflow. The self-service product begins at Launch Fair Witness. These receipts prove that the same schema-v1 boundary can execute allowed actions and reject an oversized AI proposal.</p>
    <div className="mt-5"><ControlledDemoNotice /></div>
    <div className="mt-5"><SecurityBoundaryNotice /></div>

    <section className="mt-8 grid gap-4 md:grid-cols-3">{scenarios.map(item => <article key={item.title} className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><h2 className="text-lg text-ledger-100">{item.title}</h2><p className="mt-2 text-xs uppercase tracking-wide text-verified-400">{item.state}</p><p className="mt-3 text-sm leading-relaxed text-ledger-400">{item.text}</p></article>)}</section>

    <section className="mt-8 rounded-lg border border-ledger-700 bg-ledger-900 p-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-ledger-200">Genuine Attestcoin-backed receipts</h2><div className="mt-4 grid gap-6 md:grid-cols-3">
      <Evidence title="Risk reduction" source={CONTROLLED_DEMO.riskSmoke.sourceObservation} confirmation={CONTROLLED_DEMO.riskSmoke.confirmationObservation} outcome={CONTROLLED_DEMO.riskSmoke.execution} />
      <Evidence title="Rebalancing" source={CONTROLLED_DEMO.rebalanceSmoke.sourceObservation} confirmation={CONTROLLED_DEMO.rebalanceSmoke.confirmationObservation} outcome={CONTROLLED_DEMO.rebalanceSmoke.execution} />
      <Evidence title="Arbitrage" source={CONTROLLED_DEMO.arbitrageSmoke.sourceObservation} confirmation={CONTROLLED_DEMO.arbitrageSmoke.confirmationObservation} outcome={CONTROLLED_DEMO.arbitrageSmoke.execution} />
    </div></section>

    <section className="mt-8 rounded-lg border border-alert-500/30 bg-alert-500/5 p-5"><h2 className="text-lg text-ledger-100">Adversarial proof: AI cannot exceed policy</h2><p className="mt-3 text-sm leading-relaxed text-ledger-300">An oversized Risk Reduction proposal attempted 7,000 fwWCTC. The treasury independently recomputed the policy limit, rejected the attempt and kept protected capital unchanged.</p><a className="mt-4 inline-block text-sm text-alert-400" href={creditcoinTx(CONTROLLED_DEMO.oversizedRiskRejection)} target="_blank" rel="noreferrer">Inspect rejection transaction ↗</a></section>

    <section className="mt-8 rounded-lg border border-copper-700 bg-ledger-900 p-5"><h2 className="text-lg text-ledger-100">What is controlled vs what is real</h2><p className="mt-3 text-sm leading-relaxed text-ledger-400">The V3 test markets and fwUSD/fwWCTC supply are controlled because no sufficiently active comparable market was available across the supported public testnets. The source transactions, Attestcoin proof generation, Creditcoin-side proof verification, semantic event validation, deterministic policy checks, treasury execution and replay protection are real public-testnet operations.</p><p className="mt-3 text-xs text-alert-400">No bridge, redemption, natural arbitrage, production liquidity or profitability is claimed.</p></section>
  </main></Layout>
}

function Evidence({ title, source, confirmation, outcome }: { title: string; source: string; confirmation: string; outcome: string }) {
  return <div><h3 className="text-ledger-200">{title}</h3><ul className="mt-2 space-y-2 text-sm text-copper-400"><li><a href={sepoliaTx(source)} target="_blank" rel="noreferrer">Source observation ↗</a></li><li><a href={sepoliaTx(confirmation)} target="_blank" rel="noreferrer">Confirmation observation ↗</a></li><li><a href={creditcoinTx(outcome)} target="_blank" rel="noreferrer">Treasury execution ↗</a></li></ul></div>
}

import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { NetworkIndicator } from "../components/networkIndicator";
import { CONTROLLED_DEMO, creditcoinTx } from "../lib/controlledDemo";

const BEATS = [
  { num: "01", title: "Own the treasury", desc: "Create a personal schema-v1 treasury from the permissionless factory. Your embedded wallet is the owner; Fair Witness and the AI never receive custody." },
  { num: "02", title: "Set an immutable mandate", desc: "Choose strategy, portfolio targets, exposure ceilings, action size, slippage and rate limits. The AI cannot change them." },
  { num: "03", title: "Act on verified cross-chain evidence", desc: "Attestcoin proofs bring source-chain market observations into Creditcoin. Deterministic strategy code derives the permitted candidate before AI sees it." },
  { num: "04", title: "AI proposes; policy authorizes", desc: "The AI returns only EXECUTE or WAIT. The treasury independently re-verifies evidence, portfolio state, direction, sizing, venue, freshness, replay and policy before funds can move." },
];

export default function Home() {
  return <Layout><div className="mx-auto max-w-5xl px-6">
    <section className="py-20 text-center">
      <div className="mb-6 flex justify-center"><NetworkIndicator /></div>
      <p className="text-xs uppercase tracking-[0.28em] text-copper-400">Attestcoin-powered autonomous finance</p>
      <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-bold leading-tight text-ledger-100 md:text-6xl">Give the agent intelligence. <span className="text-verified-400">Keep authority out of its hands.</span></h1>
      <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-ledger-400">Fair Witness is a trust-minimized execution boundary for autonomous financial agents on Creditcoin. Agents observe Attestcoin-verified cross-chain evidence and may propose financial actions, while deterministic on-chain policy keeps custody and execution authority outside the AI.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link to="/signup" className="rounded-md bg-copper-500 px-6 py-3 text-sm font-semibold text-ledger-950 hover:bg-copper-400">Launch Fair Witness</Link>
        <Link to="/evidence" className="rounded-md border border-ledger-600 px-6 py-3 text-sm font-semibold text-ledger-200 hover:border-verified-500/50 hover:text-verified-400">View verified executions</Link>
      </div>
    </section>

    <section className="border-t border-ledger-800 py-16">
      <h2 className="text-2xl font-semibold text-ledger-100">The security boundary in four steps</h2>
      <div className="mt-8 grid gap-6 md:grid-cols-2">{BEATS.map(beat=><article key={beat.num} className="rounded-lg border border-ledger-700 bg-ledger-900 p-6"><span className="text-3xl font-bold text-verified-500/30">{beat.num}</span><h3 className="mt-2 text-lg font-semibold text-ledger-100">{beat.title}</h3><p className="mt-2 text-sm leading-relaxed text-ledger-400">{beat.desc}</p></article>)}</div>
    </section>

    <section className="border-t border-ledger-800 py-16">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-copper-400">Public testnet receipts</p><h2 className="mt-2 text-2xl font-semibold text-ledger-100">The AI can be wrong without becoming dangerous</h2></div><Link to="/evidence" className="text-sm text-copper-400">Evidence lab →</Link></div>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Receipt title="Risk reduction rejected" hash={CONTROLLED_DEMO.oversizedRiskRejection} text="A 7,000 fwWCTC proposal exceeded deterministic policy. The treasury rejected it and protected state remained unchanged." />
        <Receipt title="Rebalancing executed" hash={CONTROLLED_DEMO.rebalanceSmoke.execution} text="Verified portfolio drift produced a bounded adjustment toward the constructor-set target." />
        <Receipt title="Arbitrage executed" hash={CONTROLLED_DEMO.arbitrageSmoke.execution} text="A verified cross-market discrepancy produced a policy-derived trade size; AI did not choose the execution terms." />
      </div>
    </section>

    <section className="border-t border-ledger-800 py-16">
      <h2 className="text-2xl font-semibold text-ledger-100">Controlled market, real verification path</h2>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ledger-400">No sufficiently active comparable market was available across the supported public testnets, so Fair Witness uses explicitly controlled V3 test markets. The market conditions are synthetic; the source-chain transactions, Attestcoin proofs, Creditcoin verification, deterministic policy checks, treasury execution and replay protection are real.</p>
      <p className="mt-3 max-w-3xl text-sm text-alert-400">The demo assets are not bridged, redeemable, pegged, production liquidity or a claim of economic profitability.</p>
    </section>

    <section className="border-t border-ledger-800 py-16 text-center"><h2 className="text-2xl font-semibold text-ledger-100">Create a treasury the agent cannot overrule.</h2><p className="mx-auto mt-3 max-w-2xl text-sm text-ledger-400">Start paused, review the mandate, authorize the bounded agent, fund test assets, then enable autonomy when you are ready.</p><Link to="/signup" className="mt-6 inline-block rounded-md bg-copper-500 px-6 py-3 text-sm font-semibold text-ledger-950">Launch Fair Witness</Link></section>
  </div></Layout>;
}

function Receipt({title,hash,text}:{title:string;hash:string;text:string}) { return <article className="rounded-lg border border-ledger-700 bg-ledger-900 p-5"><h3 className="text-lg text-ledger-100">{title}</h3><a href={creditcoinTx(hash)} target="_blank" rel="noreferrer" className="font-data mt-2 block text-xs text-verified-400">{hash.slice(0,16)}… ↗</a><p className="mt-3 text-sm leading-relaxed text-ledger-400">{text}</p></article>; }

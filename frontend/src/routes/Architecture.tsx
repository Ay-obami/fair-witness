import { NetworkIndicator } from "../components/networkIndicator";
import { Layout } from "../components/layout";
import { ControlledMarketBadge, ExecutionRail, LiveExecutionEngine } from "../components/ProductVisuals";

const LAYERS = [
  { code: "SRC", title: "Source-chain market", tone: "external", text: "A controlled Sepolia V3 market produces observable cross-chain state. Market conditions are synthetic for the demo; the observation itself is a real public-testnet transaction." },
  { code: "PRF", title: "Attestcoin evidence", tone: "verified", text: "Attestcoin proves the source observation so Creditcoin does not need to trust a private API, application database or the AI reasoning layer." },
  { code: "AI", title: "AI reasoning", tone: "copper", text: "The reasoning layer receives verified context and a deterministic candidate, then recommends EXECUTE or WAIT with rationale. It has no custody authority." },
  { code: "POL", title: "Deterministic policy gate", tone: "copper", text: "The treasury independently checks evidence freshness, source drift, destination conditions, strategy access, direction, sizing, slippage, rate limits, policy epoch, nonces and replay protection." },
  { code: "DEX", title: "Fixed execution adapter", tone: "verified", text: "Only a proposal that clears policy reaches the configured destination adapter. The AI cannot swap venues, change assets or invent unrestricted execution calldata." },
  { code: "JRN", title: "On-chain journal", tone: "verified", text: "Accepted, rejected and failed attempts remain security records. Historical journal data remains readable even after a treasury is permanently closed." },
];

export default function Architecture() {
  return <Layout><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -left-20 -top-24 h-72 w-72 bg-external-500/12" />
      <div className="fw-ambient-orb -right-20 -top-24 h-72 w-72 bg-verified-500/12" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_.72fr] lg:items-end">
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Trust architecture</p><NetworkIndicator /><ControlledMarketBadge /></div><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl lg:text-6xl">Intelligence stays outside. Authority stays on-chain.</h1><p className="mt-4 max-w-3xl text-sm leading-relaxed text-ledger-400">Fair Witness is designed around one separation: the AI may reason about what should happen, but only deterministic treasury policy may decide whether capital is allowed to move.</p></div>
        <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4"><ExecutionRail /><p className="mt-4 text-center text-[10px] uppercase tracking-[.18em] text-ledger-600">Observe → prove → reason → authorize → execute</p></div>
      </div>
    </header>

    <section className="mt-8 grid gap-8 lg:grid-cols-[.92fr_1.08fr] lg:items-start">
      <div className="lg:sticky lg:top-24"><LiveExecutionEngine /></div>
      <div className="space-y-4">
        {LAYERS.map((layer, index) => <article key={layer.code} className={`group relative overflow-hidden rounded-2xl border p-5 transition hover:-translate-y-0.5 ${layer.tone === "external" ? "border-external-500/25 bg-external-500/5" : layer.tone === "copper" ? "border-copper-500/25 bg-copper-500/5" : "border-verified-500/20 bg-verified-500/5"}`}>
          <div className="flex items-start gap-4"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border font-data text-[10px] ${layer.tone === "external" ? "border-external-500/25 text-external-400" : layer.tone === "copper" ? "border-copper-500/25 text-copper-400" : "border-verified-500/25 text-verified-400"}`}>{layer.code}</div><div><div className="flex flex-wrap items-center gap-2"><span className="font-data text-[9px] text-ledger-600">0{index + 1}</span><h2 className="text-xl font-semibold text-ledger-100">{layer.title}</h2></div><p className="mt-2 text-sm leading-relaxed text-ledger-400">{layer.text}</p></div></div>
          {layer.code === "POL" && <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-copper-400 via-verified-400 to-transparent" />}
        </article>)}
      </div>
    </section>

    <section className="mt-10 grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-copper-500/20 bg-copper-500/5 p-6"><div className="flex items-center justify-between gap-3"><p className="text-xl font-semibold text-ledger-100">Outside the authority boundary</p><span className="fw-status-chip text-[9px] text-copper-400">OFF-CHAIN</span></div><div className="mt-5 grid gap-3 text-sm text-ledger-300 sm:grid-cols-2"><p>• AI reasoning</p><p>• Human-readable rationale</p><p>• Opportunity ranking</p><p>• Candidate recommendation</p></div><p className="mt-5 text-xs leading-relaxed text-ledger-500">This layer can be wrong, manipulated or unavailable without gaining the ability to rewrite the mandate or withdraw funds.</p></div>
      <div className="rounded-3xl border border-verified-500/20 bg-verified-500/5 p-6"><div className="flex items-center justify-between gap-3"><p className="text-xl font-semibold text-ledger-100">Inside the authority boundary</p><span className="fw-status-chip text-[9px] text-verified-400"><span className="fw-status-dot" /> ON-CHAIN</span></div><div className="mt-5 grid gap-3 text-sm text-ledger-300 sm:grid-cols-2"><p>✓ Verified evidence</p><p>✓ Policy limits</p><p>✓ Treasury balances</p><p>✓ Execution + replay state</p></div><p className="mt-5 text-xs leading-relaxed text-ledger-500">This layer is the security boundary. Every proposal is re-derived and re-checked before capital may move.</p></div>
    </section>

    <section className="fw-glass mt-10 rounded-3xl p-6 sm:p-7">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-start"><div><p className="fw-kicker">Data flow summary</p><h2 className="mt-4 text-3xl font-semibold tracking-tight text-ledger-100">No hidden leap from AI output to transaction.</h2><p className="mt-3 text-sm leading-relaxed text-ledger-400">Each transition adds another independently checkable constraint.</p></div><ol className="space-y-3">{[
        "A source observation is created on Sepolia.",
        "Attestcoin makes that observation verifiable on Creditcoin.",
        "Deterministic strategy code derives a bounded candidate from current state.",
        "AI returns EXECUTE or WAIT plus rationale; it does not invent unrestricted transaction authority.",
        "The treasury performs a fresh on-chain policy preflight against current balances and policy state.",
        "Only an authorized action reaches the fixed adapter, and the result is journaled on-chain.",
      ].map((text,index)=><li key={text} className="flex gap-4 rounded-xl border border-ledger-800 bg-ledger-950/45 p-4"><span className="font-data text-xs text-copper-400">{String(index+1).padStart(2,"0")}</span><span className="text-sm leading-relaxed text-ledger-300">{text}</span></li>)}</ol></div>
    </section>
  </main></Layout>;
}

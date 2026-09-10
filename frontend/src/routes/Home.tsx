import { useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { NetworkIndicator } from "../components/networkIndicator";
import { CONTROLLED_DEMO, creditcoinTx } from "../lib/controlledDemo";

const PIPELINE = [
  { n: "01", title: "Cross-chain market", text: "Fair Witness observes a controlled Sepolia V3 market and records source-chain state." },
  { n: "02", title: "Attestcoin evidence", text: "Attestcoin proves the source observation so Creditcoin does not have to trust a private API or the AI." },
  { n: "03", title: "Deterministic strategy", text: "Risk Reduction, Rebalancing, then Arbitrage are evaluated in code. Candidate amounts and directions are derived before AI reasoning." },
  { n: "04", title: "AI recommendation", text: "Gemini receives the verified context and may return only EXECUTE or WAIT plus a rationale." },
  { n: "05", title: "On-chain authorization", text: "The treasury independently checks evidence, policy, balances, freshness, venue, sizing, direction, rate limits and replay protection." },
  { n: "06", title: "Execution + journal", text: "Approved actions execute through the fixed adapter. Accepted, rejected and failed attempts remain auditable on-chain." },
];

const STRATEGIES = [
  { title: "Risk Reduction", priority: "Priority 1", text: "When WCTC exposure breaches the user-defined ceiling, Fair Witness first considers reducing risk before pursuing any other opportunity.", rule: "Only acts when the risk threshold is actually breached." },
  { title: "Rebalancing", priority: "Priority 2", text: "When portfolio allocation leaves the configured target band, Fair Witness can move it back toward the user-defined WCTC target.", rule: "Only acts outside the rebalance tolerance." },
  { title: "Arbitrage", priority: "Priority 3", text: "When verified source and destination markets diverge enough, Fair Witness can execute a bounded trade if the net edge exceeds policy.", rule: "Only acts above the minimum arbitrage edge." },
];

const SAFEGUARDS = [
  "Allowed strategies",
  "Maximum action size",
  "Maximum slippage",
  "WCTC target allocation",
  "Maximum WCTC exposure",
  "Minimum arbitrage edge",
  "Evidence freshness and source drift",
  "Destination market deviation",
  "Attempts and executions per epoch",
  "Proposal, nonce and evidence replay protection",
];

const REJECTIONS = [
  { id: "oversize", label: "Oversized trade", result: "Amount exceeds policy", detail: "The proposed action is larger than the maximum value encoded in the treasury mandate. The treasury records the attempt and refuses execution." },
  { id: "stale", label: "Stale evidence", result: "Evidence is stale", detail: "The Attestcoin-backed observation falls outside the permitted freshness window. Old market truth cannot authorize a new trade." },
  { id: "slippage", label: "Excessive slippage", result: "Slippage exceeds policy", detail: "The proposal asks for more price impact than the owner allowed. The AI cannot raise the limit to make the trade pass." },
  { id: "replay", label: "Reused evidence", result: "Evidence already executed", detail: "Evidence that already authorized an execution cannot be used again. Replay protection is enforced by treasury state, not application memory." },
];

export default function Home() {
  const [rejection, setRejection] = useState(REJECTIONS[0]);

  return <Layout><div className="overflow-hidden">
    <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 md:pb-24 md:pt-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <div className="mb-6 flex"><NetworkIndicator /></div>
          <p className="text-xs uppercase tracking-[0.28em] text-copper-400">Attestcoin-powered autonomous finance on Creditcoin</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-bold leading-[1.04] text-ledger-100 md:text-7xl">Autonomous finance <span className="text-verified-400">without giving AI custody.</span></h1>
          <p className="mt-6 max-w-2xl text-xl leading-relaxed text-ledger-300">AI proposes. Deterministic policy authorizes. Treasury executes.</p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ledger-400">Fair Witness lets autonomous financial agents reason over Attestcoin-verified cross-chain evidence while a user-owned Creditcoin treasury remains the final authority over every movement of capital.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/signup" className="rounded-md bg-copper-500 px-6 py-3 text-sm font-semibold text-ledger-950 hover:bg-copper-400">Launch Fair Witness</Link>
            <a href="#how-it-works" className="rounded-md border border-ledger-600 px-6 py-3 text-sm font-semibold text-ledger-200 hover:border-verified-500/50 hover:text-verified-400">See how it works</a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ledger-400">
            <span>✓ Non-custodial</span><span>✓ Attestcoin verified</span><span>✓ On-chain policy</span><span>✓ Replay protected</span>
          </div>
        </div>

        <div className="rounded-2xl border border-verified-500/20 bg-ledger-900 p-6 shadow-2xl shadow-black/20">
          <p className="text-xs uppercase tracking-widest text-verified-400">Live decision boundary</p>
          <div className="mt-5 space-y-3">
            <FlowRow label="Evidence" value="Attestcoin verified" tone="good" />
            <FlowRow label="Strategy" value="Rebalancing" />
            <FlowRow label="AI recommendation" value="EXECUTE" />
            <FlowRow label="Policy" value="12 checks passed" tone="good" />
            <FlowRow label="Treasury" value="Authorized execution" tone="good" />
          </div>
          <div className="mt-6 rounded-lg border border-ledger-700 bg-ledger-950 p-4">
            <p className="text-xs text-ledger-500">Security invariant</p>
            <p className="mt-2 text-sm leading-relaxed text-ledger-200">The AI can be wrong, manipulated or overconfident. It still cannot change the mandate, custody funds, bypass verification or execute the same evidence twice.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="border-y border-ledger-800 bg-ledger-950/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-copper-400">Why Fair Witness exists</p>
          <h2 className="mt-3 text-3xl font-semibold text-ledger-100">Giving an AI a wallet turns reasoning mistakes into financial authority.</h2>
          <p className="mt-5 text-base leading-relaxed text-ledger-400">An autonomous agent can hallucinate, be manipulated by bad data, choose an oversized action, misunderstand transaction state or simply make a poor judgment. If the same agent also controls the wallet, intelligence and authority collapse into one failure domain.</p>
        </div>
        <div className="rounded-xl border border-alert-500/20 bg-alert-500/5 p-6">
          <p className="text-lg font-semibold text-ledger-100">Fair Witness separates them.</p>
          <p className="mt-3 text-base leading-relaxed text-ledger-300"><span className="text-verified-400">The AI is intelligent, but never authoritative.</span> Deterministic code derives candidates. The user fixes the policy. Attestcoin verifies evidence. The treasury decides whether capital may move.</p>
        </div>
      </div>
    </section>

    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20 md:py-24">
      <p className="text-xs uppercase tracking-widest text-copper-400">End-to-end architecture</p>
      <h2 className="mt-3 max-w-3xl text-3xl font-semibold text-ledger-100">From cross-chain fact to policy-constrained execution.</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PIPELINE.map((step, index)=><article key={step.n} className="relative rounded-xl border border-ledger-700 bg-ledger-900 p-6">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-verified-400">{step.n}</span>{index < PIPELINE.length-1 && <span className="text-ledger-600">→</span>}</div>
          <h3 className="mt-4 text-lg font-semibold text-ledger-100">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ledger-400">{step.text}</p>
        </article>)}
      </div>
    </section>

    <section className="border-y border-ledger-800 bg-ledger-900/40">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <p className="text-xs uppercase tracking-widest text-copper-400">Security boundary</p>
        <h2 className="mt-3 text-3xl font-semibold text-ledger-100">Authorization is not custody.</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-xl border border-verified-500/20 bg-verified-500/5 p-7"><h3 className="text-xl font-semibold text-verified-400">AI can</h3><div className="mt-5 space-y-3 text-sm text-ledger-300"><p>✓ Analyze verified market conditions</p><p>✓ Evaluate context and provide rationale</p><p>✓ Recommend EXECUTE or WAIT</p><p>✓ Propose one of the enabled strategies</p></div></article>
          <article className="rounded-xl border border-alert-500/20 bg-alert-500/5 p-7"><h3 className="text-xl font-semibold text-alert-400">AI cannot</h3><div className="mt-5 grid gap-3 text-sm text-ledger-300 sm:grid-cols-2"><p>× Withdraw user funds</p><p>× Change assets or venue</p><p>× Change policy limits</p><p>× Invent execution amounts</p><p>× Bypass Attestcoin checks</p><p>× Override risk thresholds</p><p>× Reuse executed evidence</p><p>× Unpause itself</p></div></article>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
      <p className="text-xs uppercase tracking-widest text-copper-400">Strategy coordinator</p>
      <h2 className="mt-3 text-3xl font-semibold text-ledger-100">Protect capital first. Optimize second.</h2>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ledger-400">The strategy order is deterministic: Risk Reduction → Rebalancing → Arbitrage. AI does not reshuffle that priority.</p>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">{STRATEGIES.map(s=><article key={s.title} className="rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-xs uppercase tracking-widest text-verified-400">{s.priority}</p><h3 className="mt-3 text-xl font-semibold text-ledger-100">{s.title}</h3><p className="mt-3 text-sm leading-relaxed text-ledger-400">{s.text}</p><p className="mt-5 rounded border border-ledger-700 bg-ledger-950 p-3 text-xs text-ledger-300">{s.rule}</p></article>)}</div>
    </section>

    <section id="safeguards" className="border-y border-ledger-800 bg-ledger-950/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[.9fr_1.1fr] md:py-24">
        <div><p className="text-xs uppercase tracking-widest text-copper-400">Deterministic mandate</p><h2 className="mt-3 text-3xl font-semibold text-ledger-100">The prompt is not the guardrail. The contract is.</h2><p className="mt-5 text-sm leading-relaxed text-ledger-400">Users choose their boundaries before enabling autonomy. These limits are encoded in the personal treasury and independently rechecked for every proposal.</p><Link to="/signup" className="mt-6 inline-block text-sm font-semibold text-copper-400">Create your mandate →</Link></div>
        <div className="grid gap-3 sm:grid-cols-2">{SAFEGUARDS.map(item=><div key={item} className="rounded-lg border border-ledger-700 bg-ledger-900 px-4 py-4 text-sm text-ledger-300">✓ {item}</div>)}</div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
      <div className="grid gap-10 lg:grid-cols-2">
        <div><p className="text-xs uppercase tracking-widest text-copper-400">Attestcoin integration</p><h2 className="mt-3 text-3xl font-semibold text-ledger-100">AI reasons about evidence that Creditcoin can verify.</h2><p className="mt-5 text-sm leading-relaxed text-ledger-400">Fair Witness publishes a source-chain market observation, obtains an Attestcoin proof, verifies that proof locally, and includes the resulting evidence commitment in the proposal. The Creditcoin treasury then independently verifies the same evidence before any execution can succeed.</p><p className="mt-4 text-sm leading-relaxed text-ledger-400">That means the AI is not trusted to report what happened on another chain. The evidence path is separate from the reasoning path.</p></div>
        <div className="space-y-3 rounded-xl border border-verified-500/20 bg-ledger-900 p-6"><FlowRow label="Source" value="Sepolia observation"/><FlowRow label="Proof" value="Attestcoin" tone="good"/><FlowRow label="Commitment" value="Evidence hash"/><FlowRow label="Destination" value="Creditcoin verification" tone="good"/><FlowRow label="Replay state" value="On-chain consumed evidence" tone="good"/></div>
      </div>
    </section>

    <section className="border-y border-ledger-800 bg-ledger-900/40">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <p className="text-xs uppercase tracking-widest text-copper-400">What if the AI is wrong?</p>
        <h2 className="mt-3 text-3xl font-semibold text-ledger-100">A bad recommendation can become an audit record instead of a bad trade.</h2>
        <div className="mt-9 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div className="grid gap-3">{REJECTIONS.map(item=><button key={item.id} type="button" onClick={()=>setRejection(item)} className={`rounded-lg border px-4 py-4 text-left text-sm transition ${rejection.id===item.id?"border-copper-500 bg-copper-500/10 text-copper-300":"border-ledger-700 bg-ledger-900 text-ledger-300 hover:border-ledger-600"}`}>{item.label}</button>)}</div>
          <article className="rounded-xl border border-alert-500/30 bg-alert-500/5 p-7"><p className="text-xs uppercase tracking-widest text-alert-400">Rejected by policy</p><h3 className="mt-3 text-2xl font-semibold text-ledger-100">{rejection.result}</h3><p className="mt-4 max-w-2xl text-sm leading-relaxed text-ledger-300">{rejection.detail}</p><div className="mt-6 rounded-lg border border-ledger-700 bg-ledger-950 p-4 text-xs text-ledger-400">Result: no unauthorized capital movement. The attempt remains independently inspectable.</div></article>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
      <p className="text-xs uppercase tracking-widest text-copper-400">Product flow</p><h2 className="mt-3 text-3xl font-semibold text-ledger-100">A usable autonomous agent, not only a protocol demo.</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["01","Sign in","Google, Apple or email creates a user-controlled embedded wallet."],
          ["02","Choose mandate","Select strategy, allocation and risk limits in human-readable terms."],
          ["03","Deploy + activate","Create a personal treasury, receive controlled test assets, authorize the bounded agent and enable autonomy."],
          ["04","Monitor","See balances, safeguards, decisions, rejected attempts, executions and explorer evidence from the dashboard."],
        ].map(([n,t,d])=><article key={n} className="rounded-xl border border-ledger-700 bg-ledger-900 p-5"><span className="text-xs text-verified-400">{n}</span><h3 className="mt-3 font-semibold text-ledger-100">{t}</h3><p className="mt-2 text-sm leading-relaxed text-ledger-400">{d}</p></article>)}
      </div>
    </section>

    <section className="border-y border-ledger-800 bg-ledger-950/60">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs uppercase tracking-widest text-copper-400">Public-testnet proof</p><h2 className="mt-3 text-3xl font-semibold text-ledger-100">Real verification and execution. Controlled market conditions.</h2></div><Link to="/evidence" className="text-sm text-copper-400">Open Evidence Lab →</Link></div>
        <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Receipt status="EXECUTED" title="Risk Reduction" hash={CONTROLLED_DEMO.riskSmoke.execution} text="Verified risk breach produced a bounded reduction in WCTC exposure." />
          <Receipt status="EXECUTED" title="Rebalancing" hash={CONTROLLED_DEMO.rebalanceSmoke.execution} text="Verified portfolio drift produced a bounded move toward the mandate target." />
          <Receipt status="EXECUTED" title="Arbitrage" hash={CONTROLLED_DEMO.arbitrageSmoke.execution} text="Verified cross-market discrepancy produced a policy-derived trade." />
          <Receipt status="REJECTED" title="Oversized Risk" hash={CONTROLLED_DEMO.oversizedRiskRejection} text="A deliberately oversized proposal was refused by deterministic treasury policy." />
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-xl border border-verified-500/20 bg-verified-500/5 p-6"><h3 className="text-lg font-semibold text-verified-400">Real</h3><p className="mt-3 text-sm leading-relaxed text-ledger-300">Sepolia transactions, Attestcoin proofs, Creditcoin verification, treasury contracts, deterministic policy checks, execution receipts, replay protection and the on-chain attempt journal.</p></article>
          <article className="rounded-xl border border-copper-500/20 bg-copper-500/5 p-6"><h3 className="text-lg font-semibold text-copper-400">Controlled</h3><p className="mt-3 text-sm leading-relaxed text-ledger-300">Demo tokens, V3 test liquidity and synthetic market conditions. No sufficiently active comparable public-testnet market existed for a repeatable live demo. The market setup is synthetic; the verification and execution path is not.</p></article>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-alert-400">Controlled assets do not imply a bridge, peg, redemption promise, production liquidity or guaranteed economic profitability.</p>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
      <p className="text-xs uppercase tracking-widest text-copper-400">Why this is different</p><h2 className="mt-3 text-3xl font-semibold text-ledger-100">A trading agent delegates authority to itself. Fair Witness does not.</h2>
      <div className="mt-9 overflow-hidden rounded-xl border border-ledger-700">
        <div className="grid grid-cols-[1fr_1fr_1fr] bg-ledger-900 text-sm font-semibold text-ledger-200"><div className="p-4">Control surface</div><div className="border-l border-ledger-700 p-4">Typical AI trading agent</div><div className="border-l border-ledger-700 p-4 text-verified-400">Fair Witness</div></div>
        {[
          ["Custody","AI or bot wallet controls funds","User owns a dedicated treasury"],
          ["Guardrail","Prompt and application logic","Deterministic on-chain policy"],
          ["External data","Often trusted directly","Attestcoin-verified evidence"],
          ["Transaction fields","Agent may choose arbitrary parameters","Deterministic proposal builder + treasury checks"],
          ["Replay protection","Application state","On-chain proposal, nonce and evidence state"],
          ["Failures","May be off-chain logs only","Rejected and failed attempts are journaled on-chain"],
        ].map(([k,a,b])=><div key={k} className="grid grid-cols-[1fr_1fr_1fr] border-t border-ledger-700 bg-ledger-950 text-sm"><div className="p-4 text-ledger-300">{k}</div><div className="border-l border-ledger-700 p-4 text-ledger-500">{a}</div><div className="border-l border-ledger-700 p-4 text-ledger-200">{b}</div></div>)}
      </div>
    </section>

    <section className="border-y border-ledger-800 bg-ledger-900/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2 md:py-24">
        <div><p className="text-xs uppercase tracking-widest text-copper-400">Division of responsibility</p><h2 className="mt-3 text-3xl font-semibold text-ledger-100">Gemini reasons. It does not construct authority.</h2><p className="mt-5 text-sm leading-relaxed text-ledger-400">Fair Witness deliberately keeps open-ended reasoning away from the fields that actually move capital.</p></div>
        <div className="grid gap-4">
          <Role title="Deterministic code" text="Chooses strategy priority, calculates candidate direction and amount, derives proposal fields and hashes evidence." />
          <Role title="Gemini" text="Receives verified context and returns EXECUTE or WAIT with a rationale. It does not choose arbitrary calldata." />
          <Role title="Treasury" text="Independently verifies evidence, market state, portfolio state, policy and replay protection before execution." />
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
      <div className="rounded-2xl border border-verified-500/20 bg-ledger-900 p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div><p className="text-xs uppercase tracking-widest text-verified-400">User control</p><h2 className="mt-3 text-3xl font-semibold text-ledger-100">The owner remains the owner.</h2><p className="mt-4 text-sm leading-relaxed text-ledger-400">Every user gets a personal treasury. The owner authorizes the bounded agent, can pause autonomous execution at any time, and keeps sole ownership. Agent registration grants proposal submission permission—not custody.</p></div>
          <div className="grid gap-3 text-sm text-ledger-300"><p className="rounded border border-ledger-700 bg-ledger-950 p-4">✓ You own the treasury</p><p className="rounded border border-ledger-700 bg-ledger-950 p-4">✓ AI cannot withdraw your funds</p><p className="rounded border border-ledger-700 bg-ledger-950 p-4">✓ AI cannot change your mandate</p><p className="rounded border border-ledger-700 bg-ledger-950 p-4">✓ You can pause autonomy at any time</p></div>
        </div>
      </div>
    </section>

    <section className="border-t border-ledger-800 bg-ledger-950">
      <div className="mx-auto max-w-5xl px-6 py-24 text-center"><p className="text-xs uppercase tracking-[0.28em] text-copper-400">Fair Witness</p><h2 className="mx-auto mt-4 max-w-3xl text-4xl font-bold text-ledger-100 md:text-5xl">Give AI intelligence, not authority.</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ledger-400">Create a user-owned treasury, define the rules, authorize the bounded agent and watch every decision remain accountable to verifiable evidence and deterministic policy.</p><div className="mt-8 flex flex-wrap justify-center gap-4"><Link to="/signup" className="rounded-md bg-copper-500 px-7 py-3 text-sm font-semibold text-ledger-950 hover:bg-copper-400">Launch Fair Witness</Link><a href="https://github.com/Ay-obami/fair-witness" target="_blank" rel="noreferrer" className="rounded-md border border-ledger-600 px-7 py-3 text-sm font-semibold text-ledger-200 hover:text-verified-400">Inspect the contracts ↗</a></div></div>
    </section>
  </div></Layout>;
}

function FlowRow({label,value,tone}:{label:string;value:string;tone?:"good"}) { return <div className="flex items-center justify-between gap-5 rounded-lg border border-ledger-700 bg-ledger-950 px-4 py-3 text-sm"><span className="text-ledger-500">{label}</span><span className={tone==="good"?"text-verified-400":"text-ledger-200"}>{value}</span></div>; }

function Receipt({status,title,hash,text}:{status:"EXECUTED"|"REJECTED";title:string;hash:string;text:string}) { return <article className="rounded-xl border border-ledger-700 bg-ledger-900 p-5"><p className={`text-xs font-semibold ${status==="EXECUTED"?"text-verified-400":"text-alert-400"}`}>{status} ✓</p><h3 className="mt-2 text-lg font-semibold text-ledger-100">{title}</h3><p className="mt-3 text-sm leading-relaxed text-ledger-400">{text}</p><a href={creditcoinTx(hash)} target="_blank" rel="noreferrer" className="font-data mt-4 block text-xs text-copper-400">{hash.slice(0,14)}… ↗</a></article>; }

function Role({title,text}:{title:string;text:string}) { return <article className="rounded-lg border border-ledger-700 bg-ledger-950 p-5"><h3 className="font-semibold text-ledger-100">{title}</h3><p className="mt-2 text-sm leading-relaxed text-ledger-400">{text}</p></article>; }

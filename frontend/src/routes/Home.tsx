import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { NetworkIndicator } from "../components/networkIndicator";
import { CONTROLLED_DEMO, creditcoinTx } from "../lib/controlledDemo";
import { useAuthSession } from "../lib/authSession";

const PIPELINE = [
  { n: "01", title: "Cross-chain market", text: "Fair Witness observes a controlled source-chain market and records source-chain state." },
  { n: "02", title: "Attestcoin evidence", text: "Attestcoin proves the source observation so Creditcoin does not have to trust a private API or the AI agent." },
  { n: "03", title: "Deterministic strategy", text: "Risk Reduction, Rebalancing, then Arbitrage are evaluated in code. Candidate amounts and directions are derived before AI reasoning." },
  { n: "04", title: "AI recommendation", text: "The reasoning layer receives verified context and may return only EXECUTE or WAIT plus a rationale." },
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

const HERO_MESSAGES = [
  {
    lead: "Autonomous finance",
    accent: "without giving AI custody.",
    supporting: "AI proposes. Deterministic policy authorizes. Treasury executes.",
  },
  {
    lead: "Cross-chain intelligence",
    accent: "grounded in verifiable evidence.",
    supporting: "Attestcoin proves what the agent sees before policy can authorize capital movement.",
  },
  {
    lead: "On-chain guardrails",
    accent: "the AI cannot rewrite.",
    supporting: "Sizing, slippage, strategy, freshness, replay protection and execution limits stay deterministic.",
  },
];

export default function Home() {
  const { account, resolving } = useAuthSession();
  const [heroIndex, setHeroIndex] = useState(0);
  const [rejectionIndex, setRejectionIndex] = useState(0);
  const rejection = REJECTIONS[rejectionIndex];
  const launchPath = account ? "/dashboard" : "/signup";

  useEffect(() => {
    const id = window.setInterval(() => setHeroIndex((current) => (current + 1) % HERO_MESSAGES.length), 5800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setRejectionIndex((current) => (current + 1) % REJECTIONS.length), 3600);
    return () => window.clearInterval(id);
  }, []);

  function scrollToHowItWorks() {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <Layout><div className="overflow-hidden">
    <section className="relative mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-16 md:pb-24 md:pt-24">
      <div className="pointer-events-none absolute -right-24 top-8 h-72 w-72 rounded-full bg-verified-500/5 blur-3xl sm:h-96 sm:w-96" />
      <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_.92fr] lg:gap-12">
        <div className="relative">
          <div className="mb-5 flex sm:mb-6"><NetworkIndicator /></div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-copper-400 sm:text-xs sm:tracking-[0.28em]">Attestcoin-powered autonomous finance on Creditcoin</p>
          <div className="relative mt-5 min-h-[10.5rem] sm:min-h-[11.5rem] md:min-h-[12.5rem]">
            {HERO_MESSAGES.map((message, index) => <h1
              key={message.lead}
              aria-hidden={index !== heroIndex}
              className={`absolute inset-0 max-w-4xl text-4xl font-bold leading-[1.04] text-ledger-100 transition-all duration-700 ease-out motion-reduce:transform-none motion-reduce:transition-none sm:text-5xl md:text-7xl ${index === heroIndex ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
            >
              {message.lead} <span className="text-verified-400">{message.accent}</span>
            </h1>)}
          </div>
          <div className="relative mt-4 min-h-[4.75rem] sm:mt-6 sm:min-h-[3.75rem]">
            {HERO_MESSAGES.map((message, index) => <p
              key={message.supporting}
              aria-hidden={index !== heroIndex}
              className={`absolute inset-x-0 top-0 max-w-2xl text-lg leading-relaxed text-ledger-300 transition-all delay-75 duration-700 ease-out motion-reduce:transform-none motion-reduce:transition-none sm:text-xl ${index === heroIndex ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
            >{message.supporting}</p>)}
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ledger-400 sm:text-base">Fair Witness lets autonomous financial agents reason over Attestcoin-verified cross-chain evidence while a user-owned Creditcoin treasury remains the final authority over every movement of capital.</p>
          <div className="mt-7 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap sm:gap-4">
            <Link
              to={launchPath}
              onClick={(event) => { if (resolving) event.preventDefault(); }}
              className={`rounded-lg bg-copper-500 px-6 py-3 text-center text-sm font-semibold text-ledger-950 transition hover:bg-copper-400 ${resolving ? "cursor-wait opacity-70" : ""}`}
            >{resolving ? "Checking session…" : account ? "Open dashboard" : "Launch Fair Witness"}</Link>
            <button type="button" onClick={scrollToHowItWorks} className="cursor-pointer rounded-lg border border-ledger-600 px-6 py-3 text-sm font-semibold text-ledger-200 transition hover:border-verified-500/50 hover:bg-ledger-900 hover:text-verified-400">See how it works ↓</button>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-ledger-400 sm:mt-8 sm:flex sm:flex-wrap sm:gap-x-6"><span>✓ Non-custodial</span><span>✓ Attestcoin verified</span><span>✓ On-chain policy</span><span>✓ Replay protected</span></div>
          <div className="mt-6 flex gap-2" aria-label="Hero message progress">{HERO_MESSAGES.map((_, index) => <button key={index} type="button" aria-label={`Show message ${index + 1}`} onClick={() => setHeroIndex(index)} className={`h-1.5 cursor-pointer rounded-full transition-all duration-500 ${index === heroIndex ? "w-9 bg-copper-400" : "w-4 bg-ledger-700 hover:bg-ledger-600"}`} />)}</div>
        </div>

        <div className="relative rounded-2xl border border-verified-500/20 bg-ledger-900 p-5 shadow-2xl shadow-black/20 sm:p-6">
          <div className="absolute right-5 top-5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-verified-400"><span className="h-2 w-2 animate-pulse rounded-full bg-verified-400" />Policy boundary</div>
          <p className="pr-28 text-xs uppercase tracking-widest text-verified-400">Live decision boundary</p>
          <div className="mt-5 space-y-3"><FlowRow label="Evidence" value="Attestcoin verified" tone="good"/><FlowRow label="Strategy" value="Rebalancing"/><FlowRow label="AI recommendation" value="EXECUTE"/><FlowRow label="Policy" value="12 checks passed" tone="good"/><FlowRow label="Treasury" value="Authorized execution" tone="good"/></div>
          <div className="mt-6 rounded-lg border border-ledger-700 bg-ledger-950 p-4"><p className="text-xs text-ledger-500">Security invariant</p><p className="mt-2 text-sm leading-relaxed text-ledger-200">The AI can be wrong, manipulated or overconfident. It still cannot change the mandate, custody funds, bypass verification or execute the same evidence twice.</p></div>
        </div>
      </div>
    </section>

    <section className="border-y border-ledger-800 bg-ledger-950/60"><div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-10"><div><p className="text-xs uppercase tracking-widest text-copper-400">Why Fair Witness exists</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">Giving an AI a wallet turns reasoning mistakes into financial authority.</h2><p className="mt-5 text-base leading-relaxed text-ledger-400">An autonomous agent can hallucinate, be manipulated by bad data, choose an oversized action, misunderstand transaction state or simply make a poor judgment. If the same agent also controls the wallet, intelligence and authority collapse into one failure domain.</p></div><div className="rounded-xl border border-alert-500/20 bg-alert-500/5 p-5 sm:p-6"><p className="text-lg font-semibold text-ledger-100">Fair Witness separates them.</p><p className="mt-3 text-base leading-relaxed text-ledger-300"><span className="text-verified-400">The AI is intelligent, but never authoritative.</span> Deterministic code derives candidates. The user fixes the policy. Attestcoin verifies evidence. The treasury decides whether capital may move.</p></div></div></section>

    <section id="how-it-works" className="scroll-mt-6 mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-widest text-copper-400">End-to-end architecture</p><h2 className="mt-3 max-w-3xl text-2xl font-semibold text-ledger-100 sm:text-3xl">From cross-chain fact to policy-constrained execution.</h2><div className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-2 lg:grid-cols-3">{PIPELINE.map((step,index)=><article key={step.n} className="relative rounded-xl border border-ledger-700 bg-ledger-900 p-5 sm:p-6"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-verified-400">{step.n}</span>{index<PIPELINE.length-1&&<span className="text-ledger-600">→</span>}</div><h3 className="mt-4 text-lg font-semibold text-ledger-100">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-ledger-400">{step.text}</p></article>)}</div></section>

    <section className="border-y border-ledger-800 bg-ledger-900/40"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-widest text-copper-400">Security boundary</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">Authorization is not custody.</h2><div className="mt-8 grid gap-5 sm:mt-10 md:grid-cols-2 md:gap-6"><article className="rounded-xl border border-verified-500/20 bg-verified-500/5 p-5 sm:p-7"><h3 className="text-xl font-semibold text-verified-400">AI can</h3><div className="mt-5 space-y-3 text-sm text-ledger-300"><p>✓ Analyze verified market conditions</p><p>✓ Evaluate context and provide rationale</p><p>✓ Recommend EXECUTE or WAIT</p><p>✓ Propose one of the enabled strategies</p></div></article><article className="rounded-xl border border-alert-500/20 bg-alert-500/5 p-5 sm:p-7"><h3 className="text-xl font-semibold text-alert-400">AI cannot</h3><div className="mt-5 grid gap-3 text-sm text-ledger-300 sm:grid-cols-2"><p>× Withdraw user funds</p><p>× Change assets or venue</p><p>× Change policy limits</p><p>× Invent execution amounts</p><p>× Bypass Attestcoin checks</p><p>× Override risk thresholds</p><p>× Reuse executed evidence</p><p>× Unpause itself</p></div></article></div></div></section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-widest text-copper-400">Strategy coordinator</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">Protect capital first. Optimize second.</h2><p className="mt-4 max-w-3xl text-sm leading-relaxed text-ledger-400">The strategy order is deterministic: Risk Reduction → Rebalancing → Arbitrage. AI does not reshuffle that priority.</p><div className="mt-8 grid gap-5 sm:mt-10 lg:grid-cols-3">{STRATEGIES.map(s=><article key={s.title} className="rounded-xl border border-ledger-700 bg-ledger-900 p-5 sm:p-6"><p className="text-xs uppercase tracking-widest text-verified-400">{s.priority}</p><h3 className="mt-3 text-xl font-semibold text-ledger-100">{s.title}</h3><p className="mt-3 text-sm leading-relaxed text-ledger-400">{s.text}</p><p className="mt-5 rounded border border-ledger-700 bg-ledger-950 p-3 text-xs text-ledger-300">{s.rule}</p></article>)}</div></section>

    <section id="safeguards" className="border-y border-ledger-800 bg-ledger-950/60"><div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:gap-10 md:py-24"><div><p className="text-xs uppercase tracking-widest text-copper-400">Deterministic mandate</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">The prompt is not the guardrail. The contract is.</h2><p className="mt-5 text-sm leading-relaxed text-ledger-400">Users choose their boundaries before enabling autonomy. These limits are encoded in the personal treasury and independently rechecked for every proposal.</p><Link to={account ? "/dashboard" : "/signup"} className="mt-6 inline-block text-sm font-semibold text-copper-400">{account ? "Open your treasury →" : "Create your mandate →"}</Link></div><div className="grid gap-3 sm:grid-cols-2">{SAFEGUARDS.map(item=><div key={item} className="rounded-lg border border-ledger-700 bg-ledger-900 px-4 py-4 text-sm text-ledger-300">✓ {item}</div>)}</div></div></section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><div className="grid gap-8 lg:grid-cols-2 lg:gap-10"><div><p className="text-xs uppercase tracking-widest text-copper-400">Attestcoin integration</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">The AI reasons about evidence that Creditcoin can verify.</h2><p className="mt-5 text-sm leading-relaxed text-ledger-400">Fair Witness publishes a source-chain market observation, obtains an Attestcoin proof, verifies that proof locally, and includes the resulting evidence commitment in the proposal. The Creditcoin treasury then independently verifies the same evidence before any execution can succeed.</p><p className="mt-4 text-sm leading-relaxed text-ledger-400">The reasoning layer is not trusted to report what happened on another chain. Evidence and reasoning remain separate trust domains.</p></div><div className="space-y-3 rounded-xl border border-verified-500/20 bg-ledger-900 p-5 sm:p-6"><FlowRow label="Source" value="Sepolia observation"/><FlowRow label="Proof" value="Attestcoin" tone="good"/><FlowRow label="Commitment" value="Evidence hash"/><FlowRow label="Destination" value="Creditcoin verification" tone="good"/><FlowRow label="Replay state" value="On-chain consumed evidence" tone="good"/></div></div></section>

    <section className="border-y border-ledger-800 bg-ledger-900/40"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-widest text-copper-400">What if the AI is wrong?</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">A bad recommendation can become an audit record instead of a bad trade.</h2><p className="mt-3 max-w-2xl text-sm text-ledger-500">This example rotates automatically. You can also select any policy failure to inspect it.</p><div className="mt-8 grid gap-5 lg:grid-cols-[.8fr_1.2fr] lg:gap-6"><div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1">{REJECTIONS.map((item,index)=><button key={item.id} type="button" onClick={()=>setRejectionIndex(index)} className={`cursor-pointer rounded-lg border px-3 py-3 text-left text-xs transition sm:px-4 sm:py-4 sm:text-sm ${rejection.id===item.id?"border-copper-500 bg-copper-500/10 text-copper-300":"border-ledger-700 bg-ledger-900 text-ledger-300 hover:border-ledger-600 hover:bg-ledger-800"}`}>{item.label}</button>)}</div><article key={rejection.id} className="rounded-xl border border-alert-500/30 bg-alert-500/5 p-5 transition-all duration-500 sm:p-7"><div className="flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-widest text-alert-400">Rejected by policy</p><span className="text-xs text-ledger-600">{rejectionIndex + 1}/{REJECTIONS.length}</span></div><h3 className="mt-3 text-xl font-semibold text-ledger-100 sm:text-2xl">{rejection.result}</h3><p className="mt-4 max-w-2xl text-sm leading-relaxed text-ledger-300">{rejection.detail}</p><div className="mt-6 rounded-lg border border-ledger-700 bg-ledger-950 p-4 text-xs text-ledger-400">Result: no unauthorized capital movement. The attempt remains independently inspectable.</div></article></div></div></section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-widest text-copper-400">Use the product</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">From sign-in to autonomous execution in a few controlled steps.</h2><div className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-2 lg:grid-cols-3">{["Sign in with Google, Apple or email","Choose a risk mandate","Deploy your personal treasury","Receive controlled test assets","Authorize the bounded agent","Enable autonomy and monitor decisions"].map((x,i)=><div key={x} className="rounded-xl border border-ledger-700 bg-ledger-900 p-5"><span className="text-xs text-verified-400">0{i+1}</span><p className="mt-3 text-sm text-ledger-200">{x}</p></div>)}</div></section>

    <section className="border-y border-ledger-800 bg-ledger-950/60"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-widest text-copper-400">Public testnet evidence</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">Executed and rejected paths are both independently inspectable.</h2><div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5"><Receipt title="Risk reduction" state="EXECUTED" hash={CONTROLLED_DEMO.riskSmoke.execution}/><Receipt title="Rebalancing" state="EXECUTED" hash={CONTROLLED_DEMO.rebalanceSmoke.execution}/><Receipt title="Arbitrage" state="EXECUTED" hash={CONTROLLED_DEMO.arbitrageSmoke.execution}/><Receipt title="Oversized proposal" state="REJECTED" hash={CONTROLLED_DEMO.oversizedRiskRejection}/></div></div></section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><div className="grid gap-8 lg:grid-cols-2"><div><p className="text-xs uppercase tracking-widest text-copper-400">What is real</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">Controlled markets. Real verification and execution.</h2><div className="mt-6 space-y-2 text-sm text-ledger-300"><p>✓ Creditcoin smart contracts</p><p>✓ Sepolia source observations</p><p>✓ Attestcoin proofs</p><p>✓ Deterministic policy checks</p><p>✓ Treasury execution</p><p>✓ On-chain attempt journal and replay protection</p></div></div><div className="rounded-xl border border-alert-500/20 bg-alert-500/5 p-5 sm:p-7"><p className="text-xs uppercase tracking-widest text-alert-400">Controlled for demonstration</p><p className="mt-4 text-sm leading-relaxed text-ledger-300">The demo uses controlled V3 markets, liquidity and test tokens because sufficiently active comparable liquidity was not available across the supported public testnets. The market conditions are synthetic; the verification and execution path is not.</p><p className="mt-4 text-xs leading-relaxed text-ledger-400">Demo assets do not imply a bridge, peg, redemption right, production liquidity or natural economic profitability.</p></div></div></section>

    <section className="border-y border-ledger-800 bg-ledger-900/40"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-widest text-copper-400">Why the architecture matters</p><div className="mt-8 overflow-x-auto rounded-xl border border-ledger-700"><div className="min-w-[680px]"><div className="grid grid-cols-3 bg-ledger-950 px-5 py-4 text-xs uppercase tracking-wider text-ledger-500"><span>Capability</span><span>Typical AI trading agent</span><span>Fair Witness</span></div>{[["Custody","AI-controlled wallet","User-owned treasury"],["Guardrail","Prompt / app logic","On-chain deterministic policy"],["External data","Trusted directly","Attestcoin-verified evidence"],["Execution fields","Agent may construct them","Deterministic proposal builder"],["Replay protection","Application state","On-chain state"],["Rejected attempts","Often invisible","Journaled on-chain"]].map(row=><div key={row[0]} className="grid grid-cols-3 border-t border-ledger-800 px-5 py-4 text-sm"><span className="text-ledger-300">{row[0]}</span><span className="text-ledger-500">{row[1]}</span><span className="text-verified-400">{row[2]}</span></div>)}</div></div></div></section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-24"><div className="grid gap-8 lg:grid-cols-2"><div><p className="text-xs uppercase tracking-widest text-copper-400">Division of responsibility</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100 sm:text-3xl">The AI reasons. It does not construct arbitrary transactions.</h2></div><div className="space-y-4"><Responsibility title="Deterministic code" text="Selects the highest-priority eligible strategy, derives direction and bounded candidate values, and constructs proposal fields."/><Responsibility title="AI reasoning layer" text="Reviews verified context and returns a constrained EXECUTE or WAIT recommendation with rationale."/><Responsibility title="Creditcoin treasury" text="Independently verifies evidence, policy, portfolio state, sizing, replay protections and execution conditions before capital can move."/></div></div></section>

    <section className="border-t border-ledger-800 bg-ledger-950/60"><div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20 md:py-24"><p className="text-xs uppercase tracking-[0.28em] text-copper-400">Fair Witness</p><h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold text-ledger-100 sm:text-4xl md:text-5xl">Give AI intelligence, <span className="text-verified-400">not authority.</span></h2><p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-ledger-400">Create a treasury you own, define the mandate once, and let autonomous agents operate only inside rules they cannot rewrite.</p><div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-4"><Link to={launchPath} onClick={(event)=>{if(resolving) event.preventDefault();}} className={`rounded-lg bg-copper-500 px-6 py-3 text-sm font-semibold text-ledger-950 ${resolving ? "cursor-wait opacity-70" : "hover:bg-copper-400"}`}>{resolving ? "Checking session…" : account ? "Open dashboard" : "Launch Fair Witness"}</Link><a href={`https://creditcoin-testnet.blockscout.com/address/${CONTROLLED_DEMO.destination.factory}`} target="_blank" rel="noreferrer" className="rounded-lg border border-ledger-600 px-6 py-3 text-sm font-semibold text-ledger-200 transition hover:border-copper-500">Inspect the contracts ↗</a></div></div></section>
  </div></Layout>;
}

function FlowRow({label,value,tone}:{label:string;value:string;tone?:"good"}) { return <div className="flex items-center justify-between gap-3 rounded-lg border border-ledger-700 bg-ledger-950 px-3 py-3 text-sm sm:px-4"><span className="text-ledger-500">{label}</span><span className={`text-right ${tone==="good"?"text-verified-400":"text-ledger-200"}`}>{value}</span></div>; }
function Receipt({title,state,hash}:{title:string;state:"EXECUTED"|"REJECTED";hash:string}) { return <article className="rounded-xl border border-ledger-700 bg-ledger-900 p-5"><p className={state==="EXECUTED"?"text-xs font-semibold text-verified-400":"text-xs font-semibold text-alert-400"}>{state} ✓</p><h3 className="mt-3 text-lg text-ledger-100">{title}</h3><a href={creditcoinTx(hash)} target="_blank" rel="noreferrer" className="font-data mt-4 block break-all text-xs text-copper-400">{hash.slice(0,14)}… ↗</a></article>; }
function Responsibility({title,text}:{title:string;text:string}) { return <article className="rounded-xl border border-ledger-700 bg-ledger-900 p-5"><h3 className="font-semibold text-ledger-100">{title}</h3><p className="mt-2 text-sm leading-relaxed text-ledger-400">{text}</p></article>; }

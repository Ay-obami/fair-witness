import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { NetworkIndicator } from "../components/networkIndicator";
import { ControlledMarketBadge, DecisionSequence, ExecutionRail, LiveExecutionEngine, ProductMetric, RealityStrip } from "../components/ProductVisuals";
import { CONTROLLED_DEMO, creditcoinTx } from "../lib/controlledDemo";
import { useAuthSession } from "../lib/authSession";

const HERO_MESSAGES = [
  { lead: "Autonomous finance", accent: "without giving AI custody.", supporting: "AI proposes. Deterministic policy authorizes. Treasury executes." },
  { lead: "Cross-chain intelligence", accent: "grounded in verifiable evidence.", supporting: "Attestcoin proves what the agent sees before policy can authorize capital movement." },
  { lead: "On-chain guardrails", accent: "the AI cannot rewrite.", supporting: "Sizing, slippage, strategy, freshness, replay protection and execution limits stay deterministic." },
];

const PIPELINE = [
  { n: "01", title: "Observe", text: "A source-chain market observation is created from the controlled Sepolia V3 market." },
  { n: "02", title: "Prove", text: "Attestcoin verifies the observation so the destination never has to trust a private API or AI memory." },
  { n: "03", title: "Derive", text: "Deterministic strategy code computes direction and maximum permissible action before reasoning begins." },
  { n: "04", title: "Reason", text: "The AI may recommend EXECUTE or WAIT and explain why. It never chooses unrestricted transaction authority." },
  { n: "05", title: "Authorize", text: "The treasury checks venue, freshness, balances, sizing, slippage, rate limits and replay protection." },
  { n: "06", title: "Execute", text: "Only an authorized proposal reaches the fixed adapter. Every accepted, rejected or failed attempt remains auditable." },
];

const STRATEGIES = [
  { priority: "01", title: "Risk Reduction", text: "Reduce WCTC exposure when the mandate-defined ceiling is breached.", rule: "Capital protection wins priority." },
  { priority: "02", title: "Rebalancing", text: "Restore allocation toward the owner-defined target when the portfolio leaves tolerance.", rule: "Only outside the allowed band." },
  { priority: "03", title: "Arbitrage", text: "Capture a verified market divergence only when the net edge clears policy.", rule: "Opportunity comes after safety." },
];

const REJECTIONS = [
  { title: "Oversized trade", reason: "Amount exceeds the owner-defined policy ceiling." },
  { title: "Stale evidence", reason: "Old market truth cannot authorize a new movement of capital." },
  { title: "Excessive slippage", reason: "The proposal asks for more price impact than the mandate allows." },
  { title: "Reused evidence", reason: "An execution proof cannot authorize the same action twice." },
];

export default function Home() {
  const { account, resolving } = useAuthSession();
  const [heroIndex, setHeroIndex] = useState(0);
  const [rejectionIndex, setRejectionIndex] = useState(0);
  const launchPath = account ? "/dashboard" : "/signup";
  const heroMessage = HERO_MESSAGES[heroIndex];

  useEffect(() => {
    const id = window.setInterval(() => setHeroIndex((current) => (current + 1) % HERO_MESSAGES.length), 5600);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setRejectionIndex((current) => (current + 1) % REJECTIONS.length), 3400);
    return () => window.clearInterval(id);
  }, []);

  return <Layout><div className="overflow-hidden">
    <section className="relative mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-14 lg:pb-24 lg:pt-20 xl:pb-28 xl:pt-24">
      <div className="fw-ambient-orb -left-40 top-0 h-96 w-96 bg-copper-500/20" />
      <div className="fw-ambient-orb -right-44 top-20 h-[30rem] w-[30rem] bg-verified-500/15" />
      <div className="grid items-start gap-10 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:gap-12 xl:gap-16">
        <div className="relative z-10 min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-2.5 sm:gap-3"><NetworkIndicator /><ControlledMarketBadge /></div>
          <p className="fw-kicker max-w-full">Attestcoin-powered autonomous finance on Creditcoin</p>

          <div key={heroMessage.lead} className="fw-hero-copy mt-5 min-w-0" data-active="true">
            <h1 className="fw-hero-title max-w-4xl text-[2.9rem] font-semibold leading-[.98] text-ledger-100 min-[390px]:text-[3.25rem] sm:text-[4.1rem] lg:text-[4.45rem] xl:text-[5rem]">
              {heroMessage.lead} {heroMessage.accent}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ledger-300 sm:text-lg xl:text-xl">{heroMessage.supporting}</p>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ledger-400 sm:text-base">Fair Witness separates intelligence from authority. Autonomous agents reason over verified cross-chain evidence while a user-owned Creditcoin treasury remains the final authority over every movement of capital.</p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link to={launchPath} onClick={(event) => { if (resolving) event.preventDefault(); }} className="fw-primary-button rounded-xl px-6 py-3.5 text-center text-sm font-semibold">
              {resolving ? "Checking session…" : account ? "Open dashboard →" : "Launch app →"}
            </Link>
            <a href="#how-it-works" className="fw-secondary-button rounded-xl px-6 py-3.5 text-center text-sm font-semibold text-ledger-200">Explore the execution path ↓</a>
          </div>

          <div className="mt-5"><RealityStrip /></div>
          <div className="mt-4 flex gap-2" aria-label="Hero message progress">{HERO_MESSAGES.map((_, index) => <button key={index} type="button" aria-label={`Show message ${index + 1}`} onClick={() => setHeroIndex(index)} className={`h-1.5 cursor-pointer rounded-full transition-all duration-500 ${index === heroIndex ? "w-10 bg-copper-400" : "w-4 bg-ledger-700 hover:bg-ledger-600"}`} />)}</div>
        </div>

        <div className="relative z-10 min-w-0 lg:pl-2 xl:pl-4">
          <div className="mb-3 flex items-center justify-between lg:hidden"><p className="text-[10px] uppercase tracking-[.2em] text-ledger-500">Live execution path</p><span className="font-data text-[10px] text-verified-400">PUBLIC TESTNET</span></div>
          <div className="fw-float"><LiveExecutionEngine /></div>
        </div>
      </div>
    </section>

    <div className="fw-section-divider" />

    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:gap-16">
        <div>
          <p className="fw-kicker">The failure domain</p>
          <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-ledger-100 sm:text-4xl lg:text-5xl">A smart agent should never be its own final authority.</h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ledger-400">Agents can hallucinate, overfit noisy market data, misunderstand transaction state or be manipulated by inputs. When the same process also controls the wallet, a reasoning failure becomes a custody failure.</p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ledger-300"><span className="text-verified-400">Fair Witness breaks that coupling.</span> The AI may be intelligent and still be denied execution.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ProductMetric eyebrow="AI authority" value="0 custody" detail="The reasoning layer never receives unrestricted withdrawal authority." icon="AI" />
          <ProductMetric eyebrow="Policy boundary" value="Deterministic" detail="Limits live in contract state, not in a prompt or application memory." icon="POL" />
          <ProductMetric eyebrow="Evidence" value="Attested" detail="Cross-chain observations are verified before they may authorize capital movement." icon="PRF" />
          <ProductMetric eyebrow="Execution history" value="On-chain" detail="Accepted, rejected and failed attempts remain inspectable after the fact." icon="TX" />
        </div>
      </div>
    </section>

    <section id="how-it-works" className="relative scroll-mt-20 border-y border-ledger-800 bg-ledger-950/70">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
        <div className="max-w-3xl">
          <p className="fw-kicker">From fact to transaction</p>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-ledger-100 sm:text-4xl">One execution path. Five independent trust boundaries.</h2>
          <p className="mt-4 text-base leading-relaxed text-ledger-400">The product is easiest to understand as a control plane: observe, prove, reason, authorize, execute.</p>
        </div>
        <div className="mt-8 rounded-2xl border border-ledger-800 bg-ledger-900/55 p-4 sm:mt-10 sm:rounded-3xl sm:p-7 lg:p-8"><ExecutionRail /></div>
        <div className="mt-8 grid gap-x-8 gap-y-8 sm:gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map(step => <article key={step.n} className="group relative border-l border-ledger-700 pl-5 transition hover:border-copper-500/60">
            <span className="font-data text-xs text-copper-400">{step.n}</span>
            <h3 className="mt-2 text-xl font-semibold text-ledger-100">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ledger-400">{step.text}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-14">
        <div>
          <p className="fw-kicker">The security boundary</p>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-ledger-100 sm:text-4xl">The AI can propose. The gate decides.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-verified-500/20 bg-verified-500/5 p-5"><p className="text-sm font-semibold text-verified-400">AI can</p><div className="mt-4 space-y-3 text-sm text-ledger-300"><p>✓ Analyze verified conditions</p><p>✓ Produce rationale</p><p>✓ Recommend EXECUTE or WAIT</p><p>✓ Select an enabled strategy candidate</p></div></div>
            <div className="rounded-2xl border border-alert-500/20 bg-alert-500/5 p-5"><p className="text-sm font-semibold text-alert-400">AI cannot</p><div className="mt-4 space-y-3 text-sm text-ledger-300"><p>× Withdraw owner funds</p><p>× Raise policy limits</p><p>× Bypass Attestcoin verification</p><p>× Reuse executed evidence</p></div></div>
          </div>
        </div>
        <div className="fw-glass rounded-3xl p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.2em] text-ledger-500">Live policy demonstration</p><h3 className="mt-2 text-xl font-semibold text-ledger-100">A bad proposal reaches the gate — and stops.</h3></div><span className="self-start rounded-full border border-alert-500/25 bg-alert-500/5 px-2.5 py-1 text-[9px] uppercase tracking-widest text-alert-400">blocked</span></div>
          <div className="mt-5"><DecisionSequence blocked result="BLOCKED" reason={REJECTIONS[rejectionIndex].reason} /></div>
          <div className="mt-4 flex flex-wrap gap-2">{REJECTIONS.map((item, index) => <button key={item.title} onClick={() => setRejectionIndex(index)} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[10px] transition ${index === rejectionIndex ? "border-alert-500/35 bg-alert-500/10 text-alert-400" : "border-ledger-800 text-ledger-500 hover:text-ledger-300"}`}>{item.title}</button>)}</div>
        </div>
      </div>
    </section>

    <section className="border-y border-ledger-800 bg-ledger-900/35">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
        <p className="fw-kicker">Strategy coordinator</p>
        <div className="mt-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><h2 className="text-3xl font-semibold tracking-tight text-ledger-100 sm:text-4xl">Protect capital first. Optimize second.</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ledger-400">Strategy order is deterministic. AI never reshuffles the hierarchy.</p></div><p className="font-data text-xs text-ledger-500">RISK → REBALANCE → ARBITRAGE</p></div>
        <div className="relative mt-10 grid gap-0 lg:grid-cols-3">
          {STRATEGIES.map((strategy, index) => <div key={strategy.title} className={`relative border border-ledger-800 p-6 ${index === 0 ? "rounded-t-2xl lg:rounded-l-2xl lg:rounded-tr-none" : index === STRATEGIES.length - 1 ? "rounded-b-2xl lg:rounded-r-2xl lg:rounded-bl-none" : ""} ${index > 0 ? "-mt-px lg:-ml-px lg:mt-0" : ""}`}>
            <span className="font-data text-4xl font-semibold text-ledger-800">{strategy.priority}</span><p className="mt-5 text-xs uppercase tracking-widest text-copper-400">Priority {Number(strategy.priority)}</p><h3 className="mt-2 text-xl font-semibold text-ledger-100">{strategy.title}</h3><p className="mt-3 text-sm leading-relaxed text-ledger-400">{strategy.text}</p><p className="mt-5 text-xs text-verified-400">{strategy.rule}</p>
          </div>)}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-16">
        <div className="fw-glass rounded-3xl p-5 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.2em] text-ledger-500">Treasury command center</p><h3 className="mt-2 text-2xl font-semibold text-ledger-100">Agent active</h3></div><span className="fw-status-chip self-start text-[10px] sm:self-auto"><span className="fw-status-dot" /> AUTONOMOUS</span></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3"><ProductMetric eyebrow="Allocation" value="40.2%" detail="WCTC target 40%" /><ProductMetric eyebrow="Latest decision" value="Executed" detail="Rebalancing · policy passed" /><ProductMetric eyebrow="Evidence" value="Fresh" detail="Attestcoin verified" /></div>
          <div className="mt-6 rounded-2xl border border-ledger-800 bg-ledger-950/60 p-4"><ExecutionRail active={5} /></div>
          <div className="mt-5"><DecisionSequence reason="AI proposed a deterministic rebalance candidate. Policy checks passed before the treasury authorized execution." /></div>
        </div>
        <div>
          <p className="fw-kicker">A product you can inspect</p>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-ledger-100 sm:text-4xl">It observed. It proved. It reasoned. It still needed permission.</h2>
          <p className="mt-5 text-base leading-relaxed text-ledger-400">The dashboard is not a black-box performance screen. It is a command center for ownership, policy state, treasury balances and decision provenance.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><Link to="/dashboard" className="fw-primary-button rounded-xl px-5 py-3 text-center text-sm font-semibold">Open dashboard →</Link><Link to="/activity" className="fw-secondary-button rounded-xl px-5 py-3 text-center text-sm font-semibold text-ledger-200">Inspect activity</Link></div>
        </div>
      </div>
    </section>

    <section className="border-t border-ledger-800 bg-ledger-950/80">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div><p className="fw-kicker">Public-testnet evidence</p><h2 className="mt-5 text-3xl font-semibold tracking-tight text-ledger-100 sm:text-4xl">The market is controlled. The verification path is not.</h2><p className="mt-4 max-w-3xl text-sm leading-relaxed text-ledger-400">Fair Witness uses explicitly controlled V3 test markets because no sufficiently active comparable public-testnet market existed. Cross-chain transactions, Attestcoin proofs, Creditcoin verification and treasury execution remain real.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col"><a href={creditcoinTx(CONTROLLED_DEMO.rebalanceSmoke.execution)} target="_blank" rel="noreferrer" className="fw-secondary-button rounded-xl px-5 py-3 text-center text-sm font-semibold text-ledger-200">View execution receipt ↗</a><Link to="/architecture" className="fw-secondary-button rounded-xl px-5 py-3 text-center text-sm font-semibold text-ledger-200">View architecture →</Link></div>
        </div>
      </div>
    </section>
  </div></Layout>;
}

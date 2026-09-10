// Fair Witness landing page — forensic-ledger aesthetic, honest pitch, real proof.
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { NetworkIndicator } from "../components/networkIndicator";
import { CONTROLLED_DEMO, creditcoinTx } from "../lib/controlledDemo";

const BEATS = [
  { num: "01", title: "Give the agent a bounded mandate",
    desc: "Choose allowed strategies, assets and venue, portfolio targets, risk caps, action size, slippage and automation. Schema-v1 policy is constructor-set; changing it requires redeployment." },
  { num: "02", title: "It evaluates three strategies",
    desc: "Verified observations can support arbitrage, portfolio rebalancing, or risk reduction. Deterministic accounting calculates every permitted amount; the AI may only choose EXECUTE or WAIT." },
  { num: "03", title: "It proves before it acts",
    desc: "Before any trade, the agent generates cryptographic inclusion proofs for both prices and submits them to your contract. The contract verifies the proofs independently." },
  { num: "04", title: "You check in whenever you like",
    desc: "Schema-v1 records accepted, rejected, and execution-failed attempts on-chain. Its Supabase projection links observation, evidence, AI decision, proposal, policy result and execution without becoming the authorization boundary." },
];

export default function Home() {
  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-6">
        <section className="py-20 text-center">
          <div className="mb-6 flex justify-center">
            <NetworkIndicator />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight text-ledger-100">
            An AI agent that can't <span className="text-verified-400">lie</span> about why it traded.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ledger-400">
            Fair Witness is a trust-minimized execution boundary for autonomous financial agents. Your funds sit in a treasury only you own.
            An AI agent decides <em>whether</em> to trade — never <em>how</em>, and never with your key.
            Deterministic policy—not the AI—authorizes execution, with every schema-v1 attempt independently auditable.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-alert-400">
            This is explicitly <strong>not</strong> a speed-competitive trading bot. It will not beat MEV bots
            on execution latency, and it does not promise returns. It is a proof-of-concept for a new trust model.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link to="/demo" className="rounded-md bg-copper-500 px-6 py-3 text-sm font-semibold text-text-primary hover:bg-copper-400 transition">Explore the live demo</Link>
            <Link to="/mandate" className="rounded-md border border-ledger-600 px-6 py-3 text-sm font-semibold text-ledger-200 hover:border-verified-500/50 hover:text-verified-400 transition">Review the mandate</Link>
          </div>
        </section>

        {/* Proof section */}
        <section className="border-t border-ledger-800 py-16">
          <h2 className="text-2xl font-semibold text-ledger-100">Proof it's real</h2>
          <p className="mt-2 text-sm text-ledger-400">
            The schema-v1 three-strategy boundary is deployed on public testnets. These
            receipts show deterministic execution and rejection using genuine Attestcoin-backed evidence.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
              <p className="text-xs uppercase tracking-wide text-ledger-400">Arbitrage execution</p>
              <a href={creditcoinTx(CONTROLLED_DEMO.arbitrageSmoke.execution)} target="_blank" rel="noopener noreferrer" className="font-data mt-2 block text-xs text-verified-400 hover:underline break-all">{CONTROLLED_DEMO.arbitrageSmoke.execution.slice(0, 14)}…</a>
              <p className="mt-3 text-xs leading-relaxed text-ledger-400">Gemini proposed EXECUTE; deterministic policy derived the amount and authorized the controlled swap.</p>
            </div>
            <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
              <p className="text-xs uppercase tracking-wide text-ledger-400">Rebalancing execution</p>
              <a href={creditcoinTx(CONTROLLED_DEMO.rebalanceSmoke.execution)} target="_blank" rel="noopener noreferrer" className="font-data mt-2 block text-xs text-verified-400 hover:underline break-all">{CONTROLLED_DEMO.rebalanceSmoke.execution.slice(0, 14)}…</a>
              <p className="mt-3 text-xs leading-relaxed text-ledger-400">Verified portfolio drift triggered a policy-bounded adjustment toward the immutable target.</p>
            </div>
            <div className="rounded-lg border border-verified-500/30 bg-verified-500/5 p-6">
              <p className="text-xs uppercase tracking-wide text-verified-400">Risk rejection</p>
              <a href={creditcoinTx(CONTROLLED_DEMO.oversizedRiskRejection)} target="_blank" rel="noopener noreferrer" className="font-data mt-2 block text-xs text-verified-400 hover:underline break-all">{CONTROLLED_DEMO.oversizedRiskRejection.slice(0, 14)}…</a>
              <p className="mt-3 text-xs leading-relaxed text-ledger-400">A 7,000 fwWCTC AI proposal exceeded policy. It was rejected and treasury capital remained untouched.</p>
            </div>
          </div>
          <div className="mt-6 rounded-lg border border-alert-500/30 bg-alert-500/5 p-5">
            <p className="text-xs uppercase tracking-wide text-alert-400">Honest adversarial test</p>
            <p className="mt-2 text-sm leading-relaxed text-ledger-300">The oversized risk proposal is a first-class on-chain rejection record. It demonstrates that a malicious or mistaken AI instruction cannot exceed deterministic policy.</p>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-ledger-800 py-16">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-semibold text-ledger-100">How it works</h2>
            <Link
              to="/architecture"
              className="text-sm text-copper-400 transition hover:text-copper-500"
            >
              Full architecture →
            </Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {BEATS.map((b) => (
              <div key={b.num} className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
                <span className="text-3xl font-bold text-verified-500/30">{b.num}</span>
                <h3 className="mt-2 text-lg font-semibold text-ledger-100">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ledger-400">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Scope section */}
        <section className="border-t border-ledger-800 py-16">
          <h2 className="text-2xl font-semibold text-ledger-100">Honest scope</h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-ledger-400">
            <p>
              This is <strong className="text-ledger-200">testnet-only</strong>. It uses
              controlled fwUSD and fwWCTC on public testnets — no real money, bridge, redemption, or promised returns.
            </p>
            <p>
              <strong className="text-ledger-200">Non-custodial by design.</strong> Your deposit
              sits in a contract address you own. The agent never holds your funds — it can only
              request you trade within your own contract.
            </p>
            <p>
              <strong className="text-ledger-200">Your guardrails are immutable.</strong> You set
              strategy, asset, venue, allocation, exposure, size, slippage, freshness and rate limits before deployment. They are baked into the treasury as
              unchangeable code. No one can loosen them later — not the agent, not us, not even you.
              That is intentional: a safety guarantee that can be revised is not a guarantee.
            </p>
            <p>
              This is <strong className="text-alert-400">explicitly not a speed-competitive
              trading bot</strong>. It will not beat MEV bots on latency. It is a proof-of-concept
              for a new trust model: AI that proves its reasoning on-chain before acting, and
              cannot act outside bounds it cannot change.
            </p>
          </div>
        </section>

        {/* CTA section */}
        <section className="border-t border-ledger-800 py-16 text-center">
          <h2 className="text-2xl font-semibold text-ledger-100">See the security boundary work</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ledger-400 mx-auto">
            Inspect the permanent public receipts or request a supervised live run of any locked strategy.
          </p>
          <div className="mt-6">
            <Link
              to="/demo"
              className="rounded-md bg-copper-500 px-6 py-3 text-sm font-semibold text-text-primary hover:bg-copper-400 transition"
            >
              Open controlled demo
            </Link>
          </div>
        </section>
      </div>

    </Layout>
  );
}

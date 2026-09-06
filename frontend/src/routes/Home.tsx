// Fair Witness landing page — forensic-ledger aesthetic, honest pitch, real proof.
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { NetworkIndicator } from "../components/networkIndicator";

const BEATS = [
  { num: "01", title: "Set your constraints once",
    desc: "You pick seven hard limits — trade size, slippage tolerance, proof drift, rate limit — at sign-up. They are baked into your own contract as immutable constants. No one, not even you, can loosen them after." },
  { num: "02", title: "It watches for arbitrage opportunities",
    desc: "The agent watches attested price events on a source chain (Sepolia — a toy, demo-controlled PriceObservation contract, not a real market oracle), confirms them with an independent second proof, and evaluates whether an arbitrage gap exists within your constraints." },
  { num: "03", title: "It proves before it acts",
    desc: "Before any trade, the agent generates cryptographic inclusion proofs for both prices and submits them to your contract. The contract verifies the proofs independently." },
  { num: "04", title: "You check in whenever you like",
    desc: "Every execution is written to an on-chain journal. Rejected attempts revert on-chain and are visible as failed transactions, but aren't separately journaled — your own limits already did their job. The Replay & Audit Viewer lets you — or anyone — reconstruct the full chain: fact, reasoning, action — independently." },
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
            Fair Witness is a custody-free arbitrage system. Your funds sit in a contract only you control.
            An AI agent decides <em>whether</em> to trade — never <em>how</em>, and never with your key.
            Every executed action is backed by cryptographic proofs and journaled on-chain, independently checkable by anyone.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-alert-400">
            This is explicitly <strong>not</strong> a speed-competitive trading bot. It will not beat MEV bots
            on execution latency, and it does not promise returns. It is a proof-of-concept for a new trust model.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link to="/signup" className="rounded-md bg-copper-500 px-6 py-3 text-sm font-semibold text-text-primary hover:bg-copper-400 transition">Get started</Link>
            <Link to="/verify" className="rounded-md border border-ledger-600 px-6 py-3 text-sm font-semibold text-ledger-200 hover:border-verified-500/50 hover:text-verified-400 transition">Verify an action</Link>
          </div>
        </section>

        {/* Proof section */}
        <section className="border-t border-ledger-800 py-16">
          <h2 className="text-2xl font-semibold text-ledger-100">Proof it's real</h2>
          <p className="mt-2 text-sm text-ledger-400">
            Every address below is live on CC3 testnet, checkable on Blockscout. Inspect the live
            instance's immutable guardrails in the{" "}
            <Link to="/treasury" className="text-copper-400 transition hover:text-copper-500">
              treasury viewer
            </Link>
            .
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
              <p className="text-xs uppercase tracking-wide text-ledger-400">Live instance (Tenant A)</p>
              <a href="https://creditcoin-testnet.blockscout.com/address/0x13CACe3989b295048De47C68F32Ff3d844AC2026" target="_blank" rel="noopener noreferrer" className="font-data mt-2 block text-xs text-verified-400 hover:underline break-all">0x13CACe...2026</a>
              <p className="mt-3 text-xs leading-relaxed text-ledger-400">Max trade 5 USDC, slippage 150bps, rate 6/day. Immutable guardrails. Has live executions.</p>
            </div>
            <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
              <p className="text-xs uppercase tracking-wide text-ledger-400">Live instance (Tenant B)</p>
              <a href="https://creditcoin-testnet.blockscout.com/address/0xD66C607072df7dB98A75aEe81fCA4089462c60aB" target="_blank" rel="noopener noreferrer" className="font-data mt-2 block text-xs text-verified-400 hover:underline break-all">0xD66C60...60aB</a>
              <p className="mt-3 text-xs leading-relaxed text-ledger-400">Max trade 10 USDC, slippage 200bps, rate 3/day. Same factory, different guardrails.</p>
            </div>
            <div className="rounded-lg border border-verified-500/30 bg-verified-500/5 p-6">
              <p className="text-xs uppercase tracking-wide text-verified-400">Live execution</p>
              <a href="https://creditcoin-testnet.blockscout.com/tx/0xae01e705cc993a578c4a5da092241142750e82cffe7c858654111a82a358106b" target="_blank" rel="noopener noreferrer" className="font-data mt-2 block text-xs text-verified-400 hover:underline break-all">0xae01e705...58106b</a>
              <p className="mt-3 text-xs leading-relaxed text-ledger-400">2,187,500 in / 2,182,130 out (~24.5bps). Status: <strong className="text-verified-400">success</strong>.</p>
            </div>
          </div>
          <div className="mt-6 rounded-lg border border-alert-500/30 bg-alert-500/5 p-5">
            <p className="text-xs uppercase tracking-wide text-alert-400">Honest adversarial test</p>
            <p className="mt-2 text-sm leading-relaxed text-ledger-300">We replayed the exact calldata of a live execution. The contract rejected it with <code className="font-data text-alert-400">ActionAlreadyExecuted</code> — proving the replay-safety guarantee is enforced on-chain.</p>
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
              valueless USDC on the Creditcoin CC3 testnet — no real money, no real returns.
            </p>
            <p>
              <strong className="text-ledger-200">Non-custodial by design.</strong> Your deposit
              sits in a contract address you own. The agent never holds your funds — it can only
              request you trade within your own contract.
            </p>
            <p>
              <strong className="text-ledger-200">Your guardrails are immutable.</strong> You set
              seven limits once, at sign-up — max trade size, slippage, minimum gap, drift, rate
              limit, actions per day, and epoch length. They are baked into your contract as
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
          <h2 className="text-2xl font-semibold text-ledger-100">Your turn</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ledger-400 mx-auto">
            Sign up with an email — no seed phrase, no MetaMask. You'll get your own
            embedded wallet, pick your guardrails once, deploy your own contract, and fund it.
          </p>
          <div className="mt-6">
            <Link
              to="/signup"
              className="rounded-md bg-copper-500 px-6 py-3 text-sm font-semibold text-text-primary hover:bg-copper-400 transition"
            >
              Sign up now
            </Link>
          </div>
        </section>
      </div>

    </Layout>
  );
}
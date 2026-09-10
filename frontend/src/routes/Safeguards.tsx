import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { useAuthSession } from "../lib/authSession";
import { useOwnerTreasuries } from "../lib/useOwnerTreasuries";

const pct = (bps: unknown) => `${Number(bps) / 100}%`;
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const strategyNames = (mask: number) => [
  { bit: 4, label: "Risk Reduction" },
  { bit: 2, label: "Rebalancing" },
  { bit: 1, label: "Arbitrage" },
].filter(item => mask & item.bit);

export default function Safeguards() {
  const [params] = useSearchParams();
  const requested = params.get("treasury");
  const { account, resolving } = useAuthSession();
  const { treasuries, loading, refreshing, error, refreshedAt } = useOwnerTreasuries(account?.address, requested);
  const selected = requested ? treasuries.filter(t => t.address.toLowerCase() === requested.toLowerCase()) : treasuries;

  return <Layout><main className="mx-auto max-w-6xl px-6 py-10">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-copper-400">Deterministic policy</p><h1 className="mt-2 text-3xl font-semibold text-ledger-100">Safeguards</h1><p className="mt-2 max-w-2xl text-sm text-ledger-400">These are the on-chain limits each treasury enforces regardless of what the AI recommends.</p></div><div className="flex items-center gap-3">{refreshing && <RefreshIndicator />}{refreshedAt && <span className="text-xs text-ledger-500">Updated {refreshedAt.toLocaleTimeString()}</span>}</div></header>

    {resolving && <OnChainLoading label="Restoring your secure session" />}
    {!resolving && !account && <SignedOut />}
    {!resolving && account && loading && treasuries.length === 0 && <OnChainLoading label="Loading treasury safeguards" />}

    {account && !loading && selected.length === 0 && <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-sm text-ledger-300">No treasury safeguards are available for this wallet.</p><Link to="/dashboard" className="mt-4 inline-block text-copper-400">Back to dashboard →</Link></section>}

    {account && selected.length > 0 && <div className="mt-8 space-y-8">{selected.map((treasury, i) => {
      const target = Number(treasury.rebalance.targetWctcBps) / 100;
      const tolerance = Number(treasury.rebalance.toleranceBps) / 100;
      const mask = Number(treasury.universal.enabledStrategies);
      return <section key={treasury.address} className="rounded-2xl border border-ledger-700 bg-ledger-900 p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-ledger-500">Treasury {treasuries.length > 1 ? `#${treasuries.length - i}` : ""}</p><code className="mt-2 block text-xs text-verified-400">{short(treasury.address)}</code></div><Link to={`/dashboard?treasury=${treasury.address}`} className="text-sm text-copper-400">Overview →</Link></div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Guard title="Maximum action" value={`${ethers.formatUnits(treasury.universal.maxActionValueE6, 6)} fwUSD`} detail="No single autonomous action may exceed this value." />
          <Guard title="Maximum slippage" value={pct(treasury.universal.maxSlippageBps)} detail="Any proposal above this price-impact ceiling is rejected." />
          <Guard title="WCTC target" value={`${target}%`} detail={`Rebalance band ${target - tolerance}%–${target + tolerance}%.`} />
          <Guard title="Maximum WCTC exposure" value={pct(treasury.risk.maxWctcExposureBps)} detail="Risk Reduction gets priority when exposure breaches this ceiling." />
          <Guard title="Minimum arbitrage edge" value={pct(treasury.arbitrage.minNetEdgeBps)} detail="Arbitrage is ignored below this deterministic threshold." />
          <Guard title="Executions per epoch" value={String(treasury.universal.maxExecutionsPerEpoch)} detail={`Maximum attempts: ${treasury.universal.maxAttemptsPerEpoch.toString()} per ${treasury.universal.epochLength.toString()}s epoch.`} />
          <Guard title="Maximum source drift" value={pct(treasury.universal.maxSourceDriftBps)} detail="Cross-chain evidence must remain inside this source drift limit." />
          <Guard title="Destination deviation" value={pct(treasury.universal.maxSpotTwapDeviationBps)} detail="Destination spot/TWAP deviation must remain inside policy." />
          <Guard title="Risk reduction/day" value={`${ethers.formatUnits(treasury.risk.dailyRiskReductionValueE6, 6)} fwUSD`} detail="Daily risk-reduction capacity is bounded on-chain." />
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-verified-500/20 bg-verified-500/5 p-5"><h2 className="text-lg font-semibold text-ledger-100">Always enforced</h2><div className="mt-4 space-y-2 text-sm text-ledger-300"><p>✓ You remain the treasury owner</p><p>✓ The agent cannot withdraw treasury funds</p><p>✓ The AI cannot change policy limits</p><p>✓ Evidence is independently verified</p><p>✓ Proposal, nonce, and evidence replay are blocked</p><p>✓ Only registered agents may submit proposals</p></div></div>
          <div className="rounded-xl border border-ledger-800 bg-ledger-950 p-5"><h2 className="text-lg font-semibold text-ledger-100">Enabled strategies</h2><div className="mt-4 flex flex-wrap gap-2">{strategyNames(mask).map(s => <span key={s.label} className="rounded-full border border-copper-500/30 bg-copper-500/5 px-3 py-1 text-xs text-copper-300">{s.label}</span>)}</div><details className="mt-5 text-xs text-ledger-500"><summary className="cursor-pointer text-copper-400">Advanced on-chain details</summary><p className="mt-3 break-all">Policy hash: {treasury.policyHash}</p><p className="mt-2">Policy epoch: {treasury.policyEpoch.toString()}</p><p className="mt-2 break-all">Owner: {treasury.owner}</p></details></div>
        </div>
      </section>;
    })}</div>}
    {error && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>;
}

function Guard({ title, value, detail }: { title: string; value: string; detail: string }) { return <article className="rounded-xl border border-ledger-800 bg-ledger-950 p-4"><p className="text-xs text-ledger-500">{title}</p><p className="mt-1 text-xl font-semibold text-ledger-100">{value}</p><p className="mt-2 text-xs leading-relaxed text-ledger-400">{detail}</p></article>; }
function SignedOut() { return <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-sm text-ledger-300">Sign in to inspect the safeguards on your treasuries.</p><Link to="/signup" className="mt-4 inline-block rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950">Sign in</Link></section>; }

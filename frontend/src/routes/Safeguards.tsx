import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { ControlledMarketBadge } from "../components/ProductVisuals";
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

  return <Layout><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-16 -top-24 h-72 w-72 bg-verified-500/14" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Deterministic policy shield</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Safeguards the AI cannot rewrite.</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Every value below is enforced by treasury code regardless of what the reasoning layer recommends.</p></div>
        <div className="flex items-center gap-3">{refreshing && <RefreshIndicator />}{refreshedAt && <span className="fw-status-chip text-[10px] font-data">SYNC {refreshedAt.toLocaleTimeString()}</span>}</div>
      </div>
    </header>

    {resolving && <OnChainLoading label="Restoring your secure session" />}
    {!resolving && !account && <SignedOut />}
    {!resolving && account && loading && treasuries.length === 0 && <OnChainLoading label="Loading treasury safeguards" />}
    {account && !loading && selected.length === 0 && <section className="fw-glass mt-8 rounded-3xl p-6"><p className="text-sm text-ledger-300">No treasury safeguards are available for this wallet.</p><Link to="/dashboard" className="mt-4 inline-block text-copper-400">Back to dashboard →</Link></section>}

    {account && selected.length > 0 && <div className="mt-8 space-y-8">{selected.map((treasury, i) => {
      const target = Number(treasury.rebalance.targetWctcBps) / 100;
      const tolerance = Number(treasury.rebalance.toleranceBps) / 100;
      const mask = Number(treasury.universal.enabledStrategies);
      return <section key={treasury.address} className="fw-command-surface rounded-3xl border p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Treasury {treasuries.length > 1 ? `#${treasuries.length - i}` : ""}</p><code className="mt-2 block font-data text-xs text-verified-400">{short(treasury.address)}</code></div><Link to={`/dashboard?treasury=${treasury.address}`} className="fw-secondary-button rounded-xl px-4 py-2 text-sm text-ledger-300">Overview →</Link></div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Guard title="Maximum action" value={`${ethers.formatUnits(treasury.universal.maxActionValueE6, 6)} fwUSD`} detail="No single autonomous action may exceed this value." code="CAP" />
          <Guard title="Maximum slippage" value={pct(treasury.universal.maxSlippageBps)} detail="Any proposal above this price-impact ceiling is rejected." code="SLP" />
          <Guard title="WCTC target" value={`${target}%`} detail={`Rebalance band ${target - tolerance}%–${target + tolerance}%.`} code="BAL" />
          <Guard title="Maximum WCTC exposure" value={pct(treasury.risk.maxWctcExposureBps)} detail="Risk Reduction gets priority when exposure breaches this ceiling." code="RSK" />
          <Guard title="Minimum arbitrage edge" value={pct(treasury.arbitrage.minNetEdgeBps)} detail="Arbitrage is ignored below this deterministic threshold." code="ARB" />
          <Guard title="Executions per epoch" value={String(treasury.universal.maxExecutionsPerEpoch)} detail={`Maximum attempts: ${treasury.universal.maxAttemptsPerEpoch.toString()} per ${treasury.universal.epochLength.toString()}s epoch.`} code="EPC" />
          <Guard title="Maximum source drift" value={pct(treasury.universal.maxSourceDriftBps)} detail="Cross-chain evidence must remain inside this source drift limit." code="DRF" />
          <Guard title="Destination deviation" value={pct(treasury.universal.maxSpotTwapDeviationBps)} detail="Destination spot/TWAP deviation must remain inside policy." code="TWP" />
          <Guard title="Risk reduction/day" value={`${ethers.formatUnits(treasury.risk.dailyRiskReductionValueE6, 6)} fwUSD`} detail="Daily risk-reduction capacity is bounded on-chain." code="DAY" />
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative overflow-hidden rounded-2xl border border-verified-500/20 bg-verified-500/5 p-5"><div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-verified-500/10 blur-3xl" /><div className="relative z-10"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-ledger-100">Always enforced</h2><span className="fw-status-chip text-[9px] text-verified-400"><span className="fw-status-dot" /> LOCKED</span></div><div className="mt-4 grid gap-2 text-sm text-ledger-300 sm:grid-cols-2"><p>✓ You remain treasury owner</p><p>✓ Agent cannot withdraw funds</p><p>✓ AI cannot change policy limits</p><p>✓ Evidence independently verified</p><p>✓ Proposal/nonce/evidence replay blocked</p><p>✓ Only registered agents submit</p></div></div></div>
          <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-ledger-100">Enabled strategies</h2><span className="font-data text-[9px] text-ledger-600">MASK {mask}</span></div><div className="mt-4 flex flex-wrap gap-2">{strategyNames(mask).map(s => <span key={s.label} className="fw-status-chip text-[10px] text-copper-400">{s.label}</span>)}</div><details className="mt-5 text-xs text-ledger-500"><summary className="cursor-pointer text-copper-400">Advanced on-chain details</summary><p className="mt-3 break-all font-data">Policy hash: {treasury.policyHash}</p><p className="mt-2">Policy epoch: {treasury.policyEpoch.toString()}</p><p className="mt-2 break-all font-data">Owner: {treasury.owner}</p></details></div>
        </div>
      </section>;
    })}</div>}
    {error && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>;
}

function Guard({ title, value, detail, code }: { title: string; value: string; detail: string; code: string }) {
  return <article className="group fw-command-surface relative overflow-hidden rounded-2xl border p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.16em] text-ledger-500">{title}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-ledger-100">{value}</p></div><span className="grid h-9 w-9 place-items-center rounded-lg border border-ledger-800 bg-ledger-950/60 font-data text-[9px] text-copper-400">{code}</span></div><p className="mt-3 text-xs leading-relaxed text-ledger-400">{detail}</p><div className="absolute bottom-0 left-0 h-px w-0 bg-gradient-to-r from-copper-400 to-verified-400 transition-all duration-300 group-hover:w-full" /></article>;
}
function SignedOut() { return <section className="fw-glass mt-8 rounded-3xl p-6"><p className="fw-kicker">Protected policy view</p><h2 className="mt-4 text-2xl font-semibold text-ledger-100">Sign in to inspect treasury safeguards</h2><p className="mt-2 text-sm text-ledger-400">See exactly what the AI is permitted to do — and what remains impossible.</p><Link to="/signup" className="fw-primary-button mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold">Sign in →</Link></section>; }

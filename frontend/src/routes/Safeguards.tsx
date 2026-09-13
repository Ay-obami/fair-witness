import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { ControlledMarketBadge } from "../components/ProductVisuals";
import { useAuthSession } from "../lib/authSession";
import { useOwnerTreasuries } from "../lib/useOwnerTreasuries";

const pct = (bps: unknown) => `${Number(bps) / 100}%`;
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const STRATEGIES = [
  { bit: 4, label: "Risk Reduction", code: "01", detail: "First priority when exposure breaches the risk ceiling." },
  { bit: 2, label: "Rebalancing", code: "02", detail: "Restores allocation after the portfolio leaves its target band." },
  { bit: 1, label: "Arbitrage", code: "03", detail: "Acts only after verified divergence clears the minimum edge." },
];

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
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Deterministic policy shield</p><ControlledMarketBadge /></div><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">The AI can recommend. These rules decide.</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Every limit below is read from the treasury and enforced independently of the reasoning layer. A model response does not become authority just because it sounds convincing.</p></div>
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
      const enabled = STRATEGIES.filter(item => mask & item.bit);
      return <section key={treasury.address} className="fw-command-surface overflow-hidden rounded-3xl border">
        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Treasury {treasuries.length > 1 ? `#${treasuries.length - i}` : ""}</p><code className="mt-2 block break-all font-data text-xs text-verified-400">{treasury.address}</code></div><Link to={`/dashboard?treasury=${treasury.address}`} className="fw-secondary-button w-full rounded-xl px-4 py-2 text-center text-sm text-ledger-300 sm:w-auto">Overview →</Link></div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
            <div className="relative overflow-hidden rounded-2xl border border-verified-500/24 bg-verified-500/5 p-5 sm:p-6">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-verified-500/10 blur-3xl" />
              <div className="relative z-10"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-verified-400">Policy firewall</p><h2 className="mt-2 text-2xl font-semibold text-ledger-100">Authority stays with the treasury.</h2></div><span className="fw-status-chip shrink-0 text-[9px] text-verified-400"><span className="fw-status-dot" /> ENFORCED ON-CHAIN</span></div><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ledger-400">AI output is only an input to authorization. The treasury independently checks policy state, market state, evidence, replay protection and execution limits before capital can move.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center"><BoundaryNode label="AI proposal" detail="Untrusted recommendation" tone="copper" /><Arrow /><BoundaryNode label="Policy gate" detail="Deterministic checks" tone="green" /><Arrow /><BoundaryNode label="Treasury" detail="Authorized execution" tone="green" /></div></div>
            </div>
            <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Strategy coordinator</p><h2 className="mt-1 text-lg font-semibold text-ledger-100">Fixed priority order</h2></div><span className="font-data text-[9px] text-ledger-600">MASK {mask}</span></div><div className="mt-4 space-y-3">{STRATEGIES.map(strategy => <StrategyRow key={strategy.label} {...strategy} enabled={Boolean(mask & strategy.bit)} />)}</div><p className="mt-4 text-xs leading-relaxed text-ledger-500">When multiple strategies qualify, the coordinator evaluates Risk Reduction before Rebalancing before Arbitrage. The AI does not reorder them.</p></div>
          </div>

          <PolicySection eyebrow="Capital boundaries" title="How much capital may move">
            <Guard title="Maximum action" value={`${ethers.formatUnits(treasury.universal.maxActionValueE6, 6)} fwUSD`} detail="No single autonomous action may exceed this universal ceiling." code="CAP" />
            <Guard title="Maximum slippage" value={pct(treasury.universal.maxSlippageBps)} detail="Any proposal above this price-impact ceiling is rejected." code="SLP" />
            <Guard title="Risk reduction/day" value={`${ethers.formatUnits(treasury.risk.dailyRiskReductionValueE6, 6)} fwUSD`} detail="Daily risk-reduction capacity remains bounded on-chain." code="DAY" />
          </PolicySection>

          <PolicySection eyebrow="Portfolio boundaries" title="Where the treasury may operate">
            <Guard title="WCTC target" value={`${target}%`} detail={`Rebalance band ${target - tolerance}%–${target + tolerance}%.`} code="BAL" />
            <Guard title="Maximum WCTC exposure" value={pct(treasury.risk.maxWctcExposureBps)} detail="Risk Reduction gets priority when exposure breaches this ceiling." code="RSK" />
            <Guard title="Minimum arbitrage edge" value={pct(treasury.arbitrage.minNetEdgeBps)} detail="Arbitrage is ignored below this deterministic threshold." code="ARB" />
          </PolicySection>

          <PolicySection eyebrow="Evidence & cadence" title="When an action may be authorized">
            <Guard title="Maximum source drift" value={pct(treasury.universal.maxSourceDriftBps)} detail="Verified source observations must remain inside this drift limit." code="DRF" />
            <Guard title="Destination deviation" value={pct(treasury.universal.maxSpotTwapDeviationBps)} detail="Destination spot/TWAP deviation must remain inside policy." code="TWP" />
            <Guard title="Executions per epoch" value={String(treasury.universal.maxExecutionsPerEpoch)} detail={`Maximum attempts: ${treasury.universal.maxAttemptsPerEpoch.toString()} per ${treasury.universal.epochLength.toString()}s epoch.`} code="EPC" />
          </PolicySection>

          <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
            <div className="rounded-2xl border border-verified-500/20 bg-verified-500/5 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold text-ledger-100">Security invariants</h2><span className="fw-status-chip text-[9px] text-verified-400"><span className="fw-status-dot" /> ALWAYS ENFORCED</span></div><div className="mt-4 grid gap-2 text-sm text-ledger-300 sm:grid-cols-2"><Invariant>Owner retains treasury authority</Invariant><Invariant>Agent cannot withdraw owner funds</Invariant><Invariant>AI cannot increase policy limits</Invariant><Invariant>Evidence is independently verified</Invariant><Invariant>Proposal, nonce and evidence replay blocked</Invariant><Invariant>Only registered agents may submit</Invariant></div></div>
            <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">On-chain identity</p><h2 className="mt-1 text-lg font-semibold text-ledger-100">Policy commitment</h2></div><span className="fw-status-chip text-[9px] text-copper-400">EPOCH {treasury.policyEpoch.toString()}</span></div><div className="mt-4 space-y-3 text-xs"><Meta label="Enabled strategies" value={`${enabled.length}/3`} /><Meta label="Owner" value={short(treasury.owner)} mono /><Meta label="Treasury" value={short(treasury.address)} mono /></div><details className="mt-5 text-xs text-ledger-500"><summary className="cursor-pointer text-copper-400">Show policy hash</summary><p className="mt-3 break-all rounded-xl border border-ledger-800 bg-ledger-950/70 p-3 font-data leading-relaxed">{treasury.policyHash}</p></details></div>
          </div>
        </div>
      </section>;
    })}</div>}
    {error && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>;
}

function PolicySection({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="mt-8"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">{title}</h2></div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div></section>;
}

function BoundaryNode({ label, detail, tone }: { label: string; detail: string; tone: "copper" | "green" }) {
  return <div className={`rounded-xl border p-3 text-center ${tone === "green" ? "border-verified-500/25 bg-verified-500/5" : "border-copper-500/25 bg-copper-500/5"}`}><p className={`text-xs font-semibold ${tone === "green" ? "text-verified-400" : "text-copper-400"}`}>{label}</p><p className="mt-1 text-[10px] leading-relaxed text-ledger-500">{detail}</p></div>;
}
function Arrow() { return <span className="hidden text-center text-ledger-600 sm:block">→</span>; }

function StrategyRow({ code, label, detail, enabled }: { code: string; label: string; detail: string; enabled: boolean }) {
  return <div className={`flex items-start gap-3 rounded-xl border p-3 ${enabled ? "border-verified-500/22 bg-verified-500/5" : "border-ledger-800 bg-ledger-950/40 opacity-55"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border font-data text-[9px] ${enabled ? "border-verified-500/30 text-verified-400" : "border-ledger-800 text-ledger-600"}`}>{code}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ledger-200">{label}</p><span className={`font-data text-[8px] uppercase tracking-widest ${enabled ? "text-verified-400" : "text-ledger-600"}`}>{enabled ? "Enabled" : "Disabled"}</span></div><p className="mt-1 text-[11px] leading-relaxed text-ledger-500">{detail}</p></div></div>;
}

function Guard({ title, value, detail, code }: { title: string; value: string; detail: string; code: string }) {
  return <article className="group fw-command-surface relative overflow-hidden rounded-2xl border p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.16em] text-ledger-500">{title}</p><p className="mt-2 break-words text-2xl font-semibold tracking-tight text-ledger-100">{value}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ledger-800 bg-ledger-950/60 font-data text-[9px] text-copper-400">{code}</span></div><p className="mt-3 text-xs leading-relaxed text-ledger-400">{detail}</p><div className="absolute bottom-0 left-0 h-px w-0 bg-gradient-to-r from-copper-400 to-verified-400 transition-all duration-300 group-hover:w-full" /></article>;
}

function Invariant({ children }: { children: React.ReactNode }) { return <p className="flex items-start gap-2"><span className="mt-0.5 text-verified-400">✓</span><span>{children}</span></p>; }
function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="flex items-center justify-between gap-4 border-b border-ledger-800 pb-2 last:border-0"><span className="text-ledger-500">{label}</span><span className={`text-right text-ledger-300 ${mono ? "font-data" : ""}`}>{value}</span></div>; }
function SignedOut() { return <section className="fw-glass mt-8 rounded-3xl p-6"><p className="fw-kicker">Protected policy view</p><h2 className="mt-4 text-2xl font-semibold text-ledger-100">Sign in to inspect treasury safeguards</h2><p className="mt-2 text-sm text-ledger-400">See exactly what the AI is permitted to do — and what remains impossible.</p><Link to="/signup" className="fw-primary-button mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold">Sign in →</Link></section>; }

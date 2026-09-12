import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { ControlledMarketBadge, DecisionSequence } from "../components/ProductVisuals";
import { useAuthSession } from "../lib/authSession";
import { useOwnerTreasuries, type ActivityItem, type TreasuryView } from "../lib/useOwnerTreasuries";
import { reasonLabel, strategyLabel } from "../lib/policyUi";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const percent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

const REASON_EXPLANATIONS: Record<number, string> = {
  1: "The proposal used a schema version this treasury does not accept.", 2: "The proposal commitment did not match the values the treasury independently derived.", 3: "Autonomous execution was paused, so the treasury refused to move funds.", 4: "This strategy is disabled by the owner's mandate.", 5: "The requested action type is not permitted by the treasury.", 6: "The proposal referenced an asset outside the treasury's fixed asset set.", 7: "The proposal referenced a venue outside the treasury's fixed execution venue.", 8: "The proposal arrived after its allowed execution deadline.", 9: "The proposal deadline was farther into the future than policy allows.", 10: "The requested slippage exceeded the maximum slippage chosen by the owner.", 11: "The proposal was built against a different policy state than the treasury currently enforces.", 12: "This proposal had already been processed, so replay protection blocked it.", 13: "The agent nonce had already been used, so the treasury rejected the duplicate request.", 14: "The same verified evidence had already authorized an execution and could not be used again.", 15: "The supplied cross-chain evidence could not be verified.", 16: "The evidence was too old to authorize a new financial action.", 17: "The proposal's evidence commitment did not match the evidence the treasury verified.", 18: "The source market moved too much between verified observations for policy to trust the signal.", 19: "The verified source market did not have enough liquidity to satisfy the mandate.", 20: "The destination market failed the treasury's deterministic market checks.", 21: "The destination market did not have enough liquidity for the proposed action.", 22: "The destination spot price deviated too far from its TWAP for safe execution.", 23: "The proposed trade direction did not match the direction justified by verified state.", 24: "The verified arbitrage opportunity was below the owner's minimum net-edge threshold.", 25: "The portfolio was already inside the owner's allowed rebalance band, so no rebalance was necessary.", 26: "WCTC exposure was still below the owner's risk ceiling, so risk reduction was not necessary.", 27: "Policy calculated that there was no non-zero amount that could safely execute.", 28: "The proposed action was larger than the owner's maximum permitted size.", 29: "The proposed amount did not match the amount independently permitted by policy.", 30: "The treasury had already reached the owner's daily risk-reduction allowance.", 31: "The treasury did not hold enough of the required asset to execute safely.", 32: "The treasury had reached its execution-rate limit for the current policy epoch.", 33: "All authorization checks completed, but the downstream execution itself reverted.",
};

function assetName(address: string, treasury: TreasuryView) {
  const value = address.toLowerCase();
  if (value === treasury.wctc.toLowerCase()) return "fwWCTC";
  if (value === treasury.stable.toLowerCase()) return "fwUSD";
  return short(address);
}

function formatAmount(amount: bigint, asset: string, treasury: TreasuryView) {
  const decimals = asset.toLowerCase() === treasury.wctc.toLowerCase() ? 18 : 6;
  const formatted = Number(ethers.formatUnits(amount, decimals));
  if (!Number.isFinite(formatted)) return ethers.formatUnits(amount, decimals);
  return formatted.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function humanExplanation(item: ActivityItem) {
  if (item.result === 1) {
    if (item.strategy === 1) {
      const allocation = item.currentWctcBps ? percent(item.currentWctcBps) : null;
      const reference = item.referenceBps ? percent(item.referenceBps) : null;
      const context = allocation && reference ? ` WCTC exposure was ${allocation} against a ${reference} policy reference.` : "";
      return `The portfolio had moved outside its permitted rebalance state.${context} Verified evidence and every deterministic policy check passed, so the treasury executed the bounded rebalance.`;
    }
    if (item.strategy === 2) {
      const allocation = item.currentWctcBps ? percent(item.currentWctcBps) : null;
      const ceiling = item.referenceBps ? percent(item.referenceBps) : null;
      const context = allocation && ceiling ? ` WCTC exposure was ${allocation} against a ${ceiling} risk reference.` : "";
      return `The treasury detected a policy-defined risk condition.${context} Verified evidence and all authorization checks passed, so exposure was reduced within the owner's limits.`;
    }
    return "Verified cross-chain market evidence satisfied the configured arbitrage conditions. The proposed trade passed every deterministic policy check, so the treasury authorized and executed it.";
  }
  if (item.result === 2) return "The proposal passed authorization, but execution reverted at the venue. The treasury recorded the failure on-chain so the outcome remains auditable rather than silently disappearing.";
  return REASON_EXPLANATIONS[item.reason] ?? `The treasury rejected this proposal because ${reasonLabel(item.reason).toLowerCase()}. No unauthorized capital movement occurred.`;
}

export default function Activity() {
  const [params] = useSearchParams();
  const requested = params.get("treasury");
  const { account, resolving } = useAuthSession();
  const { treasuries, loading, refreshing, error, refreshedAt } = useOwnerTreasuries(account?.address, requested);
  const selected = requested ? treasuries.filter(t => t.address.toLowerCase() === requested.toLowerCase()) : treasuries;
  const totalAttempts = selected.reduce((sum, t) => sum + t.activities.length, 0);
  const executed = selected.reduce((sum, t) => sum + t.activities.filter(a => a.result === 1).length, 0);
  const blocked = selected.reduce((sum, t) => sum + t.activities.filter(a => a.result === 0).length, 0);

  return <Layout><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-20 -top-24 h-72 w-72 bg-copper-500/12" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Decision provenance</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">On-chain activity journal</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Every proposal becomes a visible chain of evidence, policy checks and treasury outcome. Nothing depends on trusting the AI's explanation alone.</p></div>
        <div className="flex items-center gap-3">{refreshing && <RefreshIndicator />}{refreshedAt && <span className="fw-status-chip text-[10px] font-data">SYNC {refreshedAt.toLocaleTimeString()}</span>}</div>
      </div>
      {account && selected.length > 0 && <div className="relative z-10 mt-7 grid gap-3 sm:grid-cols-3"><MiniStat label="Attempts" value={String(totalAttempts)} /><MiniStat label="Executed" value={String(executed)} tone="good" /><MiniStat label="Policy blocked" value={String(blocked)} tone="warn" /></div>}
    </header>

    {resolving && <OnChainLoading label="Restoring your secure session" />}
    {!resolving && !account && <SignedOut />}
    {!resolving && account && loading && treasuries.length === 0 && <OnChainLoading label="Loading treasury activity" />}
    {account && !loading && selected.length === 0 && <section className="fw-glass mt-8 rounded-3xl p-6"><p className="text-sm text-ledger-300">No treasury activity is available for this wallet.</p><Link to="/dashboard" className="mt-4 inline-block text-copper-400">Back to dashboard →</Link></section>}

    {account && selected.length > 0 && <div className="mt-8 space-y-8">{selected.map((treasury, i) => <section key={treasury.address} className="fw-command-surface rounded-3xl border p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Treasury {treasuries.length > 1 ? `#${treasuries.length - i}` : ""}</p><code className="mt-2 block font-data text-xs text-verified-400">{short(treasury.address)}</code></div><Link to={`/dashboard?treasury=${treasury.address}`} className="fw-secondary-button rounded-xl px-4 py-2 text-sm text-ledger-300">Overview →</Link></div>

      {treasury.activities.length === 0 ? <div className="mt-6 rounded-2xl border border-ledger-800 bg-ledger-950/60 p-5"><p className="text-sm text-ledger-300">No proposals have been submitted yet.</p><p className="mt-1 text-xs text-ledger-500">The autonomous agent is waiting for a policy-bounded candidate.</p></div> : <div className="relative mt-7 space-y-5 before:absolute before:bottom-3 before:left-[1.15rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-copper-500/45 before:via-verified-500/25 before:to-transparent">
        {treasury.activities.map(item => {
          const status = item.result === 1 ? "Executed" : item.result === 2 ? "Execution failed" : "Rejected";
          const tone = item.result === 1 ? "text-verified-400" : item.result === 2 ? "text-alert-400" : "text-copper-400";
          const when = item.resolvedAt ? new Date(item.resolvedAt * 1000).toLocaleString() : "Pending timestamp";
          const amount = item.amountInActual > 0n ? item.amountInActual : item.proposedAmountIn;
          const amountLabel = amount > 0n ? `${formatAmount(amount, item.assetIn, treasury)} ${assetName(item.assetIn, treasury)}` : null;
          const blockedAttempt = item.result !== 1;
          return <article key={`${treasury.address}-${item.attemptId}`} className="relative pl-12">
            <div className={`absolute left-0 top-1 grid h-9 w-9 place-items-center rounded-full border bg-ledger-950 font-data text-[9px] ${item.result === 1 ? "border-verified-500/40 text-verified-400 shadow-[0_0_18px_rgba(36,217,165,.12)]" : "border-copper-500/35 text-copper-400"}`}>{String(item.attemptId).slice(-2)}</div>
            <div className="rounded-2xl border border-ledger-800 bg-ledger-950/48 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`text-sm font-semibold ${tone}`}>{status}</span><span className="fw-status-chip text-[9px]">{strategyLabel(item.strategy)}</span>{item.evidenceStatus === 2 && <span className="fw-status-chip text-[9px] text-verified-400"><span className="fw-status-dot" /> Evidence verified</span>}</div><p className="mt-2 text-xs text-ledger-500">Attempt #{item.attemptId} · {when}</p></div>
                <details className="text-xs text-ledger-500"><summary className="cursor-pointer text-copper-400">Technical details</summary><div className="mt-2 max-w-sm space-y-1"><p className="break-all">Proposal {item.proposalId}</p><p>Strategy: {strategyLabel(item.strategy)}</p><p>Evidence: {item.evidenceStatus === 2 ? "Verified" : item.evidenceStatus === 1 ? "Invalid" : "Not checked"}</p>{item.currentWctcBps > 0 && <p>Observed WCTC: {percent(item.currentWctcBps)}</p>}{item.referenceBps > 0 && <p>Policy reference: {percent(item.referenceBps)}</p>}</div></details>
              </div>

              <div className="mt-4"><DecisionSequence blocked={blockedAttempt} result={item.result === 1 ? "EXECUTED" : item.result === 2 ? "FAILED" : "BLOCKED"} reason={reasonLabel(item.reason)} /></div>
              <div className="mt-4 rounded-xl border border-ledger-800 bg-ledger-950/60 p-4"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-copper-400">Why this happened</p><p className="mt-2 max-w-4xl text-sm leading-relaxed text-ledger-200">{humanExplanation(item)}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ledger-500"><span>Policy result: <span className="text-ledger-300">{item.reason === 0 ? "All checks passed" : reasonLabel(item.reason)}</span></span>{amountLabel && <span>Action size: <span className="text-ledger-300">{amountLabel}</span></span>}</div></div>
            </div>
          </article>;
        })}
      </div>}
    </section>)}</div>}
    {error && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return <div className="rounded-2xl border border-ledger-800 bg-ledger-950/45 p-4"><p className="text-[10px] uppercase tracking-[.16em] text-ledger-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${tone === "good" ? "text-verified-400" : tone === "warn" ? "text-copper-400" : "text-ledger-100"}`}>{value}</p></div>;
}

function SignedOut() { return <section className="fw-glass mt-8 rounded-3xl p-6"><p className="fw-kicker">Private journal</p><h2 className="mt-4 text-2xl font-semibold text-ledger-100">Sign in to inspect your treasury history</h2><p className="mt-2 text-sm text-ledger-400">The on-chain journal stays public and verifiable; this view organizes your treasuries into a readable decision timeline.</p><Link to="/signup" className="fw-primary-button mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold">Sign in →</Link></section>; }

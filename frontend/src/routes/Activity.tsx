import { Link, useSearchParams } from "react-router-dom";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { useAuthSession } from "../lib/authSession";
import { useOwnerTreasuries } from "../lib/useOwnerTreasuries";
import { reasonLabel, strategyLabel } from "../lib/policyUi";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export default function Activity() {
  const [params] = useSearchParams();
  const requested = params.get("treasury");
  const { account, resolving } = useAuthSession();
  const { treasuries, loading, refreshing, error, refreshedAt } = useOwnerTreasuries(account?.address, requested);
  const selected = requested ? treasuries.filter(t => t.address.toLowerCase() === requested.toLowerCase()) : treasuries;

  return <Layout><main className="mx-auto max-w-6xl px-6 py-10">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-copper-400">On-chain journal</p><h1 className="mt-2 text-3xl font-semibold text-ledger-100">Activity</h1><p className="mt-2 max-w-2xl text-sm text-ledger-400">Only agent attempts are shown here: executed, rejected, or failed. Each record comes from treasury state.</p></div><div className="flex items-center gap-3">{refreshing && <RefreshIndicator />}{refreshedAt && <span className="text-xs text-ledger-500">Updated {refreshedAt.toLocaleTimeString()}</span>}</div></header>

    {resolving && <OnChainLoading label="Restoring your secure session" />}
    {!resolving && !account && <SignedOut />}
    {!resolving && account && loading && treasuries.length === 0 && <OnChainLoading label="Loading treasury activity" />}

    {account && !loading && selected.length === 0 && <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-sm text-ledger-300">No treasury activity is available for this wallet.</p><Link to="/dashboard" className="mt-4 inline-block text-copper-400">Back to dashboard →</Link></section>}

    {account && selected.length > 0 && <div className="mt-8 space-y-8">{selected.map((treasury, i) => <section key={treasury.address} className="rounded-2xl border border-ledger-700 bg-ledger-900 p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-ledger-500">Treasury {treasuries.length > 1 ? `#${treasuries.length - i}` : ""}</p><code className="mt-2 block text-xs text-verified-400">{short(treasury.address)}</code></div><Link to={`/dashboard?treasury=${treasury.address}`} className="text-sm text-copper-400">Overview →</Link></div>
      {treasury.activities.length === 0 ? <div className="mt-6 rounded-xl border border-ledger-800 bg-ledger-950 p-5"><p className="text-sm text-ledger-300">No proposals have been submitted yet.</p><p className="mt-1 text-xs text-ledger-500">The autonomous agent is waiting for a policy-bounded candidate.</p></div> : <div className="mt-6 divide-y divide-ledger-800">{treasury.activities.map(item => {
        const status = item.result === 1 ? "Executed" : item.result === 2 ? "Execution failed" : "Rejected";
        const tone = item.result === 1 ? "text-verified-400" : item.result === 2 ? "text-alert-400" : "text-copper-400";
        const when = item.resolvedAt ? new Date(item.resolvedAt * 1000).toLocaleString() : "Pending timestamp";
        return <article key={`${treasury.address}-${item.attemptId}`} className="py-5 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className={`text-sm font-semibold ${tone}`}>{status}</span><span className="rounded-full border border-ledger-700 px-2 py-0.5 text-[11px] text-ledger-400">{strategyLabel(item.strategy)}</span>{item.evidenceStatus === 2 && <span className="rounded-full border border-verified-500/30 px-2 py-0.5 text-[11px] text-verified-400">Evidence verified ✓</span>}</div><p className="mt-2 text-sm text-ledger-200">{reasonLabel(item.reason)}</p><p className="mt-1 text-xs text-ledger-500">Attempt #{item.attemptId} · {when}</p></div><details className="text-xs text-ledger-500"><summary className="cursor-pointer text-copper-400">Technical details</summary><p className="mt-2 break-all">Proposal {item.proposalId}</p></details></div>
        </article>;
      })}</div>}
    </section>)}</div>}
    {error && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>;
}

function SignedOut() { return <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-sm text-ledger-300">Sign in to view your treasury activity.</p><Link to="/signup" className="mt-4 inline-block rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950">Sign in</Link></section>; }

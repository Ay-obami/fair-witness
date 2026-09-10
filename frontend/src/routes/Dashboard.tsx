import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { FAIR_WITNESS_TREASURY_ABI } from "../lib/abi";
import { config } from "../lib/config";
import { reasonLabel } from "../lib/policyUi";
import { ensureSponsoredGas } from "../lib/sponsor";
import { creditcoinTestnet, client } from "../lib/thirdweb";
import { useAuthSession } from "../lib/authSession";
import { useOwnerTreasuries, type TreasuryView } from "../lib/useOwnerTreasuries";
import { humanError } from "../lib/humanError";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export default function Dashboard() {
  const [params] = useSearchParams();
  const { account, resolving } = useAuthSession();
  const { treasuries, loading, refreshing, error, refreshedAt, refresh } = useOwnerTreasuries(account?.address, params.get("treasury"));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function setAutomation(view: TreasuryView, next: number) {
    if (!account) return;
    if (view.automationMode === 1 && next === 0 && !confirm("Pause autonomous execution? The agent will stop executing new proposals until you enable it again.")) return;
    setBusy(view.address); setActionError(null);
    try {
      await ensureSponsoredGas(account.address);
      const signer = await ethers6Adapter.signer.toEthers({ client, chain: creditcoinTestnet, account });
      const treasury = new ethers.Contract(view.address, FAIR_WITNESS_TREASURY_ABI, signer);
      await (await treasury.setAutomationMode(next)).wait();
      await refresh();
    } catch (e) { setActionError(humanError(e)); }
    finally { setBusy(null); }
  }

  return <Layout><main className="mx-auto max-w-6xl px-6 py-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs uppercase tracking-widest text-copper-400">Owner console</p><h1 className="mt-2 text-3xl font-semibold text-ledger-100">Dashboard</h1><p className="mt-2 text-sm text-ledger-400">A quick view of portfolio state, agent status, and the latest on-chain decision.</p></div>
      <div className="flex items-center gap-3">{refreshing && <RefreshIndicator />}{refreshedAt && <span className="text-xs text-ledger-500">Updated {refreshedAt.toLocaleTimeString()}</span>}</div>
    </header>

    {resolving && <OnChainLoading label="Restoring your secure session" />}
    {!resolving && !account && <SignedOut />}
    {!resolving && account && loading && treasuries.length === 0 && <OnChainLoading />}
    {!resolving && account && !loading && treasuries.length === 0 && <Empty />}

    {account && treasuries.length > 0 && <>
      <div className="mt-6 flex items-center gap-3 text-xs text-ledger-500"><span className="rounded-full border border-ledger-700 px-3 py-1">Connected</span><span className="font-data">{short(account.address)}</span></div>
      <div className="mt-8 space-y-8">{treasuries.map((view, index) => <OverviewCard key={view.address} view={view} index={treasuries.length - index} busy={busy === view.address} onMode={setAutomation} />)}</div>
    </>}
    {(error || actionError) && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{actionError ?? error}</p>}
  </main></Layout>;
}

function OverviewCard({ view, index, busy, onMode }: { view: TreasuryView; index: number; busy: boolean; onMode: (view: TreasuryView, next: number) => Promise<void> }) {
  const active = view.automationMode === 1 && view.registered;
  const wctc = Number(ethers.formatUnits(view.wctcBalance, 18));
  const usd = Number(ethers.formatUnits(view.stableBalance, 6));
  const total = wctc + usd;
  const allocation = total ? Math.round((wctc / total) * 100) : 0;
  const target = Number(view.rebalance.targetWctcBps) / 100;
  const tolerance = Number(view.rebalance.toleranceBps) / 100;
  const latest = view.activities[0];
  const lastText = !latest ? "Waiting for first proposal" : latest.result === 1 ? "Executed" : latest.result === 2 ? "Execution failed" : "Rejected";

  return <article className="overflow-hidden rounded-2xl border border-ledger-700 bg-ledger-900">
    <div className="border-b border-ledger-800 p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-xs uppercase tracking-wider text-ledger-500">Treasury #{index}</p><h2 className="mt-2 text-2xl font-semibold text-ledger-100">{active ? "Agent Active" : "Agent Paused"}</h2><p className="mt-1 text-sm text-ledger-400">{active ? "Operating within your on-chain mandate" : "No autonomous proposal can execute"}</p></div>
        <span className={`rounded-full border px-3 py-1 text-xs ${active ? "border-verified-500/40 bg-verified-500/5 text-verified-400" : "border-alert-500/40 bg-alert-500/5 text-alert-400"}`}>● {active ? "ACTIVE" : "PAUSED"}</span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric title="Portfolio" value={`${total.toFixed(2)} demo units`} detail={`${wctc.toFixed(2)} fwWCTC · ${usd.toFixed(2)} fwUSD`} />
        <div className="rounded-xl border border-ledger-800 bg-ledger-950 p-4"><p className="text-xs text-ledger-500">WCTC allocation</p><p className="mt-1 text-2xl font-semibold text-ledger-100">{allocation}%</p><div className="mt-3 h-2 overflow-hidden rounded bg-ledger-800"><div className="h-full bg-verified-500 transition-all duration-500" style={{ width: `${Math.min(100, allocation)}%` }} /></div><p className="mt-2 text-xs text-ledger-400">Target {target}% · band {target - tolerance}%–{target + tolerance}%</p></div>
        <Metric title="Latest on-chain decision" value={lastText} detail={latest ? reasonLabel(latest.reason) : "Agent is ready for a policy-bounded candidate."} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => void onMode(view, view.automationMode === 1 ? 0 : 1)} className="rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Updating…" : view.automationMode === 1 ? "Pause agent" : "Enable agent"}</button>
        <Link to={`/activity?treasury=${view.address}`} className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300 hover:border-copper-500">View activity</Link>
        <Link to={`/safeguards?treasury=${view.address}`} className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300 hover:border-copper-500">View safeguards</Link>
        <a href={`${config.explorerBaseUrl}/address/${view.address}`} target="_blank" rel="noreferrer" className="px-4 py-2 text-sm text-ledger-400">Explorer ↗</a>
      </div>
    </div>
  </article>;
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-ledger-800 bg-ledger-950 p-4"><p className="text-xs text-ledger-500">{title}</p><p className="mt-1 text-xl font-semibold text-ledger-100">{value}</p><p className="mt-2 text-xs leading-relaxed text-ledger-400">{detail}</p></div>;
}
function SignedOut() { return <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><h2 className="text-lg font-semibold text-ledger-100">Sign in to your Fair Witness account</h2><p className="mt-2 text-sm text-ledger-400">Use the same Google, Apple, or email identity that owns your treasury.</p><Link to="/signup" className="mt-4 inline-block rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950">Sign in</Link></section>; }
function Empty() { return <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-ledger-300">No treasury found for this wallet.</p><Link to="/signup" className="mt-4 inline-block text-copper-400">Create your first treasury →</Link></section>; }

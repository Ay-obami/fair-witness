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
const LIFECYCLE_WRITE_ABI = [
  "function ownerExit(address asset,uint256 amount)",
  "function closeTreasury()",
  "error DemoTokenWithdrawalDisabled()",
  "error TreasuryClosed()",
];

export default function Dashboard() {
  const [params] = useSearchParams();
  const { account, resolving } = useAuthSession();
  const { treasuries, loading, refreshing, error, refreshedAt, refresh } = useOwnerTreasuries(account?.address, params.get("treasury"));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function signerContract(view: TreasuryView) {
    if (!account) throw new Error("Sign in before changing treasury settings.");
    await ensureSponsoredGas(account.address);
    const signer = await ethers6Adapter.signer.toEthers({ client, chain: creditcoinTestnet, account });
    return new ethers.Contract(view.address, [...FAIR_WITNESS_TREASURY_ABI, ...LIFECYCLE_WRITE_ABI], signer);
  }

  async function setAutomation(view: TreasuryView, next: number) {
    if (!account || view.closed) return;
    if (view.automationMode === 1 && next === 0 && !confirm("Pause autonomous execution? The agent will stop executing new proposals until you enable it again.")) return;
    setBusy(view.address); setActionError(null);
    try {
      const treasury = await signerContract(view);
      await (await treasury.setAutomationMode(next)).wait();
      await refresh();
    } catch (e) { setActionError(humanError(e)); }
    finally { setBusy(null); }
  }

  async function withdraw(view: TreasuryView, asset: string, symbol: string, decimals: number, balance: bigint) {
    if (!account || view.closed) return;
    if (view.demoMode) {
      setActionError("You can't withdraw demo tokens. fwWCTC and fwUSD are controlled test assets; closing the treasury recycles the remaining demo balance back into the faucet reserve.");
      return;
    }
    const maximum = ethers.formatUnits(balance, decimals);
    const raw = window.prompt(`How much ${symbol} do you want to withdraw? Maximum: ${maximum}`, maximum);
    if (raw === null) return;
    let amount: bigint;
    try { amount = ethers.parseUnits(raw.trim(), decimals); }
    catch { setActionError(`Enter a valid ${symbol} amount.`); return; }
    if (amount <= 0n || amount > balance) {
      setActionError(`Withdrawal must be greater than zero and no more than ${maximum} ${symbol}.`);
      return;
    }
    setBusy(view.address); setActionError(null);
    try {
      const treasury = await signerContract(view);
      await (await treasury.ownerExit(asset, amount)).wait();
      await refresh();
    } catch (e) {
      const message = humanError(e);
      setActionError(message.includes("DemoTokenWithdrawalDisabled")
        ? "You can't withdraw demo tokens. These controlled test assets must remain inside the Fair Witness demo system."
        : message);
    } finally { setBusy(null); }
  }

  async function closeTreasury(view: TreasuryView) {
    if (!account || view.closed) return;
    const warning = view.demoMode
      ? "Permanently close this treasury? This cannot be undone. Autonomous execution will stop forever and all remaining controlled demo tokens will be returned to the demo faucet reserve, not to your wallet. The on-chain activity journal will remain available."
      : "Permanently close this treasury? This cannot be undone. Autonomous execution will stop forever and all remaining supported assets will be returned to your owner wallet. The on-chain activity journal will remain available.";
    if (!confirm(warning)) return;
    setBusy(view.address); setActionError(null);
    try {
      const treasury = await signerContract(view);
      await (await treasury.closeTreasury()).wait();
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
      <div className="mt-8 space-y-8">{treasuries.map((view, index) => <OverviewCard key={view.address} view={view} index={treasuries.length - index} busy={busy === view.address} onMode={setAutomation} onWithdraw={withdraw} onClose={closeTreasury} />)}</div>
    </>}
    {(error || actionError) && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{actionError ?? error}</p>}
  </main></Layout>;
}

function OverviewCard({ view, index, busy, onMode, onWithdraw, onClose }: {
  view: TreasuryView;
  index: number;
  busy: boolean;
  onMode: (view: TreasuryView, next: number) => Promise<void>;
  onWithdraw: (view: TreasuryView, asset: string, symbol: string, decimals: number, balance: bigint) => Promise<void>;
  onClose: (view: TreasuryView) => Promise<void>;
}) {
  const active = !view.closed && view.automationMode === 1 && view.registered;
  const wctc = Number(ethers.formatUnits(view.wctcBalance, 18));
  const usd = Number(ethers.formatUnits(view.stableBalance, 6));
  const total = wctc + usd;
  const allocation = total ? Math.round((wctc / total) * 100) : 0;
  const stableAllocation = total ? Math.max(0, 100 - allocation) : 0;
  const target = Number(view.rebalance.targetWctcBps) / 100;
  const tolerance = Number(view.rebalance.toleranceBps) / 100;
  const latest = view.activities[0];
  const lastText = !latest ? "Waiting for first proposal" : latest.result === 1 ? "Executed" : latest.result === 2 ? "Execution failed" : "Rejected";
  const stateTitle = view.closed ? "Treasury Closed" : active ? "Agent Active" : "Agent Paused";
  const stateDetail = view.closed ? "Permanently inactive · historical journal preserved" : active ? "Operating within your on-chain mandate" : "No autonomous proposal can execute";

  return <article className="overflow-hidden rounded-2xl border border-ledger-700 bg-ledger-900">
    <div className="border-b border-ledger-800 p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-xs uppercase tracking-wider text-ledger-500">Treasury #{index}</p><h2 className="mt-2 text-2xl font-semibold text-ledger-100">{stateTitle}</h2><p className="mt-1 text-sm text-ledger-400">{stateDetail}</p></div>
        <span className={`rounded-full border px-3 py-1 text-xs ${view.closed ? "border-ledger-600 bg-ledger-800 text-ledger-300" : active ? "border-verified-500/40 bg-verified-500/5 text-verified-400" : "border-alert-500/40 bg-alert-500/5 text-alert-400"}`}>● {view.closed ? "CLOSED" : active ? "ACTIVE" : "PAUSED"}</span>
      </div>

      <section className="mt-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs uppercase tracking-widest text-ledger-500">Treasury assets</p><h3 className="mt-1 text-lg font-semibold text-ledger-100">Current token balances</h3></div>
          <p className="text-xs text-ledger-500">Balances are read directly from the treasury on Creditcoin.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <AssetCard symbol="fwWCTC" balance={wctc} allocation={allocation} address={view.wctc} />
          <AssetCard symbol="fwUSD" balance={usd} allocation={stableAllocation} address={view.stable} />
        </div>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-ledger-800 bg-ledger-950 p-5">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs text-ledger-500">WCTC allocation</p><p className="mt-1 text-3xl font-semibold text-ledger-100">{allocation}%</p></div><p className="text-right text-xs text-ledger-400">Target {target}%<br/>Allowed band {target - tolerance}%–{target + tolerance}%</p></div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ledger-800"><div className="h-full bg-verified-500 transition-all duration-500" style={{ width: `${Math.min(100, allocation)}%` }} /></div>
          <p className="mt-3 text-xs leading-relaxed text-ledger-500">Allocation is shown separately from token balances so the actual asset amounts remain the primary financial information.</p>
        </div>
        <Metric title="Latest on-chain decision" value={lastText} detail={latest ? reasonLabel(latest.reason) : "Agent is ready for a policy-bounded candidate."} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {!view.closed && <button disabled={busy} onClick={() => void onMode(view, view.automationMode === 1 ? 0 : 1)} className="rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950 disabled:opacity-50">{busy ? "Updating…" : view.automationMode === 1 ? "Pause agent" : "Enable agent"}</button>}
        <Link to={`/activity?treasury=${view.address}`} className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300 hover:border-copper-500">View activity</Link>
        <Link to={`/safeguards?treasury=${view.address}`} className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300 hover:border-copper-500">View safeguards</Link>
        <a href={`${config.explorerBaseUrl}/address/${view.address}`} target="_blank" rel="noreferrer" className="px-4 py-2 text-sm text-ledger-400">Explorer ↗</a>
      </div>

      <section className="mt-7 rounded-xl border border-ledger-800 bg-ledger-950/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-widest text-ledger-500">Treasury controls</p><h3 className="mt-1 text-base font-semibold text-ledger-100">Funds & lifecycle</h3></div>
          {view.demoMode && !view.closed && <span className="rounded-full border border-copper-500/30 bg-copper-500/5 px-3 py-1 text-xs text-copper-300">Controlled demo assets</span>}
        </div>
        {view.closed ? <p className="mt-3 text-sm leading-relaxed text-ledger-400">This treasury is permanently closed. It cannot be reactivated or accept new autonomous proposals. Its historical activity remains available above.</p> : <>
          <p className="mt-3 text-sm leading-relaxed text-ledger-400">{view.demoMode
            ? "Demo withdrawals are blocked on-chain. You can close the treasury when finished; any remaining fwWCTC and fwUSD are recycled to the demo faucet reserve."
            : "Withdraw supported assets to your owner wallet at any time, or permanently close the treasury and return all remaining supported assets."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled={busy || view.wctcBalance === 0n} onClick={() => void onWithdraw(view, view.wctc, "fwWCTC", 18, view.wctcBalance)} className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300 hover:border-copper-500 disabled:cursor-not-allowed disabled:opacity-40">Withdraw fwWCTC</button>
            <button disabled={busy || view.stableBalance === 0n} onClick={() => void onWithdraw(view, view.stable, "fwUSD", 6, view.stableBalance)} className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300 hover:border-copper-500 disabled:cursor-not-allowed disabled:opacity-40">Withdraw fwUSD</button>
            <button disabled={busy} onClick={() => void onClose(view)} className="rounded border border-alert-500/50 px-4 py-2 text-sm font-medium text-alert-400 hover:bg-alert-500/10 disabled:opacity-40">{busy ? "Processing…" : "Close treasury"}</button>
          </div>
        </>}
      </section>
    </div>
  </article>;
}

function AssetCard({ symbol, balance, allocation, address }: { symbol: string; balance: number; allocation: number; address: string }) {
  return <div className="rounded-2xl border border-ledger-700 bg-ledger-950 p-5 md:p-6">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-ledger-500">{symbol}</p><p className="mt-2 text-4xl font-semibold tracking-tight text-ledger-100 md:text-5xl">{balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p><p className="mt-2 text-sm text-ledger-400">{symbol} held by this treasury</p></div><span className="rounded-full border border-verified-500/30 bg-verified-500/5 px-3 py-1 text-xs font-medium text-verified-400">{allocation}%</span></div>
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-ledger-800 pt-4"><span className="text-xs text-ledger-500">Token contract</span><a href={`${config.explorerBaseUrl}/address/${address}`} target="_blank" rel="noreferrer" className="font-data text-xs text-ledger-400 hover:text-verified-400">{short(address)} ↗</a></div>
  </div>;
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-ledger-800 bg-ledger-950 p-5"><p className="text-xs text-ledger-500">{title}</p><p className="mt-1 text-2xl font-semibold text-ledger-100">{value}</p><p className="mt-3 text-xs leading-relaxed text-ledger-400">{detail}</p></div>;
}
function SignedOut() { return <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><h2 className="text-lg font-semibold text-ledger-100">Sign in to your Fair Witness account</h2><p className="mt-2 text-sm text-ledger-400">Use the same Google, Apple, or email identity that owns your treasury.</p><Link to="/signup" className="mt-4 inline-block rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950">Sign in</Link></section>; }
function Empty() { return <section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-ledger-300">No treasury found for this wallet.</p><Link to="/signup" className="mt-4 inline-block text-copper-400">Create your first treasury →</Link></section>; }

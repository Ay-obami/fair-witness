import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { ControlledMarketBadge, DecisionSequence, ExecutionRail, ProductMetric } from "../components/ProductVisuals";
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
  "function closed() view returns(bool)",
  "function owner() view returns(address)",
  "function automationMode() view returns(uint8)",
  "function setAutomationMode(uint8 mode)",
  "error DemoTokenWithdrawalDisabled()",
  "error TreasuryClosed()",
];

export default function Dashboard() {
  const [params] = useSearchParams();
  const { account, resolving } = useAuthSession();
  const { treasuries, loading, refreshing, error, refreshedAt, refresh } = useOwnerTreasuries(account?.address, params.get("treasury"));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  async function signerContract(view: TreasuryView) {
    if (!account) throw new Error("Sign in before changing treasury settings.");
    const readOnly = new ethers.Contract(view.address, LIFECYCLE_WRITE_ABI, new ethers.JsonRpcProvider(config.creditcoinRpcUrl));
    const owner = String(await readOnly.owner());
    if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error("This connected wallet is not the owner of this treasury. Reconnect with the wallet that created it.");
    await ensureSponsoredGas(account.address);
    const signer = await ethers6Adapter.signer.toEthers({ client, chain: creditcoinTestnet, account });
    return new ethers.Contract(view.address, [...FAIR_WITNESS_TREASURY_ABI, ...LIFECYCLE_WRITE_ABI], signer);
  }

  async function setAutomation(view: TreasuryView, next: number) {
    if (!account || view.closed) return;
    if (view.automationMode === 1 && next === 0 && !confirm("Pause autonomous execution? The agent will stop executing new proposals until you enable it again.")) return;
    setBusy(view.address); setActionError(null); setActionNotice(null);
    try {
      const treasury = await signerContract(view);
      if (Boolean(await treasury.closed())) { await refresh(); throw new Error("This treasury is already permanently closed."); }
      const current = Number(await treasury.automationMode());
      if (current === next) {
        setActionNotice(next === 1 ? "Agent is already enabled on-chain." : "Agent is already paused on-chain.");
        await refresh();
        return;
      }
      await treasury.setAutomationMode.staticCall(next);
      const receipt = await (await treasury.setAutomationMode(next)).wait();
      if (!receipt || receipt.status !== 1) throw new Error("The automation-mode transaction was not confirmed successfully.");
      const confirmed = Number(await treasury.automationMode());
      if (confirmed !== next) throw new Error("The transaction confirmed, but the treasury state did not update. Refresh and retry.");
      setActionNotice(next === 1 ? "Agent enabled on-chain." : "Agent paused on-chain. New autonomous proposals cannot execute.");
      await refresh();
    } catch (e) { setActionError(humanError(e)); }
    finally { setBusy(null); }
  }

  async function withdraw(view: TreasuryView, asset: string, symbol: string, decimals: number, balance: bigint) {
    if (!account || view.closed) return;
    if (view.demoMode) {
      setActionError("You can't withdraw demo tokens. fwWCTC and fwUSD are controlled test assets; closing the treasury recycles the remaining demo balance back into the faucet reserve.");
      setActionNotice(null);
      return;
    }
    const maximum = ethers.formatUnits(balance, decimals);
    const raw = window.prompt(`How much ${symbol} do you want to withdraw? Maximum: ${maximum}`, maximum);
    if (raw === null) return;
    let amount: bigint;
    try { amount = ethers.parseUnits(raw.trim(), decimals); }
    catch { setActionError(`Enter a valid ${symbol} amount.`); return; }
    if (amount <= 0n || amount > balance) { setActionError(`Withdrawal must be greater than zero and no more than ${maximum} ${symbol}.`); return; }
    setBusy(view.address); setActionError(null); setActionNotice(null);
    try {
      const treasury = await signerContract(view);
      if (Boolean(await treasury.closed())) throw new Error("This treasury is already permanently closed.");
      await treasury.ownerExit.staticCall(asset, amount);
      const receipt = await (await treasury.ownerExit(asset, amount)).wait();
      if (!receipt || receipt.status !== 1) throw new Error("The withdrawal transaction was not confirmed successfully.");
      setActionNotice(`${raw.trim()} ${symbol} withdrawn to the treasury owner.`);
      await refresh();
    } catch (e) {
      const message = humanError(e);
      setActionError(message.includes("DemoTokenWithdrawalDisabled") ? "You can't withdraw demo tokens. These controlled test assets must remain inside the Fair Witness demo system." : message);
    } finally { setBusy(null); }
  }

  async function closeTreasury(view: TreasuryView) {
    if (!account || view.closed) return;
    const warning = view.demoMode
      ? "Permanently close this treasury? This cannot be undone. Autonomous execution will stop forever and all remaining controlled demo tokens will be returned to the demo faucet reserve, not to your wallet. The on-chain activity journal will remain available."
      : "Permanently close this treasury? This cannot be undone. Autonomous execution will stop forever and all remaining supported assets will be returned to your owner wallet. The on-chain activity journal will remain available.";
    if (!confirm(warning)) return;
    setBusy(view.address); setActionError(null); setActionNotice(null);
    try {
      const treasury = await signerContract(view);
      if (Boolean(await treasury.closed())) { setActionNotice("Treasury is already closed on-chain."); await refresh(); return; }
      await treasury.closeTreasury.staticCall();
      const receipt = await (await treasury.closeTreasury()).wait();
      if (!receipt || receipt.status !== 1) throw new Error("The treasury-close transaction was not confirmed successfully.");
      if (!Boolean(await treasury.closed())) throw new Error("The close transaction confirmed, but the treasury did not report a closed state.");
      setActionNotice(view.demoMode ? "Treasury permanently closed. Remaining demo assets were recycled to the faucet reserve." : "Treasury permanently closed. Remaining supported assets were returned to the owner.");
      await refresh();
    } catch (e) { setActionError(humanError(e)); }
    finally { setBusy(null); }
  }

  const activeCount = treasuries.filter((view) => !view.closed && view.automationMode === 1 && view.registered).length;

  return <Layout><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-20 -top-24 h-72 w-72 bg-verified-500/15" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Owner command center</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Treasury operations</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ledger-400">Ownership, allocation, agent state and the latest policy-constrained decision — read directly from Creditcoin.</p></div>
        <div className="flex flex-wrap items-center gap-3">{refreshing && <RefreshIndicator />}{refreshedAt && <span className="fw-status-chip text-[10px] font-data">SYNC {refreshedAt.toLocaleTimeString()}</span>}</div>
      </div>
      {account && treasuries.length > 0 && <div className="relative z-10 mt-7 grid gap-3 sm:grid-cols-3">
        <ProductMetric eyebrow="Treasuries" value={String(treasuries.length)} detail="Discovered from the current factory" icon="TR" />
        <ProductMetric eyebrow="Autonomous" value={String(activeCount)} detail="Currently eligible for agent execution" icon="AI" />
        <ProductMetric eyebrow="Owner" value={short(account.address)} detail="Embedded account controlling these treasuries" icon="ID" />
      </div>}
    </header>

    {resolving && <OnChainLoading label="Restoring your secure session" />}
    {!resolving && !account && <SignedOut />}
    {!resolving && account && loading && treasuries.length === 0 && <OnChainLoading />}
    {!resolving && account && !loading && treasuries.length === 0 && <Empty />}

    {account && treasuries.length > 0 && <div className="mt-8 space-y-8">{treasuries.map((view, index) => <OverviewCard key={view.address} view={view} index={treasuries.length - index} busy={busy === view.address} onMode={setAutomation} onWithdraw={withdraw} onClose={closeTreasury} />)}</div>}
    {actionNotice && <p className="mt-5 rounded-xl border border-verified-500/30 bg-verified-500/5 p-3 text-sm text-verified-400">{actionNotice}</p>}
    {(error || actionError) && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{actionError ?? error}</p>}
  </main></Layout>;
}

function OverviewCard({ view, index, busy, onMode, onWithdraw, onClose }: {
  view: TreasuryView; index: number; busy: boolean;
  onMode: (view: TreasuryView, next: number) => Promise<void>;
  onWithdraw: (view: TreasuryView, asset: string, symbol: string, decimals: number, balance: bigint) => Promise<void>;
  onClose: (view: TreasuryView) => Promise<void>;
}) {
  const active = !view.closed && view.automationMode === 1 && view.registered;
  const wctc = Number(ethers.formatUnits(view.wctcBalance, 18));
  const usd = Number(ethers.formatUnits(view.stableBalance, 6));
  const hasPrice = view.wctcPriceE6 > 0n || view.wctcBalance === 0n;
  const wctcValueE6 = view.wctcPriceE6 > 0n ? view.wctcBalance * view.wctcPriceE6 / 10n ** 18n : 0n;
  const totalValueE6 = wctcValueE6 + view.stableBalance;
  const allocationBps = hasPrice && totalValueE6 > 0n ? Number(wctcValueE6 * 10_000n / totalValueE6) : null;
  const allocation = allocationBps === null ? null : allocationBps / 100;
  const stableAllocation = allocation === null ? null : Math.max(0, 100 - allocation);
  const target = Number(view.rebalance.targetWctcBps) / 100;
  const tolerance = Number(view.rebalance.toleranceBps) / 100;
  const latest = view.activities[0];
  const lastText = !latest ? "Waiting" : latest.result === 1 ? "Executed" : latest.result === 2 ? "Execution failed" : "Rejected";
  const stateTitle = view.closed ? "Treasury closed" : active ? "Agent active" : "Agent paused";
  const stateDetail = view.closed ? "Permanently inactive · historical journal preserved" : active ? "Operating inside the owner-defined mandate" : "No autonomous proposal can execute";
  const priceText = view.wctcPriceE6 > 0n ? `${Number(ethers.formatUnits(view.wctcPriceE6, 6)).toLocaleString(undefined, { maximumFractionDigits: 6 })} fwUSD / WCTC` : "Price unavailable";
  const railActive = view.closed ? 0 : active ? 5 : 3;

  return <article className="fw-command-surface overflow-hidden rounded-3xl border">
    <div className="border-b border-ledger-800 p-5 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-[10px] uppercase tracking-[.2em] text-ledger-500">Treasury #{index}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ledger-100">{stateTitle}</h2><p className="mt-2 text-sm text-ledger-400">{stateDetail}</p></div>
        <div className="flex items-center gap-3"><span className={`fw-status-chip text-[10px] font-semibold ${view.closed ? "text-ledger-300" : active ? "text-verified-400" : "text-alert-400"}`}><span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-verified-400 shadow-[0_0_12px_rgba(36,217,165,.65)]" : view.closed ? "bg-ledger-500" : "bg-alert-400"}`} />{view.closed ? "CLOSED" : active ? "AUTONOMOUS" : "PAUSED"}</span></div>
      </div>

      <TreasuryAddressRow address={view.address} />

      <div className="mt-6 rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Live execution pipeline</p><p className="mt-1 text-xs text-ledger-400">Observe → prove → reason → authorize → execute</p></div>{active && <span className="font-data text-[9px] text-verified-400">READY</span>}</div>
        <div className="mt-5"><ExecutionRail active={railActive} /></div>
      </div>

      <section className="mt-7">
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Treasury assets</p><h3 className="mt-1 text-lg font-semibold text-ledger-100">Current token balances</h3></div><p className="text-xs text-ledger-500">Read directly from Creditcoin</p></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><AssetCard symbol="fwWCTC" balance={wctc} allocation={allocation} address={view.wctc} /><AssetCard symbol="fwUSD" balance={usd} allocation={stableAllocation} address={view.stable} /></div>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-2xl border border-ledger-800 bg-ledger-950/65 p-5">
          <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-widest text-ledger-500">WCTC allocation</p><p className="mt-2 text-4xl font-semibold tracking-tight text-ledger-100">{allocation === null ? "—" : `${allocation.toFixed(2).replace(/\.00$/, "")}%`}</p></div><p className="text-right text-xs text-ledger-400">Target {target}%<br/>Band {target - tolerance}%–{target + tolerance}%</p></div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-ledger-800"><div className="h-full bg-gradient-to-r from-copper-500 to-verified-500 transition-all duration-700" style={{ width: `${allocation === null ? 0 : Math.min(100, allocation)}%` }} /></div>
          <p className="mt-3 text-xs leading-relaxed text-ledger-500">300-second destination TWAP · <span className="text-ledger-300">{priceText}</span></p>
        </div>
        <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest text-ledger-500">Latest decision</p><p className={`mt-1 text-xl font-semibold ${latest?.result === 1 ? "text-verified-400" : latest ? "text-alert-400" : "text-ledger-200"}`}>{lastText}</p></div>{latest && <span className="font-data text-[9px] text-ledger-600">ON-CHAIN</span>}</div>
          {latest ? <DecisionSequence blocked={latest.result !== 1} result={latest.result === 1 ? "EXECUTED" : latest.result === 2 ? "FAILED" : "BLOCKED"} reason={reasonLabel(latest.reason)} /> : <p className="rounded-xl border border-ledger-800 bg-ledger-950/60 p-4 text-xs leading-relaxed text-ledger-500">Waiting for the first policy-bounded candidate.</p>}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {!view.closed && <button disabled={busy} onClick={() => void onMode(view, view.automationMode === 1 ? 0 : 1)} className="fw-primary-button w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{busy ? "Updating…" : view.automationMode === 1 ? "Pause agent" : "Enable agent"}</button>}
        <Link to={`/activity?treasury=${view.address}`} className="fw-secondary-button w-full rounded-xl px-4 py-2.5 text-center text-sm text-ledger-300 sm:w-auto">View activity</Link>
        <Link to={`/safeguards?treasury=${view.address}`} className="fw-secondary-button w-full rounded-xl px-4 py-2.5 text-center text-sm text-ledger-300 sm:w-auto">View safeguards</Link>
        <a href={`${config.explorerBaseUrl}/address/${view.address}`} target="_blank" rel="noreferrer" className="w-full px-4 py-2.5 text-center text-sm text-ledger-400 transition hover:text-ledger-200 sm:w-auto">Explorer ↗</a>
      </div>

      <section className="mt-7 rounded-2xl border border-ledger-800 bg-ledger-950/45 p-4 sm:p-5">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Treasury controls</p><h3 className="mt-1 text-base font-semibold text-ledger-100">Funds & lifecycle</h3></div>{view.demoMode && !view.closed && <ControlledMarketBadge />}</div>
        {view.closed ? <p className="mt-3 text-sm leading-relaxed text-ledger-400">This treasury is permanently closed. It cannot be reactivated or accept new autonomous proposals. Its historical activity remains available.</p> : <>
          <p className="mt-3 text-sm leading-relaxed text-ledger-400">{view.demoMode ? "Demo withdrawals are blocked on-chain. Close the treasury when finished; remaining fwWCTC and fwUSD are recycled to the demo faucet reserve." : "Withdraw supported assets to your owner wallet at any time, or permanently close the treasury and return all remaining supported assets."}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button disabled={busy || view.wctcBalance === 0n} onClick={() => void onWithdraw(view, view.wctc, "fwWCTC", 18, view.wctcBalance)} className="fw-secondary-button w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm text-ledger-300 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">Withdraw fwWCTC</button>
            <button disabled={busy || view.stableBalance === 0n} onClick={() => void onWithdraw(view, view.stable, "fwUSD", 6, view.stableBalance)} className="fw-secondary-button w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm text-ledger-300 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">Withdraw fwUSD</button>
            <button disabled={busy} onClick={() => void onClose(view)} className="w-full cursor-pointer rounded-xl border border-alert-500/45 px-4 py-2.5 text-sm font-medium text-alert-400 transition hover:bg-alert-500/10 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">{busy ? "Processing…" : "Close treasury"}</button>
          </div>
        </>}
      </section>
    </div>
  </article>;
}

function TreasuryAddressRow({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copyAddress() {
    try { await navigator.clipboard.writeText(address); }
    catch { const input = document.createElement("textarea"); input.value = address; input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove(); }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }
  return <div className="mt-5 rounded-2xl border border-ledger-800 bg-ledger-950/60 p-3 sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Treasury funding address</p><p className="mt-1 break-all font-data text-xs text-ledger-200 sm:text-sm">{address}</p></div><div className="grid shrink-0 grid-cols-2 gap-2 sm:flex"><button type="button" onClick={() => void copyAddress()} className="fw-secondary-button cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-ledger-200">{copied ? "✓ Copied" : "⧉ Copy"}</button><a href={`${config.explorerBaseUrl}/address/${address}`} target="_blank" rel="noreferrer" className="fw-secondary-button rounded-lg px-3 py-2 text-center text-xs text-ledger-400">Explorer ↗</a></div></div></div>;
}

function AssetCard({ symbol, balance, allocation, address }: { symbol: string; balance: number; allocation: number | null; address: string }) {
  return <div className="relative overflow-hidden rounded-2xl border border-ledger-800 bg-ledger-950/65 p-5 sm:p-6"><div className="fw-ambient-orb -right-16 -top-20 h-44 w-44 bg-verified-500/10" /><div className="relative z-10 flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">{symbol}</p><p className="mt-2 break-all text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">{balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p><p className="mt-2 text-sm text-ledger-400">Held by this treasury</p></div><span className="fw-status-chip shrink-0 text-[10px] text-verified-400">{allocation === null ? "—" : `${allocation.toFixed(2).replace(/\.00$/, "")}%`}</span></div><div className="relative z-10 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ledger-800 pt-4"><span className="text-xs text-ledger-500">Token contract</span><a href={`${config.explorerBaseUrl}/address/${address}`} target="_blank" rel="noreferrer" className="font-data text-xs text-ledger-400 hover:text-verified-400">{short(address)} ↗</a></div></div>;
}

function SignedOut() { return <section className="fw-glass mt-8 rounded-3xl p-6"><p className="fw-kicker">Secure session</p><h2 className="mt-4 text-2xl font-semibold text-ledger-100">Sign in to your command center</h2><p className="mt-2 text-sm text-ledger-400">Use the same Google, Apple, or email identity that owns your treasury.</p><Link to="/signup" className="fw-primary-button mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold">Sign in →</Link></section>; }
function Empty() { return <section className="fw-glass mt-8 rounded-3xl p-6"><p className="fw-kicker">No treasury yet</p><h2 className="mt-4 text-2xl font-semibold text-ledger-100">Deploy your first autonomous treasury</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-ledger-400">Define the mandate first. Fair Witness will deploy a user-owned treasury that the agent can operate only within those limits.</p><Link to="/mandate" className="fw-primary-button mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold">Create treasury →</Link></section>; }

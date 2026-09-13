import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { Layout } from "../components/layout";
import { OnChainLoading, RefreshIndicator } from "../components/OnChainLoading";
import { ControlledMarketBadge } from "../components/ProductVisuals";
import { useAuthSession } from "../lib/authSession";
import { useOwnerTreasuries, type ActivityItem, type TreasuryView } from "../lib/useOwnerTreasuries";
import { reasonLabel, strategyLabel } from "../lib/policyUi";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const percent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
type ActivityFilter = "all" | "executed" | "blocked" | "failed";

const REASON_EXPLANATIONS: Record<number, string> = {
  3: "Autonomous execution was paused, so the treasury refused to move funds.",
  4: "This strategy is disabled by the owner's mandate.",
  6: "The proposal referenced an asset outside the treasury's fixed asset set.",
  7: "The proposal referenced a venue outside the treasury's fixed execution venue.",
  10: "The requested slippage exceeded the maximum chosen by the owner.",
  12: "This proposal had already been processed, so replay protection blocked it.",
  13: "The agent nonce had already been used, so the treasury rejected the duplicate request.",
  14: "The same verified evidence had already authorized an execution and could not be reused.",
  15: "The supplied cross-chain evidence could not be verified.",
  16: "The evidence was too old to authorize a new financial action.",
  18: "The source market moved too much between verified observations for policy to trust the signal.",
  19: "The verified source market did not have enough liquidity to satisfy the mandate.",
  21: "The destination market did not have enough liquidity for the proposed action.",
  22: "The destination spot price deviated too far from its TWAP for safe execution.",
  24: "The verified arbitrage opportunity was below the owner's minimum net-edge threshold.",
  25: "The portfolio was already inside the owner's rebalance band.",
  26: "WCTC exposure remained below the owner's risk ceiling.",
  28: "The proposed action was larger than the owner's maximum permitted size.",
  29: "The proposed amount did not match the amount independently permitted by policy.",
  30: "The treasury had already reached the owner's daily risk-reduction allowance.",
  31: "The treasury did not hold enough of the required asset to execute safely.",
  32: "The treasury had reached its execution-rate limit for the current policy epoch.",
  33: "Authorization passed, but the downstream venue execution reverted.",
};

export default function Activity() {
  const [params] = useSearchParams();
  const requested = params.get("treasury");
  const { account, resolving } = useAuthSession();
  const { treasuries, loading, refreshing, error, refreshedAt } = useOwnerTreasuries(account?.address, requested);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const selected = requested ? treasuries.filter(t => t.address.toLowerCase() === requested.toLowerCase()) : treasuries;
  const all = selected.flatMap(t => t.activities);
  const counts = { total: all.length, executed: all.filter(a=>a.result===1).length, blocked: all.filter(a=>a.result===0).length, failed: all.filter(a=>a.result===2).length };

  return <Layout><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-20 -top-24 h-72 w-72 bg-copper-500/12" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Decision provenance</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">On-chain decision journal</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Every submitted proposal leaves a trace: verified evidence, deterministic authorization and the final treasury outcome. Off-chain WAIT cycles are intentionally not presented as on-chain attempts.</p></div><div className="flex flex-wrap items-center gap-3">{refreshing && <RefreshIndicator />}{refreshedAt && <span className="fw-status-chip text-[10px] font-data">SYNC {refreshedAt.toLocaleTimeString()}</span>}</div></div>
      {account && selected.length > 0 && <div className="relative z-10 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4"><MiniStat label="Attempts" value={String(counts.total)} /><MiniStat label="Executed" value={String(counts.executed)} tone="good" /><MiniStat label="Policy blocked" value={String(counts.blocked)} tone="warn" /><MiniStat label="Execution failed" value={String(counts.failed)} tone="danger" /></div>}
    </header>

    {account && selected.length > 0 && <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-ledger-800 bg-ledger-950/45 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Journal filter</p><p className="mt-1 text-xs text-ledger-400">Separate successful execution from deterministic rejection and downstream failure.</p></div><div className="grid grid-cols-2 gap-2 sm:flex" role="group" aria-label="Filter activity journal">{(["all","executed","blocked","failed"] as const).map(value=><button key={value} type="button" onClick={()=>setFilter(value)} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium capitalize transition ${filter===value?"border-copper-500/45 bg-copper-500/10 text-copper-400":"border-ledger-800 bg-ledger-950/50 text-ledger-400 hover:text-ledger-200"}`}>{value}</button>)}</div></div>}

    {resolving && <OnChainLoading label="Restoring your secure session" />}
    {!resolving && !account && <SignedOut />}
    {!resolving && account && loading && treasuries.length === 0 && <OnChainLoading label="Loading treasury activity" />}
    {account && !loading && selected.length === 0 && <section className="fw-glass mt-8 rounded-3xl p-6"><p className="text-sm text-ledger-300">No treasury activity is available for this wallet.</p><Link to="/dashboard" className="mt-4 inline-block text-copper-400">Back to dashboard →</Link></section>}

    {account && selected.length > 0 && <div className="mt-8 space-y-8">{selected.map((treasury,i)=>{
      const visible = treasury.activities.filter(item=>matchesFilter(item,filter));
      return <section key={treasury.address} className="fw-command-surface rounded-3xl border p-4 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Treasury {treasuries.length>1?`#${treasuries.length-i}`:""}</p><code className="mt-2 block font-data text-xs text-verified-400">{short(treasury.address)}</code></div><div className="grid grid-cols-2 gap-2 sm:flex"><Link to={`/dashboard?treasury=${treasury.address}`} className="fw-secondary-button rounded-xl px-4 py-2 text-center text-xs text-ledger-300 sm:text-sm">Overview →</Link><Link to={`/safeguards?treasury=${treasury.address}`} className="fw-secondary-button rounded-xl px-4 py-2 text-center text-xs text-ledger-300 sm:text-sm">Safeguards →</Link></div></div>
        {treasury.activities.length===0 ? <EmptyJournal /> : visible.length===0 ? <div className="mt-6 rounded-2xl border border-ledger-800 bg-ledger-950/60 p-5"><p className="text-sm text-ledger-300">No {filter} attempts in this treasury.</p><button onClick={()=>setFilter("all")} className="mt-3 cursor-pointer text-xs font-medium text-copper-400">Show all journal entries →</button></div> : <div className="relative mt-7 space-y-5 before:absolute before:bottom-3 before:left-[1.05rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-copper-500/45 before:via-verified-500/25 before:to-transparent sm:before:left-[1.15rem]">{visible.map(item=><ActivityEntry key={`${treasury.address}-${item.attemptId}`} item={item} treasury={treasury} />)}</div>}
      </section>;
    })}</div>}
    {error && <p className="mt-5 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>;
}

function ActivityEntry({ item, treasury }: { item: ActivityItem; treasury: TreasuryView }) {
  const status = item.result===1?"Executed":item.result===2?"Execution failed":"Policy blocked";
  const outcome = item.result===1?"EXECUTED":item.result===2?"FAILED":"BLOCKED";
  const tone = item.result===1?"text-verified-400":item.result===2?"text-alert-400":"text-copper-400";
  const border = item.result===1?"border-verified-500/30":item.result===2?"border-alert-500/35":"border-copper-500/30";
  const amount = item.amountInActual>0n?item.amountInActual:item.proposedAmountIn;
  const policy = item.reason===0?"All checks passed":reasonLabel(item.reason);
  const evidence = item.evidenceStatus===2?"Verified":item.evidenceStatus===1?"Invalid":"Not verified";
  const when = item.resolvedAt?new Date(item.resolvedAt*1000).toLocaleString():"Pending timestamp";
  return <article className="relative pl-10 sm:pl-12"><div className={`absolute left-0 top-1 grid h-8 w-8 place-items-center rounded-full border bg-ledger-950 font-data text-[9px] sm:h-9 sm:w-9 ${border} ${tone}`}>{String(item.attemptId).slice(-2)}</div><div className="overflow-hidden rounded-2xl border border-ledger-800 bg-ledger-950/48">
    <div className="p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`text-base font-semibold ${tone}`}>{status}</span><span className="fw-status-chip text-[9px]">{strategyLabel(item.strategy)}</span>{item.evidenceStatus===2&&<span className="fw-status-chip text-[9px] text-verified-400"><span className="fw-status-dot" /> Evidence verified</span>}</div><p className="mt-2 text-xs text-ledger-500">Attempt #{item.attemptId} · {when}</p></div><span className={`self-start rounded-full border px-3 py-1.5 font-data text-[9px] tracking-widest ${border} ${tone}`}>{outcome}</span></div>
    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Strategy" value={strategyLabel(item.strategy)} /><Metric label="Action size" value={amount>0n?`${formatAmount(amount,item.assetIn,treasury)} ${assetName(item.assetIn,treasury)}`:"—"} /><Metric label="Evidence" value={evidence} tone={item.evidenceStatus===2?"good":item.evidenceStatus===1?"danger":undefined} /><Metric label="Policy result" value={policy} tone={item.reason===0?"good":"warn"} /></div>
    <DecisionPath item={item} />
    <div className="mt-4 rounded-xl border border-ledger-800 bg-ledger-950/60 p-4"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-copper-400">Why this happened</p><p className="mt-2 max-w-4xl text-sm leading-relaxed text-ledger-200">{humanExplanation(item)}</p>{(item.currentWctcBps>0||item.referenceBps>0)&&<div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ledger-500">{item.currentWctcBps>0&&<span>Observed WCTC <span className="text-ledger-300">{percent(item.currentWctcBps)}</span></span>}{item.referenceBps>0&&<span>Policy reference <span className="text-ledger-300">{percent(item.referenceBps)}</span></span>}</div>}</div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"><Link to={`/decision/${treasury.address}/${item.attemptId}`} className="fw-primary-button rounded-xl px-4 py-2.5 text-center text-xs font-semibold">Inspect full audit trace →</Link><span className="text-[10px] leading-relaxed text-ledger-600">Reads the complete schema-v1 attempt record directly from Creditcoin.</span></div>
    </div>
    <details className="border-t border-ledger-800 bg-ledger-950/55 px-4 py-3 sm:px-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xs font-medium text-ledger-300 marker:hidden"><span>Technical audit fields</span><span className="text-copper-400">Expand +</span></summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><Technical label="Proposal ID" value={item.proposalId} /><Technical label="Attempt ID" value={String(item.attemptId)} /><Technical label="Input asset" value={`${assetName(item.assetIn,treasury)} · ${item.assetIn}`} /><Technical label="Reason code" value={`${item.reason} · ${policy}`} /></div></details>
  </div></article>;
}

function DecisionPath({item}:{item:ActivityItem}) {
  const evidenceBlocked=item.evidenceStatus===1||[15,16,17,18,19].includes(item.reason);
  const policyPassed=item.reason===0||item.result===2;
  const stages=[{label:"Proposal",state:"done",detail:"Submitted"},{label:"Evidence",state:evidenceBlocked?"bad":item.evidenceStatus===2?"done":"idle",detail:evidenceBlocked?"Rejected":item.evidenceStatus===2?"Verified":"Checked"},{label:"Policy",state:policyPassed?"done":evidenceBlocked?"idle":"bad",detail:policyPassed?"Passed":evidenceBlocked?"Not reached":"Blocked"},{label:"Treasury",state:item.result===1?"done":item.result===2?"bad":"idle",detail:item.result===1?"Executed":item.result===2?"Reverted":"No movement"}];
  return <div className="mt-5 rounded-xl border border-ledger-800 bg-ledger-950/35 p-3 sm:p-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Authorization trace</p><span className="font-data text-[9px] text-ledger-600">ON-CHAIN</span></div><div className="grid gap-2 sm:grid-cols-4">{stages.map((stage,index)=><div key={stage.label} className="relative flex items-center gap-3 rounded-lg border border-ledger-800 bg-ledger-950/65 p-3 sm:block sm:text-center"><div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border font-data text-[9px] sm:mx-auto ${stage.state==="done"?"border-verified-500/45 text-verified-400":stage.state==="bad"?"border-alert-500/45 text-alert-400":"border-ledger-700 text-ledger-600"}`}>{stage.state==="done"?"✓":stage.state==="bad"?"×":String(index+1).padStart(2,"0")}</div><div className="min-w-0 sm:mt-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-ledger-300">{stage.label}</p><p className={`mt-0.5 text-[10px] ${stage.state==="done"?"text-verified-400":stage.state==="bad"?"text-alert-400":"text-ledger-600"}`}>{stage.detail}</p></div>{index<stages.length-1&&<span className="absolute -right-[.58rem] top-1/2 z-10 hidden -translate-y-1/2 text-ledger-700 sm:block">→</span>}</div>)}</div></div>;
}

function humanExplanation(item:ActivityItem) { if(item.result===1)return item.strategy===1?"The portfolio was outside its rebalance state. Verified evidence and deterministic policy checks passed, so the treasury executed a bounded rebalance.":item.strategy===2?"The treasury detected a policy-defined risk condition. Verified evidence and authorization checks passed, so exposure was reduced within the owner's limits.":"Verified cross-chain evidence satisfied the configured arbitrage conditions and every deterministic policy check passed."; if(item.result===2)return "The proposal passed authorization, but execution reverted at the venue. The failure remains recorded on-chain."; return REASON_EXPLANATIONS[item.reason]??`The treasury rejected this proposal because ${reasonLabel(item.reason).toLowerCase()}. No unauthorized capital movement occurred.`; }
function matchesFilter(item:ActivityItem,filter:ActivityFilter){return filter==="all"||(filter==="executed"&&item.result===1)||(filter==="blocked"&&item.result===0)||(filter==="failed"&&item.result===2);}
function assetName(address:string,t:TreasuryView){const v=address.toLowerCase();return v===t.wctc.toLowerCase()?"fwWCTC":v===t.stable.toLowerCase()?"fwUSD":short(address);}
function formatAmount(amount:bigint,asset:string,t:TreasuryView){const decimals=asset.toLowerCase()===t.wctc.toLowerCase()?18:6;const n=Number(ethers.formatUnits(amount,decimals));return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:4}):ethers.formatUnits(amount,decimals);}
function Metric({label,value,tone}:{label:string;value:string;tone?:"good"|"warn"|"danger"}){const c=tone==="good"?"text-verified-400":tone==="warn"?"text-copper-400":tone==="danger"?"text-alert-400":"text-ledger-200";return <div className="rounded-xl border border-ledger-800 bg-ledger-950/55 p-3"><p className="text-[9px] uppercase tracking-[.16em] text-ledger-600">{label}</p><p className={`mt-1.5 break-words text-xs font-medium ${c}`}>{value}</p></div>;}
function Technical({label,value}:{label:string;value:string}){return <div className="min-w-0"><p className="text-[9px] uppercase tracking-[.16em] text-ledger-600">{label}</p><p className="mt-1 break-all font-data text-[11px] leading-relaxed text-ledger-400">{value}</p></div>;}
function MiniStat({label,value,tone}:{label:string;value:string;tone?:"good"|"warn"|"danger"}){return <div className="rounded-2xl border border-ledger-800 bg-ledger-950/45 p-4"><p className="text-[10px] uppercase tracking-[.16em] text-ledger-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${tone==="good"?"text-verified-400":tone==="warn"?"text-copper-400":tone==="danger"?"text-alert-400":"text-ledger-100"}`}>{value}</p></div>;}
function EmptyJournal(){return <div className="mt-6 rounded-2xl border border-ledger-800 bg-ledger-950/60 p-5"><p className="text-sm text-ledger-300">No proposals have been submitted yet.</p><p className="mt-1 text-xs text-ledger-500">The autonomous agent is waiting for a policy-bounded candidate.</p></div>;}
function SignedOut(){return <section className="fw-glass mt-8 rounded-3xl p-6"><p className="fw-kicker">Private journal</p><h2 className="mt-4 text-2xl font-semibold text-ledger-100">Sign in to inspect your treasury history</h2><p className="mt-2 text-sm text-ledger-400">The on-chain journal stays public and verifiable; this view organizes your treasuries into a readable decision timeline.</p><Link to="/signup" className="fw-primary-button mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold">Sign in →</Link></section>;}

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ethers } from "ethers";
import { Layout } from "../components/layout";
import { ControlledMarketBadge } from "../components/ProductVisuals";
import { FAIR_WITNESS_TREASURY_ABI } from "../lib/abi";
import { config } from "../lib/config";
import { reasonLabel, strategyLabel } from "../lib/policyUi";
import { humanError } from "../lib/humanError";

type AttemptRecord = {
  attemptId: bigint; nonce: bigint; submittedAt: bigint; resolvedAt: bigint;
  sourceChainKey: bigint; sourceBlockHeight: bigint; sourceTxIndex: bigint;
  confirmBlockHeight: bigint; confirmTxIndex: bigint;
  agent: string; assetIn: string; assetOut: string; venue: string;
  strategy: number; action: number; result: number; evidenceStatus: number; reason: number;
  proposedAmountIn: bigint; permittedValueE6: bigint; amountInActual: bigint; amountOutActual: bigint;
  currentWctcBps: number; referenceBps: number;
  proposalId: string; executionKey: string; evidenceHash: string; observationHash: string;
  decisionHash: string; policyHash: string; evaluatedStateHash: string;
};

type DecisionData = {
  attempt: AttemptRecord;
  wctc: string;
  stable: string;
  owner: string;
  currentPolicyHash: string;
  policyEpoch: bigint;
};

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export default function DecisionDetail() {
  const { treasury, attemptId } = useParams();
  const provider = useMemo(() => new ethers.JsonRpcProvider(config.creditcoinRpcUrl), []);
  const [data, setData] = useState<DecisionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true); setError(null); setData(null);
      try {
        if (!treasury || !ethers.isAddress(treasury)) throw new Error("A valid treasury address is required.");
        if (!attemptId || !/^\d+$/.test(attemptId)) throw new Error("A valid attempt ID is required.");
        const address = ethers.getAddress(treasury);
        const contract = new ethers.Contract(address, FAIR_WITNESS_TREASURY_ABI, provider);
        const [raw, wctc, stable, owner, currentPolicyHash, policyEpoch] = await Promise.all([
          contract.getAttempt(BigInt(attemptId)), contract.WCTC(), contract.STABLE(), contract.owner(), contract.currentPolicyHash(), contract.policyEpoch(),
        ]);
        if (BigInt(raw.attemptId) === 0n) throw new Error(`Attempt #${attemptId} does not exist in this treasury.`);
        const attempt: AttemptRecord = {
          attemptId: BigInt(raw.attemptId), nonce: BigInt(raw.nonce), submittedAt: BigInt(raw.submittedAt), resolvedAt: BigInt(raw.resolvedAt),
          sourceChainKey: BigInt(raw.sourceChainKey), sourceBlockHeight: BigInt(raw.sourceBlockHeight), sourceTxIndex: BigInt(raw.sourceTxIndex),
          confirmBlockHeight: BigInt(raw.confirmBlockHeight), confirmTxIndex: BigInt(raw.confirmTxIndex),
          agent: String(raw.agent), assetIn: String(raw.assetIn), assetOut: String(raw.assetOut), venue: String(raw.venue),
          strategy: Number(raw.strategy), action: Number(raw.action), result: Number(raw.result), evidenceStatus: Number(raw.evidenceStatus), reason: Number(raw.reason),
          proposedAmountIn: BigInt(raw.proposedAmountIn), permittedValueE6: BigInt(raw.permittedValueE6), amountInActual: BigInt(raw.amountInActual), amountOutActual: BigInt(raw.amountOutActual),
          currentWctcBps: Number(raw.currentWctcBps), referenceBps: Number(raw.referenceBps),
          proposalId: String(raw.proposalId), executionKey: String(raw.executionKey), evidenceHash: String(raw.evidenceHash), observationHash: String(raw.observationHash),
          decisionHash: String(raw.decisionHash), policyHash: String(raw.policyHash), evaluatedStateHash: String(raw.evaluatedStateHash),
        };
        if (!cancelled) setData({ attempt, wctc: String(wctc), stable: String(stable), owner: String(owner), currentPolicyHash: String(currentPolicyHash), policyEpoch: BigInt(policyEpoch) });
      } catch (e) { if (!cancelled) setError(humanError(e, "Could not reconstruct this schema-v1 attempt.")); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [attemptId, provider, treasury]);

  return <Layout><main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-20 -top-24 h-72 w-72 bg-external-500/12" />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Schema-v1 audit trace</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Decision detail</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Reconstruct one submitted attempt from the treasury's append-only on-chain record: source evidence identifiers, deterministic policy result and final capital outcome.</p></div>{data && <OutcomeBadge result={data.attempt.result} />}</div>
    </header>

    {loading && <section className="fw-glass mt-8 rounded-3xl p-6 text-sm text-ledger-400">Reading attempt #{attemptId} directly from Creditcoin…</section>}
    {error && <section className="mt-8 rounded-3xl border border-alert-500/30 bg-alert-500/5 p-6"><p className="text-sm text-alert-400">{error}</p><Link to="/activity" className="mt-4 inline-block text-sm text-copper-400">← Back to activity</Link></section>}

    {data && <DecisionAudit data={data} treasuryAddress={ethers.getAddress(treasury!)} />}
  </main></Layout>;
}

function DecisionAudit({ data, treasuryAddress }: { data: DecisionData; treasuryAddress: string }) {
  const { attempt, wctc, stable } = data;
  const resultText = attempt.result === 1 ? "Executed" : attempt.result === 2 ? "Execution failed" : "Policy blocked";
  const reason = attempt.reason === 0 ? "All policy checks passed" : reasonLabel(attempt.reason);
  const evidence = attempt.evidenceStatus === 2 ? "Verified" : attempt.evidenceStatus === 1 ? "Invalid" : "Not checked";
  const inSymbol = symbol(attempt.assetIn, wctc, stable);
  const outSymbol = symbol(attempt.assetOut, wctc, stable);
  const input = formatToken(attempt.amountInActual > 0n ? attempt.amountInActual : attempt.proposedAmountIn, attempt.assetIn, wctc, stable);
  const output = formatToken(attempt.amountOutActual, attempt.assetOut, wctc, stable);
  const submitted = Number(attempt.submittedAt) ? new Date(Number(attempt.submittedAt) * 1000).toLocaleString() : "Not recorded";
  const resolved = Number(attempt.resolvedAt) ? new Date(Number(attempt.resolvedAt) * 1000).toLocaleString() : "Not recorded";

  return <div className="mt-8 space-y-6">
    <section className="fw-command-surface rounded-3xl border p-5 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Attempt #{attempt.attemptId.toString()}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ledger-100">{resultText}</h2><p className="mt-2 text-sm text-ledger-400">{strategyLabel(attempt.strategy)} · {reason}</p></div><div className="flex flex-wrap gap-2"><Link to={`/activity?treasury=${treasuryAddress}`} className="fw-secondary-button rounded-xl px-4 py-2 text-sm text-ledger-300">Back to journal</Link><a href={`${config.explorerBaseUrl}/address/${treasuryAddress}`} target="_blank" rel="noreferrer" className="fw-secondary-button rounded-xl px-4 py-2 text-sm text-ledger-300">Treasury ↗</a></div></div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Strategy" value={strategyLabel(attempt.strategy)} /><Metric label="Evidence" value={evidence} tone={attempt.evidenceStatus === 2 ? "good" : attempt.evidenceStatus === 1 ? "bad" : undefined} /><Metric label="Policy" value={reason} tone={attempt.reason === 0 ? "good" : "warn"} /><Metric label="Outcome" value={resultText} tone={attempt.result === 1 ? "good" : attempt.result === 2 ? "bad" : "warn"} /></div>

      <AuthorizationPath attempt={attempt} />
    </section>

    <section className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
      <div className="fw-command-surface rounded-3xl border p-5 sm:p-6"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Capital path</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">What the treasury was asked to do</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Metric label="Input" value={`${input} ${inSymbol}`} /><Metric label="Output actual" value={attempt.amountOutActual > 0n ? `${output} ${outSymbol}` : "No output recorded"} /><Metric label="Permitted value" value={`${ethers.formatUnits(attempt.permittedValueE6, 6)} fwUSD`} /><Metric label="Nonce" value={attempt.nonce.toString()} /></div>{(attempt.currentWctcBps > 0 || attempt.referenceBps > 0) && <div className="mt-5 rounded-xl border border-ledger-800 bg-ledger-950/55 p-4"><p className="text-[10px] uppercase tracking-widest text-ledger-500">Portfolio context</p><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ledger-300">{attempt.currentWctcBps > 0 && <span>Observed WCTC <b className="text-ledger-100">{pct(attempt.currentWctcBps)}</b></span>}{attempt.referenceBps > 0 && <span>Policy reference <b className="text-ledger-100">{pct(attempt.referenceBps)}</b></span>}</div></div>}</div>

      <div className="fw-command-surface rounded-3xl border p-5 sm:p-6"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Timing & authority</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Who submitted and when</h2><div className="mt-5 space-y-3"><Row label="Submitted" value={submitted} /><Row label="Resolved" value={resolved} /><Row label="Agent" value={short(attempt.agent)} mono /><Row label="Owner" value={short(data.owner)} mono /><Row label="Policy epoch" value={data.policyEpoch.toString()} /></div><p className="mt-5 rounded-xl border border-ledger-800 bg-ledger-950/55 p-3 text-xs leading-relaxed text-ledger-500">The on-chain attempt commits to a decision hash, but it does not store the model's prose rationale. This page therefore shows only facts the current schema-v1 treasury actually records.</p></div>
    </section>

    <section className="fw-command-surface rounded-3xl border p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Attestcoin evidence identifiers</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Cross-chain evidence committed to this attempt</h2></div><span className={`fw-status-chip text-[9px] ${attempt.evidenceStatus === 2 ? "text-verified-400" : "text-alert-400"}`}>{evidence.toUpperCase()}</span></div><div className="mt-5 grid gap-4 md:grid-cols-2"><EvidenceBlock title="Source observation" chainKey={attempt.sourceChainKey} block={attempt.sourceBlockHeight} txIndex={attempt.sourceTxIndex} /><EvidenceBlock title="Confirmation observation" chainKey={attempt.sourceChainKey} block={attempt.confirmBlockHeight} txIndex={attempt.confirmTxIndex} /></div></section>

    <section className="fw-command-surface rounded-3xl border p-5 sm:p-7"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Cryptographic commitments</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Hashes that bind this decision</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><HashField label="Proposal ID" value={attempt.proposalId} /><HashField label="Execution key" value={attempt.executionKey} /><HashField label="Evidence hash" value={attempt.evidenceHash} /><HashField label="Observation hash" value={attempt.observationHash} /><HashField label="Decision hash" value={attempt.decisionHash} /><HashField label="Policy hash used" value={attempt.policyHash} /><HashField label="Evaluated state hash" value={attempt.evaluatedStateHash} /><HashField label="Current policy hash" value={data.currentPolicyHash} /></div>{attempt.policyHash.toLowerCase() !== data.currentPolicyHash.toLowerCase() && <p className="mt-5 rounded-xl border border-copper-500/25 bg-copper-500/5 p-3 text-xs leading-relaxed text-copper-400">The treasury's current policy hash differs from the policy committed to this historical attempt. That can be expected after a later policy epoch change; the historical record remains bound to the policy state it evaluated.</p>}</section>
  </div>;
}

function AuthorizationPath({ attempt }: { attempt: AttemptRecord }) {
  const evidenceBlocked = attempt.evidenceStatus === 1 || [15,16,17,18,19].includes(attempt.reason);
  const policyPassed = attempt.reason === 0 || attempt.result === 2;
  const stages = [
    { label: "Proposal", detail: "Submitted", state: "done" },
    { label: "Evidence", detail: evidenceBlocked ? "Rejected" : attempt.evidenceStatus === 2 ? "Verified" : "Checked", state: evidenceBlocked ? "bad" : attempt.evidenceStatus === 2 ? "done" : "idle" },
    { label: "Policy", detail: policyPassed ? "Authorized" : evidenceBlocked ? "Not reached" : "Blocked", state: policyPassed ? "done" : evidenceBlocked ? "idle" : "bad" },
    { label: "Treasury", detail: attempt.result === 1 ? "Executed" : attempt.result === 2 ? "Execution reverted" : "No movement", state: attempt.result === 1 ? "done" : attempt.result === 2 ? "bad" : "idle" },
  ];
  return <div className="mt-6 rounded-2xl border border-ledger-800 bg-ledger-950/45 p-4 sm:p-5"><div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Authorization trace</p><span className="font-data text-[9px] text-ledger-600">ON-CHAIN RECORD</span></div><div className="mt-4 grid gap-2 sm:grid-cols-4">{stages.map((stage,index)=><div key={stage.label} className="relative flex items-center gap-3 rounded-xl border border-ledger-800 bg-ledger-950/65 p-3 sm:block sm:text-center"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-data text-[9px] sm:mx-auto ${stage.state === "done" ? "border-verified-500/45 text-verified-400" : stage.state === "bad" ? "border-alert-500/45 text-alert-400" : "border-ledger-700 text-ledger-600"}`}>{stage.state === "done" ? "✓" : stage.state === "bad" ? "×" : String(index+1).padStart(2,"0")}</span><div className="sm:mt-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-ledger-300">{stage.label}</p><p className={`mt-0.5 text-[10px] ${stage.state === "done" ? "text-verified-400" : stage.state === "bad" ? "text-alert-400" : "text-ledger-600"}`}>{stage.detail}</p></div>{index < stages.length-1 && <span className="absolute -right-[.58rem] top-1/2 z-10 hidden -translate-y-1/2 text-ledger-700 sm:block">→</span>}</div>)}</div></div>;
}

function OutcomeBadge({ result }: { result: number }) { const text = result === 1 ? "EXECUTED" : result === 2 ? "FAILED" : "BLOCKED"; const tone = result === 1 ? "border-verified-500/35 text-verified-400" : result === 2 ? "border-alert-500/35 text-alert-400" : "border-copper-500/35 text-copper-400"; return <span className={`self-start rounded-full border bg-ledger-950/55 px-3 py-1.5 font-data text-[9px] tracking-widest lg:self-auto ${tone}`}>{text}</span>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) { const cls = tone === "good" ? "text-verified-400" : tone === "warn" ? "text-copper-400" : tone === "bad" ? "text-alert-400" : "text-ledger-200"; return <div className="rounded-xl border border-ledger-800 bg-ledger-950/55 p-4"><p className="text-[9px] uppercase tracking-[.16em] text-ledger-600">{label}</p><p className={`mt-1.5 break-words text-sm font-medium ${cls}`}>{value}</p></div>; }
function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="flex items-start justify-between gap-4 border-b border-ledger-800 pb-2 text-xs last:border-0"><span className="text-ledger-500">{label}</span><span className={`break-all text-right text-ledger-300 ${mono ? "font-data" : ""}`}>{value}</span></div>; }
function EvidenceBlock({ title, chainKey, block, txIndex }: { title: string; chainKey: bigint; block: bigint; txIndex: bigint }) { return <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-5"><p className="text-sm font-semibold text-ledger-200">{title}</p><div className="mt-4 space-y-2"><Row label="Source chain key" value={chainKey.toString()} /><Row label="Attested block" value={block.toString()} /><Row label="Transaction index" value={txIndex.toString()} /></div></div>; }
function HashField({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl border border-ledger-800 bg-ledger-950/55 p-4"><p className="text-[9px] uppercase tracking-[.16em] text-ledger-600">{label}</p><p className="mt-2 break-all font-data text-[10px] leading-relaxed text-ledger-400">{value}</p></div>; }
function symbol(address: string, wctc: string, stable: string) { if (address.toLowerCase() === wctc.toLowerCase()) return "fwWCTC"; if (address.toLowerCase() === stable.toLowerCase()) return "fwUSD"; return short(address); }
function formatToken(amount: bigint, asset: string, wctc: string, stable: string) { const decimals = asset.toLowerCase() === wctc.toLowerCase() ? 18 : asset.toLowerCase() === stable.toLowerCase() ? 6 : 18; const n = Number(ethers.formatUnits(amount, decimals)); return Number.isFinite(n) ? n.toLocaleString(undefined,{maximumFractionDigits:6}) : ethers.formatUnits(amount,decimals); }

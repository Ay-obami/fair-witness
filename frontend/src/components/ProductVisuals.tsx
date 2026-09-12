import type { ReactNode } from "react";

const ENGINE_STEPS = [
  { code: "SRC", title: "Source market", detail: "Cross-chain state observed", tone: "text-external-400" },
  { code: "PRF", title: "Attestcoin proof", detail: "Evidence independently verified", tone: "text-verified-400" },
  { code: "AI", title: "AI reasoning", detail: "EXECUTE or WAIT + rationale", tone: "text-copper-400" },
  { code: "POL", title: "Deterministic policy", detail: "Mandate checks every proposal", tone: "text-copper-400", gate: true },
  { code: "TX", title: "Creditcoin treasury", detail: "Authorized execution + journal", tone: "text-verified-400" },
];

export function LiveExecutionEngine({ compact = false }: { compact?: boolean }) {
  return <div className={`fw-engine fw-glass rounded-2xl sm:rounded-3xl ${compact ? "p-4 sm:p-5" : "p-4 sm:p-6 lg:p-7"}`}>
    <div className="fw-scanline" />
    <div className="mb-4 flex flex-col items-start gap-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between sm:mb-5">
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-[0.18em] text-ledger-500 sm:text-[10px] sm:tracking-[0.22em]">Execution control plane</p>
        <p className="mt-1 text-sm font-medium text-ledger-200">Verified evidence → bounded action</p>
      </div>
      <span className="fw-status-chip shrink-0 text-[9px] font-data sm:text-[10px]"><span className="fw-status-dot" /> LIVE</span>
    </div>

    <div className="space-y-0">
      {ENGINE_STEPS.map((step, index) => <div key={step.code}>
        <div className={`fw-engine-node ${step.gate ? "fw-policy-gate" : ""}`}>
          {index === ENGINE_STEPS.length - 1 && <span className="fw-verified-ring" />}
          <div className="fw-node-icon">{step.code}</div>
          <div className="min-w-0 pr-1">
            <p className={`text-[13px] font-semibold sm:text-sm ${step.tone}`}>{step.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ledger-500 sm:text-xs">{step.detail}</p>
          </div>
          <div className="ml-auto hidden shrink-0 font-data text-[10px] text-ledger-600 min-[380px]:block">0{index + 1}</div>
        </div>
        {index < ENGINE_STEPS.length - 1 && <div className="fw-engine-connector" />}
      </div>)}
    </div>

    <div className="mt-4 rounded-xl border border-verified-500/20 bg-verified-500/5 p-3 sm:mt-5 sm:p-3.5">
      <div className="flex flex-col gap-1 text-[9px] uppercase tracking-widest text-ledger-500 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between sm:text-[10px]"><span>Security invariant</span><span className="text-verified-400">Enforced on-chain</span></div>
      <p className="mt-2 text-[11px] leading-relaxed text-ledger-300 sm:text-xs">AI can recommend an action. It cannot rewrite strategy order, limits, evidence rules, replay protection or treasury authority.</p>
    </div>
  </div>;
}

export function ExecutionRail({ active = 5, labels = ["Observe", "Prove", "Reason", "Authorize", "Execute"] }: { active?: number; labels?: string[] }) {
  return <div className="fw-live-rail" aria-label="Execution pipeline">
    {labels.map((label, index) => <div className="fw-live-rail-step" data-active={index < active} key={label}>
      <div className="fw-live-rail-dot">{String(index + 1).padStart(2, "0")}</div>
      <p className={`mt-2 text-[9px] uppercase tracking-wide sm:text-[10px] ${index < active ? "text-ledger-300" : "text-ledger-600"}`}>{label}</p>
    </div>)}
  </div>;
}

export function RealityStrip() {
  const items = ["Creditcoin CC3", "Attestcoin verified", "On-chain policy", "Replay protected", "Auditable journal"];
  return <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
    {items.map((item, index) => <span key={item} className="fw-status-chip max-w-full text-[9px] uppercase tracking-wide sm:text-[10px]"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${index < 2 ? "bg-external-400" : "bg-verified-400"}`} /><span className="truncate">{item}</span></span>)}
  </div>;
}

export function DecisionSequence({ result = "EXECUTED", blocked = false, reason }: { result?: string; blocked?: boolean; reason?: string }) {
  const sequence = blocked ? ["AI proposed", "Policy checked", "Blocked"] : ["AI proposed", "Policy passed", result];
  return <div className="fw-decision-card rounded-xl border border-ledger-800 p-4 sm:p-5">
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
      {sequence.map((label, index) => <div key={label} className="contents">
        <div className="rounded-lg border border-ledger-800 bg-ledger-950/70 p-3 text-center">
          <p className="text-[9px] uppercase tracking-widest text-ledger-600">Stage {index + 1}</p>
          <p className={`mt-1 text-xs font-semibold ${blocked && index === sequence.length - 1 ? "text-alert-400" : index > 0 ? "text-verified-400" : "text-copper-400"}`}>{label}</p>
        </div>
        {index < sequence.length - 1 && <span className="hidden text-ledger-600 sm:block">→</span>}
      </div>)}
    </div>
    {reason && <p className="mt-3 text-xs leading-relaxed text-ledger-500">{reason}</p>}
  </div>;
}

export function ProductMetric({ eyebrow, value, detail, icon }: { eyebrow: string; value: string; detail: string; icon?: ReactNode }) {
  return <div className="fw-command-surface rounded-2xl border p-4 sm:p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.16em] text-ledger-500">{eyebrow}</p>
        <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-ledger-100">{value}</p>
      </div>
      {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ledger-800 bg-ledger-950/60 text-sm text-copper-400">{icon}</div>}
    </div>
    <p className="mt-2 text-xs leading-relaxed text-ledger-500">{detail}</p>
  </div>;
}

export function ControlledMarketBadge() {
  return <details className="group relative max-w-full">
    <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-alert-500/25 bg-alert-500/5 px-3 py-1.5 text-[9px] font-medium uppercase tracking-widest text-alert-400 marker:hidden sm:text-[10px]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert-400" /> Controlled test market
    </summary>
    <div className="absolute left-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-ledger-700 bg-ledger-950 p-3 text-left text-[11px] normal-case leading-relaxed tracking-normal text-ledger-300 shadow-2xl">
      Market conditions are synthetic for demonstration. Cross-chain transactions, Attestcoin verification, policy authorization and Creditcoin execution remain real public-testnet paths.
    </div>
  </details>;
}

const STAGES = ["Observe", "Prove", "Reason", "Authorize", "Execute"];

export function OnChainLoading({ label = "Loading on-chain state" }: { label?: string }) {
  return <div className="fw-glass mt-8 overflow-hidden rounded-3xl p-5 sm:p-6" aria-live="polite" aria-busy="true">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verified-400 opacity-40" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-verified-400 shadow-[0_0_18px_rgba(36,217,165,.45)]" />
        </span>
        <div><p className="text-sm font-medium text-ledger-200">{label}</p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-ledger-600">Synchronizing public-testnet state</p></div>
      </div>
      <span className="fw-status-chip text-[10px] font-data">LIVE READ</span>
    </div>

    <div className="relative mt-6 overflow-hidden rounded-2xl border border-ledger-800 bg-ledger-950/60 p-4 sm:p-5">
      <div className="fw-scanline" />
      <div className="grid grid-cols-5 gap-2">
        {STAGES.map((stage, index) => <div key={stage} className="text-center">
          <div className="mx-auto grid h-9 w-9 animate-pulse place-items-center rounded-full border border-ledger-700 bg-ledger-900 font-data text-[9px] text-ledger-400" style={{ animationDelay: `${index * 160}ms` }}>{String(index + 1).padStart(2, "0")}</div>
          <p className="mt-2 text-[9px] uppercase tracking-wide text-ledger-600">{stage}</p>
        </div>)}
      </div>
    </div>

    <div className="mt-4 grid animate-pulse gap-3 md:grid-cols-3">
      {[0,1,2].map(i => <div key={i} className="rounded-2xl border border-ledger-800 bg-ledger-950/50 p-4">
        <div className="h-2.5 w-20 rounded bg-ledger-700" />
        <div className="mt-4 h-7 w-28 rounded bg-ledger-800" />
        <div className="mt-3 h-2.5 w-36 max-w-full rounded bg-ledger-800" />
      </div>)}
    </div>
  </div>;
}

export function RefreshIndicator() {
  return <span className="fw-status-chip text-[10px] font-data text-ledger-400">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-verified-400 shadow-[0_0_12px_rgba(36,217,165,.45)]" /> SYNCING
  </span>;
}

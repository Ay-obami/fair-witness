export function OnChainLoading({ label = "Loading on-chain state" }: { label?: string }) {
  return <div className="mt-8 space-y-4" aria-live="polite" aria-busy="true">
    <div className="flex items-center gap-3 text-sm text-ledger-400">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verified-400 opacity-40" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-verified-400" />
      </span>
      <span>{label}</span>
    </div>
    <div className="grid animate-pulse gap-4 md:grid-cols-3">
      {[0,1,2].map(i => <div key={i} className="rounded-xl border border-ledger-800 bg-ledger-900 p-5">
        <div className="h-3 w-24 rounded bg-ledger-700" />
        <div className="mt-4 h-7 w-32 rounded bg-ledger-800" />
        <div className="mt-3 h-3 w-40 rounded bg-ledger-800" />
      </div>)}
    </div>
    <div className="animate-pulse rounded-2xl border border-ledger-800 bg-ledger-900 p-6">
      <div className="h-4 w-40 rounded bg-ledger-700" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="h-16 rounded bg-ledger-800" />
        <div className="h-16 rounded bg-ledger-800" />
      </div>
    </div>
  </div>;
}

export function RefreshIndicator() {
  return <span className="inline-flex items-center gap-2 text-xs text-ledger-500">
    <span className="h-2 w-2 animate-pulse rounded-full bg-verified-400" /> Refreshing
  </span>;
}

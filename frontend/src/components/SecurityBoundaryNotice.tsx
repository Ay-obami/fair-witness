export function SecurityBoundaryNotice() {
  return <aside className="fw-glass relative overflow-hidden rounded-2xl p-5" aria-label="Treasury security boundary">
    <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-copper-400 via-verified-400 to-transparent" />
    <div className="flex items-start gap-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-verified-500/25 bg-verified-500/5 font-data text-[10px] text-verified-400">POL</div>
      <div>
        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ledger-100">The AI stops at the policy boundary.</p><span className="fw-status-chip text-[9px] text-verified-400"><span className="fw-status-dot" /> ON-CHAIN</span></div>
        <p className="mt-2 max-w-4xl text-xs leading-relaxed text-ledger-400">Your AI can recommend actions. It cannot change these rules or access funds directly. Typed proposals are checked by deterministic treasury policy; rejected attempts remain audit records and move no capital.</p>
      </div>
    </div>
  </aside>;
}

export function SecurityBoundaryNotice() {
  return (
    <aside className="rounded-lg border border-verified-500/40 bg-verified-500/5 p-5" aria-label="Treasury security boundary">
      <p className="text-sm font-semibold text-verified-400">
        Your AI can recommend actions. It cannot change these rules or access your funds directly.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ledger-400">
        Typed proposals are checked by deterministic on-chain policy. Only an approved action can reach the treasury executor; rejected attempts remain audit records and move no capital.
      </p>
    </aside>
  );
}

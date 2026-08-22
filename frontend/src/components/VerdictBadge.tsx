interface Props {
  status: boolean | null;
}

export function VerdictBadge({ status }: Props) {
  if (status === null) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-ledger-600 bg-ledger-800 px-3 py-1 text-xs font-data uppercase tracking-wide text-ledger-400">
        <span className="h-1.5 w-1.5 rounded-full bg-ledger-400" />
        reasoning not retrievable
      </span>
    );
  }
  if (status) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-verified-500/40 bg-verified-500/10 px-3 py-1 text-xs font-data uppercase tracking-wide text-verified-400">
        <span className="h-1.5 w-1.5 rounded-full bg-verified-500" />
        hash match — not tampered with
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-alert-500/40 bg-alert-500/10 px-3 py-1 text-xs font-data uppercase tracking-wide text-alert-400">
      <span className="h-1.5 w-1.5 rounded-full bg-alert-500" />
      hash mismatch — investigate
    </span>
  );
}

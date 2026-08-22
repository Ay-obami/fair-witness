interface Props {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}

export function DataRow({ label, value, mono = true, truncate = false }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ledger-800 py-2 last:border-b-0">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-ledger-400">{label}</dt>
      <dd
        className={`text-right text-sm text-ledger-100 ${mono ? "font-data" : ""} ${
          truncate ? "max-w-[60%] truncate" : "break-all"
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

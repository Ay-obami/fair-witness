const STAGES = ["Observation", "Attestcoin evidence", "AI decision", "Typed proposal", "Deterministic policy", "Execution / rejection"];

export function DecisionTimeline({ outcome = "pending" }: { outcome?: "pending" | "executed" | "rejected" }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Decision audit timeline">
      {STAGES.map((stage, index) => (
        <li key={stage} className="rounded-md border border-ledger-700 bg-ledger-900 p-3">
          <span className="font-data text-xs text-ledger-500">{String(index + 1).padStart(2, "0")}</span>
          <p className="mt-1 text-sm text-ledger-200">{stage}</p>
          {index === 5 && outcome !== "pending" && (
            <p className={outcome === "executed" ? "mt-1 text-xs text-verified-400" : "mt-1 text-xs text-alert-400"}>
              {outcome === "executed" ? "Executed" : "Rejected — treasury untouched"}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

import type { ReplayData, TradeDirection } from "../lib/types";
import { ActionType } from "../lib/types";
import { DataRow } from "./DataRow";
import { VerdictBadge } from "./VerdictBadge";

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function directionLabel(direction: TradeDirection | undefined): string {
  if (direction === "SELL_BASE_FOR_QUOTE") return "SELL base → quote";
  if (direction === "BUY_BASE_FOR_QUOTE") return "BUY base ← quote";
  // Pre-direction journal entries carry a 5-field payload — say so honestly rather
  // than inferring a direction that was never recorded on-chain.
  return "not recorded (pre-direction journal entry)";
}

function actionTypeLabel(type: ActionType): string {
  switch (type) {
    case ActionType.ARBITRAGE:
      return "ARBITRAGE (executed)";
    case ActionType.REJECTED_STALE:
      return "REJECTED — stale";
    case ActionType.REJECTED_NARROW:
      return "REJECTED — too narrow";
    default:
      return "unknown";
  }
}

export function ReplayCard({ data }: { data: ReplayData }) {
  const { entry, reasoning, hashMatches, sepoliaExplorerFactHint } = data;

  return (
    <div className="space-y-6">
      {/* Section 1: the fact — independently checkable against Sepolia */}
      <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ledger-200">1. Attested fact</h2>
        </div>
        <dl>
          <DataRow label="factKey" value={entry.factKey} truncate />
          <DataRow label="Attested at" value={formatTimestamp(entry.attestedAt)} mono={false} />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-ledger-400">{sepoliaExplorerFactHint}</p>
      </section>

      {/* Section 2: the decision — off-chain reasoning, hash-checked against the on-chain commitment */}
      <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ledger-200">2. Decision</h2>
          <VerdictBadge status={hashMatches} />
        </div>
        <dl>
          <DataRow label="decisionHash (on-chain)" value={entry.decisionHash} truncate />
        </dl>
        {reasoning ? (
          <div className="mt-4 space-y-3">
            <dl>
              <DataRow label="Rule" value={reasoning.rule} />
              <DataRow label="Observed gap" value={`${reasoning.observedGapBps} bps`} />
              <DataRow label="Source price" value={reasoning.sourcePrice} />
              <DataRow label="Confirm price" value={reasoning.confirmPrice} />
              <DataRow label="Dest DEX price" value={reasoning.destPrice} />
            </dl>
            <div>
              <p className="text-xs uppercase tracking-wide text-ledger-400">LLM rationale</p>
              <p className="mt-1 text-sm leading-relaxed text-ledger-100">{reasoning.llmRationale}</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ledger-400">
            No off-chain reasoning payload could be retrieved for this decisionHash. This is shown honestly rather
            than assumed — a hash with no retrievable payload is neither confirmed nor refuted, just unverifiable
            right now.
          </p>
        )}
      </section>

      {/* Section 3: the action actually executed on-chain */}
      <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledger-200">3. Action executed</h2>
        <dl>
          <DataRow label="Type" value={actionTypeLabel(entry.actionType)} mono={false} />
          <DataRow label="Direction" value={directionLabel(entry.direction)} mono={false} />
          <DataRow label="Agent (submitter)" value={entry.agent} truncate />
          <DataRow label="Trade size" value={`${entry.tradeSize} (base asset, 6dp)`} />
          <DataRow label="Arb width" value={`${entry.arbWidthBps} bps`} />
          <DataRow
            label="Amount out"
            value={`${entry.amountOut} ${
              entry.direction === "BUY_BASE_FOR_QUOTE"
                ? "(base asset — bought)"
                : entry.direction === "SELL_BASE_FOR_QUOTE"
                  ? "(quote asset — received)"
                  : "(quote asset — legacy one-directional entry)"
            }`}
          />
          <DataRow label="Executed at" value={formatTimestamp(entry.actedAt)} mono={false} />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-ledger-400">
          The agent address above only ever submitted proofs and paid gas — it holds no balance of either asset. See
          docs/DESIGN.md for the custody-separation invariant this depends on.
        </p>
      </section>
    </div>
  );
}

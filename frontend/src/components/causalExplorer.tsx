// Causal explorer — reversed timeline: execution → treasury authorization →
// policy checks → attestation → agent decision. Each node is expandable.
import { useState } from "react";
import type { ReplayData } from "../lib/types";
import { ActionType } from "../lib/types";
import { DataRow } from "./DataRow";
import { VerdictBadge } from "./VerdictBadge";
import { formatTimestamp, directionLabel } from "./replayUtils";

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

interface NodeProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  step: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CausalNode({
  title,
  subtitle,
  badge,
  step,
  expanded,
  onToggle,
  children,
}: NodeProps) {
  return (
    <div className="border-l-2 border-ledger-700 pl-5 last:border-l-0 last:pl-5">
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ledger-600 bg-ledger-800 font-data text-xs text-ledger-400">
          {step}
        </span>
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ledger-200">
            {title}
          </h3>
          {badge}
        </div>
        <button
          onClick={onToggle}
          className="ml-auto text-xs text-ledger-400 hover:text-ledger-200"
        >
          {expanded ? "Hide" : "Show"} details
        </button>
      </div>
      {subtitle && (
        <p className="mb-2 text-xs text-ledger-400">{subtitle}</p>
      )}
      {expanded && children}
    </div>
  );
}

export function CausalExplorer({ data }: { data: ReplayData }) {
  const { entry, reasoning, hashMatches } = data;
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({
    execution: true,
    authorization: true,
    policy: true,
    attestation: true,
    decision: true,
  });

  const toggle = (key: string) =>
    setOpenNodes((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ledger-200">
        Causal timeline (reversed)
      </h2>
      <p className="mb-4 text-xs text-ledger-400">
        Read bottom-up: what happened on-chain, traced back through the trust
        boundary to the agent's decision.
      </p>

      <div className="relative border-l-2 border-ledger-700 pl-5">
        {/* Node 1: Execution */}
        <CausalNode
          title="Execution"
          subtitle="Trade executed on the destination DEX"
          badge={
            <span className="text-xs font-data text-verified-400">
              {actionTypeLabel(entry.actionType)}
            </span>
          }
          step={1}
          expanded={openNodes.execution}
          onToggle={() => toggle("execution")}
        >
          <dl className="mb-2">
            <DataRow label="Agent (submitter)" value={entry.agent} truncate />
            <DataRow label="Direction" value={directionLabel(entry.direction)} mono={false} />
            <DataRow label="Trade size" value={`${entry.tradeSize} (base, 6dp)`} />
            <DataRow label="Arb width" value={`${entry.arbWidthBps} bps`} />
            <DataRow label="Amount out" value={entry.amountOut} />
            <DataRow label="Executed at" value={formatTimestamp(entry.actedAt)} mono={false} />
          </dl>
          <p className="text-xs text-ledger-400">
            The agent address above only submitted proofs and paid gas — it
            holds no balance of either asset. See docs/DESIGN.md for the
            custody-separation invariant.
          </p>
        </CausalNode>

        {/* Node 2: Treasury Authorization */}
        <CausalNode
          title="Treasury Authorization"
          subtitle="The submitter was an allowlisted agent on this instance — enforced on-chain"
          step={2}
          expanded={openNodes.authorization}
          onToggle={() => toggle("authorization")}
        >
          <dl className="mb-2">
            <DataRow
              label="Authorization model"
              value="registered-agent allowlist on this instance"
              mono={false}
            />
            <DataRow
              label="Who checks it"
              value="the contract — an unregistered caller reverts"
              mono={false}
            />
            <DataRow
              label="Instance scope"
              value="per-instance; instances share no state or agent list"
              mono={false}
            />
            <DataRow
              label="Custody"
              value="the agent holds no funds and cannot move them"
              mono={false}
            />
          </dl>
        </CausalNode>

        {/* Node 3: Policy Checks */}
        <CausalNode
          title="Policy Checks"
          subtitle="Immutable guardrails enforced on-chain"
          step={3}
          expanded={openNodes.policy}
          onToggle={() => toggle("policy")}
        >
          <dl>
            <DataRow
              label="Replay protection"
              value="actionKey uniqueness verified"
              mono={false}
            />
            <DataRow
              label="Guardrails"
              value="constructor-set immutables (cannot be loosened)"
              mono={false}
            />
            <DataRow
              label="Slippage"
              value="contract-enforced via DEX revert path"
              mono={false}
            />
          </dl>
          <div className="mt-2 text-xs text-verified-400">
            ✓ All policy checks passed
          </div>
        </CausalNode>

        {/* Node 4: Attestation */}
        <CausalNode
          title="Attestation"
          subtitle="Attestcoin proofs submitted and verified"
          step={4}
          expanded={openNodes.attestation}
          onToggle={() => toggle("attestation")}
        >
          <dl>
            <DataRow label="factKey" value={entry.factKey} truncate />
            {entry.sourceBlockHeight !== undefined &&
            entry.confirmBlockHeight !== undefined ? (
              <DataRow
                label="Verified at blocks (source → confirm)"
                value={`${entry.sourceBlockHeight} → ${entry.confirmBlockHeight}`}
                mono
              />
            ) : (
              <DataRow
                label="Block evidence"
                value="not recorded (pre-3.6 instance)"
                mono={false}
              />
            )}
          </dl>
          <p className="mt-2 text-xs text-ledger-400">
            {data.sepoliaExplorerFactHint}
          </p>
        </CausalNode>

        {/* Node 5: Agent Decision */}
        <CausalNode
          title="Agent Decision"
          subtitle="Off-chain LLM reasoning, hash-checked against on-chain commitment"
          badge={<VerdictBadge status={hashMatches} />}
          step={5}
          expanded={openNodes.decision}
          onToggle={() => toggle("decision")}
        >
          {reasoning ? (
            <div className="space-y-3">
              <dl>
                <DataRow label="decisionHash" value={entry.decisionHash} truncate />
                <DataRow label="Rule" value={reasoning.rule} />
                <DataRow label="Observed gap" value={`${reasoning.observedGapBps} bps`} />
                <DataRow label="Source price" value={reasoning.sourcePrice} />
                <DataRow label="Confirm price" value={reasoning.confirmPrice} />
                <DataRow label="Dest DEX price" value={reasoning.destPrice} />
                <DataRow label="Outcome" value={reasoning.outcome ?? "not recorded"} mono={false} />
                <DataRow label="Timestamp" value={reasoning.timestamp} mono={false} />
              </dl>
              <div>
                <p className="text-xs uppercase tracking-wide text-ledger-400">LLM rationale</p>
                <p className="mt-1 text-sm leading-relaxed text-ledger-100">
                  {reasoning.llmRationale}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ledger-400">
              No off-chain reasoning payload could be retrieved for this
              decisionHash. This is shown honestly rather than assumed — a hash
              with no retrievable payload is neither confirmed nor refuted.
            </p>
          )}
        </CausalNode>
      </div>
    </section>
  );
}

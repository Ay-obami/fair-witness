import type { AttemptProjection, AuditRepository, DecisionArtifact } from "./types.js";

/** Server-only PostgREST adapter. Never import this module from the browser bundle. */
export class SupabaseAuditRepository implements AuditRepository {
  constructor(private readonly url: string, private readonly serviceRoleKey: string) {
    if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${this.url.replace(/\/$/, "")}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Supabase audit request failed: ${response.status} ${await response.text()}`);
    return response;
  }

  async upsertAttempt(a: AttemptProjection): Promise<void> {
    await this.request("policy_attempts?on_conflict=chain_id,treasury_address,attempt_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        chain_id: a.chainId.toString(), treasury_address: a.treasuryAddress, attempt_id: a.attemptId.toString(),
        nonce: a.nonce.toString(), source_chain_key: a.sourceChainKey.toString(),
        source_block_height: a.sourceBlockHeight.toString(), source_tx_index: a.sourceTxIndex.toString(),
        confirm_block_height: a.confirmBlockHeight.toString(), confirm_tx_index: a.confirmTxIndex.toString(),
        agent: a.agent, asset_in: a.assetIn, asset_out: a.assetOut, venue: a.venue,
        proposal_id: a.proposalId, execution_key: a.executionKey,
        evidence_hash: a.evidenceHash, observation_hash: a.observationHash, decision_hash: a.decisionHash,
        policy_hash: a.policyHash, strategy: a.strategy, action: a.action, result: a.result, reason: a.reason,
        evidence_status: a.evidenceStatus, evaluated_state_hash: a.evaluatedStateHash,
        permitted_value_e6: a.permittedValueE6.toString(), proposed_amount_in: a.proposedAmountIn.toString(),
        amount_in_actual: a.amountInActual.toString(), amount_out_actual: a.amountOutActual.toString(),
        current_wctc_bps: a.currentWctcBps,
        reference_bps: a.referenceBps, transaction_hash: a.transactionHash, block_number: a.blockNumber.toString(),
        block_hash: a.blockHash, log_index: a.logIndex, sync_status: a.syncStatus,
        submitted_at: new Date(Number(a.submittedAt) * 1000).toISOString(),
        resolved_at: new Date(Number(a.resolvedAt) * 1000).toISOString(),
      }),
    });
  }

  async attempt(chainId: bigint, treasury: string, id: bigint): Promise<AttemptProjection | null> {
    const response = await this.request(
      `policy_attempts?chain_id=eq.${chainId}&treasury_address=eq.${treasury}&attempt_id=eq.${id}&limit=1`,
    );
    const rows = await response.json() as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return null;
    const b = (key: string) => BigInt(String(r[key]));
    const s = (key: string) => String(r[key]);
    return {
      chainId: b("chain_id"), treasuryAddress: s("treasury_address"), attemptId: b("attempt_id"),
      nonce: b("nonce"), sourceChainKey: b("source_chain_key"), sourceBlockHeight: b("source_block_height"),
      sourceTxIndex: b("source_tx_index"), confirmBlockHeight: b("confirm_block_height"),
      confirmTxIndex: b("confirm_tx_index"), agent: s("agent"), assetIn: s("asset_in"),
      assetOut: s("asset_out"), venue: s("venue"), proposalId: s("proposal_id"), executionKey: s("execution_key"),
      evidenceHash: s("evidence_hash"), observationHash: s("observation_hash"), decisionHash: s("decision_hash"),
      policyHash: s("policy_hash"), evaluatedStateHash: s("evaluated_state_hash"), strategy: Number(r.strategy),
      action: Number(r.action), result: Number(r.result), reason: Number(r.reason),
      evidenceStatus: Number(r.evidence_status), proposedAmountIn: b("proposed_amount_in"),
      permittedValueE6: b("permitted_value_e6"), amountInActual: b("amount_in_actual"),
      amountOutActual: b("amount_out_actual"), currentWctcBps: Number(r.current_wctc_bps),
      referenceBps: Number(r.reference_bps), transactionHash: s("transaction_hash"), blockNumber: b("block_number"),
      blockHash: s("block_hash"), logIndex: Number(r.log_index), submittedAt: BigInt(Math.floor(Date.parse(s("submitted_at")) / 1000)),
      resolvedAt: BigInt(Math.floor(Date.parse(s("resolved_at")) / 1000)), syncStatus: r.sync_status as AttemptProjection["syncStatus"],
    };
  }

  async markBlockOrphaned(chainId: bigint, blockHash: string): Promise<number> {
    const response = await this.request(`policy_attempts?chain_id=eq.${chainId}&block_hash=eq.${blockHash}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ sync_status: "ORPHANED" }),
    });
    return ((await response.json()) as unknown[]).length;
  }

  async putDecision(d: DecisionArtifact): Promise<void> {
    const existing = await this.decision(d.decisionHash);
    if (existing && JSON.stringify(existing.canonicalEnvelope) !== JSON.stringify(d.canonicalEnvelope)) {
      throw new Error("decision hash conflicts with different canonical content");
    }
    if (existing) return;
    await this.request("ai_decisions?on_conflict=decision_hash", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({
        decision_hash: d.decisionHash, observation_hash: d.observationHash, evidence_hash: d.evidenceHash,
        policy_hash: d.policyHash, strategy: d.strategy, outcome: d.outcome,
        candidate_envelope: d.canonicalEnvelope, prompt_template_version: "schema-v1",
        provider: "recorded-in-envelope", model: "recorded-in-envelope", structured_output: d.canonicalEnvelope, rationale: "",
      }),
    });
  }

  async decision(hash: string): Promise<DecisionArtifact | null> {
    const response = await this.request(`ai_decisions?decision_hash=eq.${hash}&limit=1`);
    const rows = await response.json() as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) return null;
    return {
      decisionHash: String(row.decision_hash), observationHash: String(row.observation_hash),
      evidenceHash: String(row.evidence_hash), policyHash: String(row.policy_hash), strategy: Number(row.strategy),
      outcome: row.outcome as "EXECUTE" | "WAIT", canonicalEnvelope: row.candidate_envelope,
    };
  }
}

export function auditRepositoryFromEnvironment(): SupabaseAuditRepository {
  return new SupabaseAuditRepository(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("../frontend/supabase/migrations/0002_audit_journal.sql"), "utf8");

describe("Phase 7 Supabase migration contract", () => {
  it("creates every locked normalized table", () => {
    for (const table of ["ui_preferences", "mandate_projections", "observations", "evidence_bundles", "ai_decisions",
      "proposals", "policy_attempts", "executions", "portfolio_snapshots"]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });
  it("removes anonymous identity writes and grants no browser mutation on audit truth", () => {
    expect(sql).toContain('drop policy if exists "user_instances_upsert"');
    expect(sql).not.toMatch(/create policy[^;]+policy_attempts[^;]+for (insert|update|delete)/is);
    expect(sql).not.toMatch(/create policy[^;]+executions[^;]+for (insert|update|delete)/is);
  });
  it("requires receipt reconciliation before verified evidence", () => {
    expect(sql).toContain("evidence_verified_receipt");
    expect(sql).toContain("validation_status <> 'VERIFIED_ONCHAIN'");
    expect(sql).toContain("invalid_evidence_not_verified");
  });
  it("defines idempotent chain log and reorg identities", () => {
    expect(sql).toContain("unique (chain_id, transaction_hash, log_index)");
    expect(sql).toContain("sync_status public.audit_sync_status");
    expect(sql).toContain("'ORPHANED'");
  });
  it("stores the complete compact on-chain attempt without requiring off-chain artifacts", () => {
    for (const field of ["nonce", "source_chain_key", "agent", "asset_in", "execution_key", "evidence_hash",
      "observation_hash", "decision_hash", "policy_hash", "proposed_amount_in", "amount_in_actual", "amount_out_actual"]) {
      expect(sql).toMatch(new RegExp(`\\b${field}\\b`));
    }
    expect(sql).not.toContain("proposal_id text not null references public.proposals");
  });
});

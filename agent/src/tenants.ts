import { ethers } from "ethers";
import { promises as fs } from "node:fs";

/**
 * One tenant = one independent treasury instance. Instances never share state, storage,
 * journal, or epoch counters (docs/ARCHITECTURE_V2.md §3) — this config only tells the
 * agent WHICH instances to poll, never how to constrain them (the guardrails live
 * immutably on each instance and are read from chain at startup, never from this file).
 */
export interface TenantConfig {
  /** Human-readable label for logs (e.g. "tenant-a"). Not used on-chain. */
  label: string;
  /** Checksummed ASCTreasuryJournal instance address. */
  treasuryAddress: string;
}

const TENANTS_ABI_MINIMAL = [
  "function registeredAgents(address) view returns (bool)",
];

/**
 * Parses + validates the tenants registry JSON. Pure so it's unit-testable.
 *
 * Expected shape:
 *   { "tenants": [ { "label": "tenant-a", "treasuryAddress": "0x..." }, ... ] }
 *
 * Validation is deliberately loud (throws with the offending entry named): a typo'd
 * address here would otherwise surface much later as a confusing per-cycle RPC failure.
 */
export function parseTenantsJson(raw: string): TenantConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Tenants file is not valid JSON: ${err}`);
  }

  const tenants = (parsed as { tenants?: unknown })?.tenants;
  if (!Array.isArray(tenants) || tenants.length === 0) {
    throw new Error(
      'Tenants file must contain a non-empty "tenants" array (or unset TENANTS_FILE to run single-tenant mode).'
    );
  }

  const seen = new Set<string>();
  const out: TenantConfig[] = [];
  for (const [i, entry] of tenants.entries()) {
    const label = (entry as { label?: unknown })?.label;
    const address = (entry as { treasuryAddress?: unknown })?.treasuryAddress;
    if (typeof label !== "string" || label.trim() === "") {
      throw new Error(`Tenants file entry #${i}: "label" must be a non-empty string.`);
    }
    if (typeof address !== "string") {
      throw new Error(`Tenants file entry "${label}": "treasuryAddress" must be a string.`);
    }
    // getAddress checksums + validates; a wrong-format address dies here, not mid-cycle.
    let checksummed: string;
    try {
      checksummed = ethers.getAddress(address);
    } catch {
      throw new Error(`Tenants file entry "${label}": "${address}" is not a valid Ethereum address.`);
    }
    const lower = checksummed.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Tenants file entry "${label}": duplicate treasury address ${checksummed}.`);
    }
    seen.add(lower);
    out.push({ label: label.trim(), treasuryAddress: checksummed });
  }
  return out;
}

/**
 * Loads the tenant registry. Returns null when TENANTS_FILE is unset — the caller then
 * falls back to single-tenant mode (TREASURY_ADDRESS), preserving the V1 runbook.
 */
export async function loadTenantConfigs(
  readFile: (path: string) => Promise<string> = (p) => fs.readFile(p, "utf-8")
): Promise<TenantConfig[] | null> {
  const path = process.env.TENANTS_FILE;
  if (!path) return null;
  const raw = await readFile(path);
  return parseTenantsJson(raw);
}

/**
 * On-chain sanity check at startup: the agent submit key must be registered on EACH
 * tenant's instance by that tenant's owner (per-instance allowlist — registration on one
 * instance grants nothing on any other). A missing registration isn't fatal at startup
 * (the owner may register later), but failing loudly here is far clearer than a
 * NotRegisteredAgent revert on the first submission.
 */
export async function assertAgentRegisteredOrWarn(
  provider: ethers.JsonRpcProvider,
  tenant: TenantConfig,
  agentAddress: string,
  log: (msg: string) => void
): Promise<void> {
  const treasury = new ethers.Contract(tenant.treasuryAddress, TENANTS_ABI_MINIMAL, provider);
  const registered = await treasury.registeredAgents(agentAddress);
  if (!registered) {
    log(
      `WARNING [${tenant.label}]: agent ${agentAddress} is NOT registered on ${tenant.treasuryAddress}. ` +
      `The tenant owner must call registerAgent(${agentAddress}) on THEIR instance before it can execute. ` +
      `Submissions will revert with NotRegisteredAgent until then.`
    );
  }
}
import { ethers } from "ethers";

/**
 * A tenant as discovered from the on-chain index — `frontend/public/tenants.json` is the
 * committed output of `contracts/script/index-tenants.js` (which scans the factory's
 * `TreasuryDeployed` events — the architecture's sanctioned enumeration path, since the
 * factory itself is deliberately registry-free).
 *
 * Only IDENTITY lives here (label + address + owner), never guardrail values: the bounds
 * shown in the dashboard are read LIVE from the selected instance, per the honest framing
 * in TenantPanel ("constructor-set — can never be loosened"). A stale list of bounds in a
 * built artifact would undermine that.
 */
export interface DiscoveredTenant {
  label: string;
  treasuryAddress: string;
  owner: string;
}

function isDiscoveredTenant(value: unknown): value is DiscoveredTenant {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.label !== "string" || v.label.trim() === "") return false;
  if (typeof v.treasuryAddress !== "string") return false;
  try {
    ethers.getAddress(v.treasuryAddress); // throws on a bad address
  } catch {
    return false;
  }
  // `owner` may be absent (the indexer always writes it today; tolerate its absence).
  const owner = v.owner;
  if (owner !== undefined && typeof owner !== "string") return false;
  if (owner !== undefined) {
    try {
      ethers.getAddress(owner);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Fetches the tenant list deployed alongside the SPA (`public/tenants.json`, same origin —
 * works on GitHub Pages and `vite dev`). Returns `[]` when the file is missing or
 * malformed so the dashboard degrades gracefully (paste-address still works); the
 * returned entries are validated, so a bad row is dropped (and counted) rather than
 * trusted. `reads` lets tests assert only the happy path.
 */
export async function fetchTenantList(): Promise<{ tenants: DiscoveredTenant[]; skipped: number }> {
  let response: Response;
  try {
    response = await fetch("tenants.json", { cache: "no-store" });
  } catch {
    return { tenants: [], skipped: 0 }; // file not hosted → no discovery, not a crash
  }
  if (!response.ok) return { tenants: [], skipped: 0 };

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { tenants: [], skipped: 0 };
  }

  const rows = (parsed as { tenants?: unknown })?.tenants;
  if (!Array.isArray(rows)) return { tenants: [], skipped: 0 };

  // Checksum once, keep the normalized form (matches what the rest of the app expects).
  const tenants: DiscoveredTenant[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!isDiscoveredTenant(row)) {
      skipped += 1;
      continue;
    }
    tenants.push({
      label: row.label.trim(),
      treasuryAddress: ethers.getAddress(row.treasuryAddress),
      owner: row.owner ? ethers.getAddress(row.owner) : "",
    });
  }
  return { tenants, skipped };
}
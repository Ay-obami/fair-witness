import { useState } from "react";
import { config } from "../lib/config";
import { MOCK_TREASURY_ADDRESSES } from "../lib/mockData";
import type { TreasuryInfo } from "../lib/types";
import type { DiscoveredTenant } from "../lib/tenantDiscovery";
import { DataRow } from "./DataRow";

interface Props {
  treasury: TreasuryInfo | null;
  loading: boolean;
  error: string | null;
  onSwitch: (address: string) => void;
  /** Instances discovered from the on-chain index (`public/tenants.json`). */
  discovered: DiscoveredTenant[];
  discoveryFailed: boolean;
}

const SHORT_LABELS: Record<string, string> = {
  "0x13CACe3989b295048De47C68F32Ff3d844AC2026": "Tenant A (5M cap)",
  "0xD66C607072df7dB98A75aEe81fCA4089462c60aB": "Tenant B (10M cap)",
};

const KNOWN_ADDRESS_TO_LABEL: Record<string, string> = {
  "0x13cace3989b295048de47c68f32ff3d844ac2026": "Tenant A (5M cap)",
  "0xd66c607072df7db98a75aee81fca4089462c60ab": "Tenant B (10M cap)",
};

function epochLabel(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds % 86400 === 0) return `${seconds / 86400} day(s)`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour(s)`;
  return `${seconds}s`;
}

function shortLabel(address: string, fallback: string): string {
  const lower = address.toLowerCase();
  if (KNOWN_ADDRESS_TO_LABEL[lower]) return KNOWN_ADDRESS_TO_LABEL[lower];
  return SHORT_LABELS[address] ?? fallback;
}

/**
 * The multi-tenant entry point (V2 pivot): shows WHICH treasury instance is being
 * viewed and its immutable guardrails, read live from the instance itself, plus a
 * switcher for pointing the whole viewer at any other factory-deployed instance.
 *
 * Honest framing, matching the repo's conventions: the factory is permissionless and
 * deliberately keeps NO tenant registry, so instances can't be enumerated from-chain —
 * enumeration comes from the indexer (`contracts/script/index-tenants.js`) reading the
 * factory's `TreasuryDeployed` events, whose output is committed to
 * `public/tenants.json`. The guardrails shown are ALWAYS read from the instance (the
 * source of truth); the index only supplies identities (label/address/owner), never
 * bounds, so a stale index can mislead about WHO exists but never about WHICH bounds are
 * in force.
 */
export function TenantPanel({ treasury, loading, error, onSwitch, discovered, discoveryFailed }: Props) {
  const [draft, setDraft] = useState("");

  const chips: DiscoveredTenant[] =
    discovered.length > 0
      ? discovered
      : MOCK_TREASURY_ADDRESSES.map((a) => ({
          label: SHORT_LABELS[a] ?? a,
          treasuryAddress: a,
          owner: "",
        }));

  const chosen = treasury
    ? chips.find((d) => d.treasuryAddress.toLowerCase() === treasury.address.toLowerCase())
    : undefined;

  return (
    <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ledger-200">
          Treasury instance
        </h2>
        {config.factoryAddress && (
          <span
            className="font-data max-w-[45%] truncate text-xs text-ledger-400"
            title={`Factory: ${config.factoryAddress}`}
          >
            factory {config.factoryAddress.slice(0, 10)}…{config.factoryAddress.slice(-6)}
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-2.5 text-xs text-alert-400">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-ledger-400">Reading immutable guardrails from chain…</p>
      )}

      {!loading && treasury && (
        <>
          <dl>
            <DataRow
              label="Instance"
              value={
                shortLabel(treasury.address, treasury.address) +
                (chosen ? ` (${chosen.label})` : "")
              }
              mono={!SHORT_LABELS[treasury.address]}
            />
            <DataRow label="Owner" value={treasury.owner} truncate />
            <DataRow label="Journaled actions" value={String(treasury.journalLength)} />
          </dl>

          <p className="mt-4 text-xs uppercase tracking-wide text-ledger-400">
            Immutable guardrails (constructor-set — can never be loosened, even by the owner)
          </p>
          <dl className="mt-1">
            <DataRow label="Max trade size" value={treasury.guardrails.maxTradeSize} />
            <DataRow label="Max slippage" value={`${treasury.guardrails.maxSlippageBps} bps`} />
            <DataRow label="Min arb width" value={`${treasury.guardrails.minArbWidthBps} bps`} />
            <DataRow label="Max proof drift" value={`${treasury.guardrails.maxDriftBps} bps`} />
            <DataRow
              label="Max confirm gap"
              value={`${treasury.guardrails.maxConfirmGapBlocks} blocks`}
            />
            <DataRow
              label="Rate limit"
              value={`${treasury.guardrails.maxActionsPerEpoch} per ${epochLabel(treasury.guardrails.epochLength)}`}
              mono={false}
            />
          </dl>
        </>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim();
          if (next) onSwitch(next);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Switch instance: paste a treasury address (0x...)"
          className="font-data flex-1 rounded-md border border-ledger-600 bg-ledger-950 px-3 py-2 text-xs text-ledger-100 placeholder:text-ledger-400 focus:border-verified-500/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="rounded-md border border-ledger-600 bg-ledger-800 px-4 py-2 text-xs font-semibold text-ledger-100 transition hover:border-verified-500/50 hover:text-verified-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          View
        </button>
      </form>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-ledger-400">
            {config.demoMode
              ? "Try:"
              : discovered.length > 0
                ? "From on-chain index:"
                : "Try (demo mocks):"}
          </span>
          {chips.map((t) => (
            <button
              key={t.treasuryAddress}
              onClick={() => {
                setDraft(t.treasuryAddress);
                onSwitch(t.treasuryAddress);
              }}
              className="rounded-full border border-ledger-600 bg-ledger-800 px-3 py-1 text-xs text-ledger-200 transition hover:border-verified-500/50 hover:text-verified-400"
            >
              {SHORT_LABELS[t.treasuryAddress] ?? t.label}
            </button>
          ))}
        </div>
      )}

      {discoveryFailed && discovered.length === 0 && !config.demoMode && (
        <p className="mt-3 text-xs text-ledger-400">
          No on-chain index found (<code className="font-data">tenants.json</code>) — paste an
          instance address above, or serve the indexer output from{" "}
          <code className="font-data">public/tenants.json</code>.
        </p>
      )}
    </section>
  );
}
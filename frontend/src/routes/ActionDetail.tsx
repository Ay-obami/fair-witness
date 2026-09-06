// Phase 1, Page 8 — Action Detail (`/action/:actionKey`).
// A stable, linkable deep-dive into a single decision, traced from the
// Sepolia fact through the attestation proofs to the on-chain execution.
import { ethers } from "ethers";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { config } from "../lib/config";
import { fetchReplayData, fetchTreasury } from "../lib/dataProvider";
import { ReplayCard } from "../components/ReplayCard";
import { CausalExplorer } from "../components/causalExplorer";
import { NetworkIndicator } from "../components/networkIndicator";
import { Layout } from "../components/layout";
import type { ReplayData, TreasuryInfo } from "../lib/types";

export default function ActionDetail() {
  const { actionKey, instance } = useParams();
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [treasuryAddress] = useState<string>(
    instance ?? config.treasuryAddress
  );
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);

  // Fetch instance context.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!treasuryAddress) return;
      setTreasuryLoading(true);
      try {
        setTreasury(await fetchTreasury(treasuryAddress));
      } catch (err) {
        if (!cancelled) {
          setTreasury(null);
          setTreasuryError(
            `Couldn't read this instance: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      } finally {
        if (!cancelled) setTreasuryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treasuryAddress]);

  // Fetch the action's replay data.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!actionKey) return;
      setLoading(true);
      setNotFound(false);
      setError(null);
      setData(null);
      try {
        const result = await fetchReplayData(actionKey, treasuryAddress);
        if (!cancelled) {
          if (result) setData(result);
          else setNotFound(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actionKey, treasuryAddress]);

  return (
    <Layout>
      <ActionDetailInner
        treasury={treasury}
        treasuryLoading={treasuryLoading}
        treasuryError={treasuryError}
        treasuryAddress={treasuryAddress}
        data={data}
        loading={loading}
        notFound={notFound}
        error={error}
        actionKey={actionKey ?? ""}
      />
    </Layout>
  );
}

function ActionDetailInner({
  treasury,
  treasuryLoading,
  treasuryError,
  treasuryAddress,
  data,
  loading,
  notFound,
  error,
  actionKey,
}: {
  treasury: TreasuryInfo | null;
  treasuryLoading: boolean;
  treasuryError: string | null;
  treasuryAddress: string;
  data: ReplayData | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  actionKey: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-xs uppercase tracking-widest text-verified-400">
            Fair Witness
          </p>
          <NetworkIndicator />
        </div>
        <h1 className="text-2xl font-semibold text-ledger-100">Action detail</h1>
        <p className="mt-2 text-sm leading-relaxed text-ledger-400">
          Independently verifiable reconstruction of a single decision, traced
          from the Sepolia fact through the attestation proofs to the on-chain
          execution. Read bottom-up in the Causal timeline.
        </p>
      </header>

      {/* Instance context */}
      <section className="mb-8 rounded-lg border border-ledger-700 bg-ledger-900 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledger-200">
          Instance context
        </h2>
        {treasuryLoading && <p className="text-sm text-ledger-400">Loading instance…</p>}
        {treasuryError && (
          <p className="text-sm text-alert-400">{treasuryError}</p>
        )}
        {treasury && (
          <dl>
            <dt className="text-xs uppercase tracking-wide text-ledger-400">
              Treasury
            </dt>
            <dd className="font-data text-sm text-verified-400 break-all">
              {treasury.address}
            </dd>
            <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">
              Owner
            </dt>
            <dd className="font-data text-sm text-ledger-100">
              {treasury.owner === ethers.ZeroAddress ? "system" : treasury.owner}
            </dd>
            <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">
              Journal length
            </dt>
            <dd className="font-data text-sm text-ledger-100">{treasury.journalLength}</dd>
            <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">
              Guardrails (immutable at construction)
            </dt>
            <dd className="mt-1 text-xs text-ledger-400">
              Max trade {treasury.guardrails.maxTradeSize} • slippage ≤
              {treasury.guardrails.maxSlippageBps} bps • min gap{" "}
              {treasury.guardrails.minArbWidthBps} bps • drift ≤
              {treasury.guardrails.maxDriftBps} bps • ≤
              {treasury.guardrails.maxActionsPerEpoch}/epoch ({treasury.guardrails.epochLength}s)
            </dd>
          </dl>
        )}
      </section>

      {/* Replay data */}
      <section>
        {error && (
          <p className="mb-4 rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-ledger-400">Loading action…</p>}
        {notFound && !loading && (
          <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-6 text-center">
            <p className="text-sm text-ledger-400">
              No journal entry found for {actionKey}
              {treasuryAddress
                ? ` in instance ${
                    treasuryAddress.slice(0, 6) + "..." + treasuryAddress.slice(-4)
                  }`
                : " (no instance selected)"}.
            </p>
            <Link
              to="/verify"
              className="mt-3 inline-block text-sm text-copper-400 hover:text-copper-500"
            >
              ← Back to verify a different action
            </Link>
          </div>
        )}
        {data && (
          <div className="space-y-8">
            <ReplayCard data={data} />
            <CausalExplorer data={data} />
          </div>
        )}
      </section>
    </div>
  );
}

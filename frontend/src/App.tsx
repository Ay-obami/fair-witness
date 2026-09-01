import { useEffect, useState } from "react";
import { config } from "./lib/config";
import { fetchReplayData, fetchTreasury } from "./lib/dataProvider";
import { fetchTenantList, type DiscoveredTenant } from "./lib/tenantDiscovery";
import { SearchBar } from "./components/SearchBar";
import { ReplayCard } from "./components/ReplayCard";
import { TenantPanel } from "./components/TenantPanel";
import type { ReplayData, TreasuryInfo } from "./lib/types";

export default function App() {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The treasury instance currently being viewed. Defaults to the configured one; the
  // TenantPanel switcher can point the whole viewer at any other factory-deployed
  // instance — its immutable guardrails are then read live and shown, and replays query
  // THAT instance's journal.
  const [treasuryAddress, setTreasuryAddress] = useState(config.treasuryAddress);
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);

  // Instances enumerated from the committed on-chain index (TenantPanel chips). Fetched
  // once on mount; failure is non-fatal — paste-to-view still works.
  const [discovered, setDiscovered] = useState<DiscoveredTenant[]>([]);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchTenantList().then(({ tenants }) => {
      if (cancelled) return;
      setDiscovered(tenants);
      setDiscoveryFailed(tenants.length === 0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Synchronize the viewer with the selected instance's chain identity + guardrails.
    // The `cancelled` flag prevents a race when the user switches instances quickly: a
    // slow response for the previous address must never overwrite the newer one's state.
    let cancelled = false;
    async function run(address: string) {
      await Promise.resolve(); // enter an async continuation before touching state
      if (cancelled) return;
      if (!address) {
        setTreasury(null);
        setTreasuryError("No instance address configured yet — paste one below to view its guardrails.");
        return;
      }
      setTreasuryLoading(true);
      setTreasuryError(null);
      try {
        const info = await fetchTreasury(address);
        if (!cancelled) setTreasury(info);
      } catch (err) {
        if (!cancelled) {
          setTreasury(null);
          setTreasuryError(
            `Couldn't read guardrails from ${address}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      } finally {
        if (!cancelled) setTreasuryLoading(false);
      }
    }
    void run(treasuryAddress);
    return () => {
      cancelled = true;
    };
  }, [treasuryAddress]);

  async function handleSearch(actionKey: string) {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setData(null);
    try {
      const result = await fetchReplayData(actionKey, treasuryAddress);
      if (result) {
        setData(result);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ledger-950">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-8">
          <p className="mb-1 text-xs uppercase tracking-widest text-verified-400">
            Fair Witness
          </p>
          <h1 className="text-2xl font-semibold text-ledger-100">Replay & Audit Viewer</h1>
          <p className="mt-2 text-sm leading-relaxed text-ledger-400">
            Reconstructs the full attestation → decision → action chain for any executed or rejected arbitrage
            action, and independently re-hashes the retrieved off-chain reasoning to confirm it matches the
            on-chain commitment. In the multi-tenant shape, each treasury instance is independent with its own
            immutable guardrails — pick an instance below, then replay actions from ITS journal.
          </p>
          {config.demoMode && (
            <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-2.5 text-xs text-alert-400">
              Demo mode — showing illustrative sample data, not a live chain. Set{" "}
              <code className="font-data">VITE_DEMO_MODE=false</code> and the RPC/contract env vars to point this
              at a real deployment (see docs/DEPLOYMENT.md).
            </div>
          )}
        </header>

        <div className="space-y-6">
          <TenantPanel
            treasury={treasury}
            loading={treasuryLoading}
            error={treasuryError}
            onSwitch={setTreasuryAddress}
            discovered={discovered}
            discoveryFailed={discoveryFailed}
          />

          <SearchBar onSearch={handleSearch} loading={loading} />

          <div>
            {error && (
              <p className="rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">
                {error}
              </p>
            )}
            {notFound && !error && (
              <p className="rounded-md border border-ledger-700 bg-ledger-900 px-4 py-3 text-sm text-ledger-400">
                No journal entry found for that actionKey{treasuryAddress ? " in this instance's journal" : ""}.
              </p>
            )}
            {data && <ReplayCard data={data} />}
          </div>
        </div>
      </div>
    </div>
  );
}

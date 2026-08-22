import { useState } from "react";
import { config } from "./lib/config";
import { fetchReplayData } from "./lib/dataProvider";
import { SearchBar } from "./components/SearchBar";
import { ReplayCard } from "./components/ReplayCard";
import type { ReplayData } from "./lib/types";

export default function App() {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(actionKey: string) {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setData(null);
    try {
      const result = await fetchReplayData(actionKey);
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
            Attested Custody-Free Arbitrage Journal
          </p>
          <h1 className="text-2xl font-semibold text-ledger-100">Replay & Audit Viewer</h1>
          <p className="mt-2 text-sm leading-relaxed text-ledger-400">
            Reconstructs the full attestation → decision → action chain for any executed or rejected arbitrage
            action, and independently re-hashes the retrieved off-chain reasoning to confirm it matches the
            on-chain commitment.
          </p>
          {config.demoMode && (
            <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-2.5 text-xs text-alert-400">
              Demo mode — showing illustrative sample data, not a live chain. Set{" "}
              <code className="font-data">VITE_DEMO_MODE=false</code> and the RPC/contract env vars to point this
              at a real deployment (see docs/DEPLOYMENT.md).
            </div>
          )}
        </header>

        <SearchBar onSearch={handleSearch} loading={loading} />

        <div className="mt-8">
          {error && (
            <p className="rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">
              {error}
            </p>
          )}
          {notFound && !error && (
            <p className="rounded-md border border-ledger-700 bg-ledger-900 px-4 py-3 text-sm text-ledger-400">
              No journal entry found for that actionKey.
            </p>
          )}
          {data && <ReplayCard data={data} />}
        </div>
      </div>
    </div>
  );
}

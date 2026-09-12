import { useEffect, useState } from "react";
import { config } from "../lib/config";
import { fetchReplayData, fetchTreasury } from "../lib/dataProvider";
import { fetchTenantList, type DiscoveredTenant } from "../lib/tenantDiscovery";
import { SearchBar } from "../components/SearchBar";
import { ReplayCard } from "../components/ReplayCard";
import { TenantPanel } from "../components/TenantPanel";
import { ControlledMarketBadge, ExecutionRail } from "../components/ProductVisuals";
import type { ReplayData, TreasuryInfo } from "../lib/types";
import { Layout } from "../components/layout";

export default function Verify() {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treasuryAddress, setTreasuryAddress] = useState(config.treasuryAddress);
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredTenant[]>([]);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchTenantList().then(({ tenants }) => { if (cancelled) return; setDiscovered(tenants); setDiscoveryFailed(tenants.length === 0); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run(address: string) {
      await Promise.resolve();
      if (cancelled) return;
      if (!address) { setTreasury(null); setTreasuryError("No instance address configured yet — paste one below to view its policy state."); return; }
      setTreasuryLoading(true); setTreasuryError(null);
      try { const info = await fetchTreasury(address); if (!cancelled) setTreasury(info); }
      catch (err) { if (!cancelled) { setTreasury(null); setTreasuryError(`Couldn't read this treasury: ${err instanceof Error ? err.message : String(err)}`); } }
      finally { if (!cancelled) setTreasuryLoading(false); }
    }
    void run(treasuryAddress);
    return () => { cancelled = true; };
  }, [treasuryAddress]);

  async function handleSearch(actionKey: string) {
    setLoading(true); setError(null); setNotFound(false); setData(null);
    try { const result = await fetchReplayData(actionKey, treasuryAddress); if (result) setData(result); else setNotFound(true); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  return <Layout><main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-16 -top-24 h-72 w-72 bg-external-500/14" />
      <div className="relative z-10 grid gap-7 lg:grid-cols-[1fr_.75fr] lg:items-end">
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Independent verification</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Replay & audit console</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Select a treasury, enter an action key and reconstruct the evidence → decision → authorization → outcome chain from public data.</p></div>
        <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4"><ExecutionRail active={data ? 5 : 2} /><p className="mt-4 text-center text-[10px] uppercase tracking-[.18em] text-ledger-600">Verification path</p></div>
      </div>
    </header>

    {config.demoMode && <div className="mt-5 rounded-2xl border border-alert-500/25 bg-alert-500/5 px-4 py-3 text-xs text-alert-400">Local illustrative demo mode is enabled for this build. Public deployment verification requires the live RPC and contract environment.</div>}

    <div className="mt-8 grid gap-6 lg:grid-cols-[.92fr_1.08fr] lg:items-start">
      <div className="space-y-5 lg:sticky lg:top-24">
        <div className="fw-command-surface rounded-3xl border p-5"><div className="mb-4"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Step 1</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Choose treasury</h2></div><TenantPanel treasury={treasury} loading={treasuryLoading} error={treasuryError} onSwitch={setTreasuryAddress} discovered={discovered} discoveryFailed={discoveryFailed} /></div>
        <div className="fw-command-surface rounded-3xl border p-5"><div className="mb-4"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Step 2</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Replay action</h2></div><SearchBar onSearch={handleSearch} loading={loading} /></div>
      </div>

      <section className="min-w-0">
        {error && <p className="rounded-xl border border-alert-500/30 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">{error}</p>}
        {notFound && !error && <div className="fw-glass rounded-3xl p-6"><p className="text-sm text-ledger-300">No matching replay record was found for that action key{treasuryAddress ? " in the selected treasury" : ""}.</p><p className="mt-2 text-xs leading-relaxed text-ledger-500">Check the treasury selection and action key. The current schema preserves accepted, rejected and failed attempts in its audit path so outcomes can be inspected rather than inferred.</p></div>}
        {!data && !error && !notFound && <div className="fw-glass rounded-3xl p-6 sm:p-8"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Awaiting action key</p><h2 className="mt-3 text-2xl font-semibold text-ledger-100">Nothing to trust yet — verify it yourself.</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-ledger-400">A successful replay lets you inspect the treasury context, evidence chain, decision commitment and resulting on-chain action from one console.</p></div>}
        {data && <div className="space-y-5"><div className="rounded-2xl border border-verified-500/20 bg-verified-500/5 p-4"><div className="flex items-center gap-2 text-xs text-verified-400"><span className="fw-status-dot" /> Replay reconstructed from the selected treasury context.</div></div><ReplayCard data={data} /></div>}
      </section>
    </div>
  </main></Layout>;
}

import { ethers } from "ethers";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { config } from "../lib/config";
import { fetchReplayData, fetchTreasury } from "../lib/dataProvider";
import { ReplayCard } from "../components/ReplayCard";
import { CausalExplorer } from "../components/causalExplorer";
import { NetworkIndicator } from "../components/networkIndicator";
import { Layout } from "../components/layout";
import { DecisionSequence } from "../components/ProductVisuals";
import type { ReplayData, TreasuryInfo } from "../lib/types";

export default function ActionDetail() {
  const { actionKey, instance } = useParams();
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treasuryAddress] = useState<string>(instance ?? config.treasuryAddress);
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!treasuryAddress) return;
      setTreasuryLoading(true);
      try { setTreasury(await fetchTreasury(treasuryAddress)); }
      catch (err) { if (!cancelled) { setTreasury(null); setTreasuryError(`Couldn't read this instance: ${err instanceof Error ? err.message : String(err)}`); } }
      finally { if (!cancelled) setTreasuryLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [treasuryAddress]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!actionKey) return;
      setLoading(true); setNotFound(false); setError(null); setData(null);
      try { const result = await fetchReplayData(actionKey, treasuryAddress); if (!cancelled) { if (result) setData(result); else setNotFound(true); } }
      catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [actionKey, treasuryAddress]);

  return <Layout><div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7">
      <div className="fw-ambient-orb -right-20 -top-24 h-72 w-72 bg-external-500/12" />
      <div className="relative z-10"><div className="mb-4 flex flex-wrap items-center gap-3"><p className="fw-kicker">Forensic replay</p><NetworkIndicator /></div><h1 className="text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Action detail</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Reconstruct one decision from source-chain fact through Attestcoin verification, policy authorization and final treasury outcome.</p></div>
    </header>

    <section className="fw-command-surface mt-8 rounded-3xl border p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Instance context</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">Treasury state</h2></div><span className="fw-status-chip text-[10px] font-data">ON-CHAIN</span></div>
      {treasuryLoading && <p className="mt-4 text-sm text-ledger-400">Loading instance…</p>}
      {treasuryError && <p className="mt-4 text-sm text-alert-400">{treasuryError}</p>}
      {treasury && <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Treasury" value={treasury.address} mono />
        <Info label="Owner" value={treasury.owner === ethers.ZeroAddress ? "system" : treasury.owner} mono />
        <Info label="Journal length" value={String(treasury.journalLength)} />
        <Info label="Max actions / epoch" value={`${treasury.guardrails.maxActionsPerEpoch} / ${treasury.guardrails.epochLength}s`} />
      </div>}
      {treasury && <p className="mt-4 rounded-xl border border-ledger-800 bg-ledger-950/55 p-3 text-xs leading-relaxed text-ledger-500">Guardrails · max trade {treasury.guardrails.maxTradeSize} · slippage ≤ {treasury.guardrails.maxSlippageBps} bps · min gap {treasury.guardrails.minArbWidthBps} bps · drift ≤ {treasury.guardrails.maxDriftBps} bps</p>}
    </section>

    <section className="mt-8">
      {error && <p className="mb-4 rounded-xl border border-alert-500/30 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">{error}</p>}
      {loading && <div className="fw-glass rounded-3xl p-6 text-sm text-ledger-400">Loading action reconstruction…</div>}
      {notFound && !loading && <div className="fw-glass rounded-3xl p-6 text-center"><p className="text-sm text-ledger-400">No journal entry found for {actionKey}{treasuryAddress ? ` in instance ${treasuryAddress.slice(0, 6)}...${treasuryAddress.slice(-4)}` : " (no instance selected)"}.</p><Link to="/verify" className="mt-4 inline-block text-sm text-copper-400">← Back to verify another action</Link></div>}
      {data && <div className="space-y-8">
        <div className="fw-command-surface rounded-3xl border p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Decision path</p><h2 className="mt-1 text-xl font-semibold text-ledger-100">From proposal to treasury outcome</h2></div><span className="fw-status-chip text-[10px] text-verified-400"><span className="fw-status-dot" /> RECONSTRUCTED</span></div><div className="mt-5"><DecisionSequence reason="The replay below exposes the evidence and causal chain behind this outcome." /></div></div>
        <ReplayCard data={data} />
        <CausalExplorer data={data} />
      </div>}
    </section>
  </div></Layout>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4"><p className="text-[10px] uppercase tracking-[.16em] text-ledger-500">{label}</p><p className={`mt-2 break-all text-sm text-ledger-200 ${mono ? "font-data" : ""}`}>{value}</p></div>;
}

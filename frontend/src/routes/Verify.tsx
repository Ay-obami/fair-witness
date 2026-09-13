import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { Layout } from "../components/layout";
import { ControlledMarketBadge, ExecutionRail } from "../components/ProductVisuals";

export default function Verify() {
  const navigate = useNavigate();
  const [treasury, setTreasury] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function inspect() {
    setError(null);
    const rawTreasury = treasury.trim();
    const rawAttempt = attemptId.trim();
    if (!ethers.isAddress(rawTreasury)) return setError("Enter a valid schema-v1 treasury address.");
    if (!/^\d+$/.test(rawAttempt) || BigInt(rawAttempt) <= 0n) return setError("Enter a valid on-chain attempt ID greater than zero.");
    navigate(`/decision/${ethers.getAddress(rawTreasury)}/${rawAttempt}`);
  }

  return <Layout><main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="relative overflow-hidden rounded-3xl border border-ledger-800 bg-ledger-900/60 p-5 sm:p-7 lg:p-8">
      <div className="fw-ambient-orb -right-16 -top-24 h-72 w-72 bg-external-500/14" />
      <div className="relative z-10 grid gap-7 lg:grid-cols-[1fr_.75fr] lg:items-end">
        <div><div className="flex flex-wrap items-center gap-3"><p className="fw-kicker">Independent verification</p><ControlledMarketBadge /></div><h1 className="mt-5 text-4xl font-semibold tracking-tight text-ledger-100 sm:text-5xl">Inspect a schema-v1 decision.</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Enter a treasury and attempt ID to read the current Fair Witness attempt record directly from Creditcoin: evidence identifiers, policy result, capital outcome and cryptographic commitments.</p></div>
        <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4"><ExecutionRail active={4} labels={["Locate", "Read", "Verify", "Inspect", "Trace"]} /><p className="mt-4 text-center text-[10px] uppercase tracking-[.18em] text-ledger-600">Public on-chain audit path</p></div>
      </div>
    </header>

    <section className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
      <div className="fw-command-surface rounded-3xl border p-5 sm:p-6">
        <p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Decision locator</p>
        <h2 className="mt-2 text-2xl font-semibold text-ledger-100">Find an on-chain attempt</h2>
        <p className="mt-2 text-sm leading-relaxed text-ledger-400">You can copy the treasury address and attempt number from the Activity journal.</p>

        <label className="mt-6 block text-[11px] uppercase tracking-wide text-ledger-500">Treasury address
          <input value={treasury} onChange={event => setTreasury(event.target.value)} placeholder="0x…" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="mt-1.5 w-full rounded-xl border border-ledger-700 bg-ledger-950/75 px-3 py-3 font-data text-sm normal-case tracking-normal text-ledger-100" />
        </label>
        <label className="mt-4 block text-[11px] uppercase tracking-wide text-ledger-500">Attempt ID
          <input value={attemptId} onChange={event => setAttemptId(event.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="1" className="mt-1.5 w-full rounded-xl border border-ledger-700 bg-ledger-950/75 px-3 py-3 text-sm normal-case tracking-normal text-ledger-100" />
        </label>

        {error && <p className="mt-4 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
        <button type="button" onClick={inspect} className="fw-primary-button mt-5 w-full cursor-pointer rounded-xl px-5 py-3.5 text-sm font-semibold">Inspect audit trace →</button>
      </div>

      <div className="space-y-4">
        <AuditPoint code="01" title="Evidence identifiers" detail="Source and confirmation chain key, block heights and transaction indices recorded by the treasury attempt." tone="external" />
        <AuditPoint code="02" title="Deterministic authorization" detail="Evidence status, reason code, policy commitment, permitted amount and evaluated state are read from the on-chain record." tone="copper" />
        <AuditPoint code="03" title="Capital outcome" detail="See whether the proposal was rejected, executed, or reached the venue and failed — without inferring the result from AI prose." tone="verified" />
        <div className="rounded-2xl border border-ledger-800 bg-ledger-950/55 p-4"><p className="text-[10px] uppercase tracking-[.18em] text-ledger-500">Honest boundary</p><p className="mt-2 text-xs leading-relaxed text-ledger-400">Schema-v1 commits to a decision hash but does not store the model's prose rationale in the treasury. The audit view only presents facts the current contract actually records.</p></div>
      </div>
    </section>
  </main></Layout>;
}

function AuditPoint({ code, title, detail, tone }: { code: string; title: string; detail: string; tone: "external" | "copper" | "verified" }) {
  const toneClass = tone === "external" ? "border-external-500/25 bg-external-500/5 text-external-400" : tone === "copper" ? "border-copper-500/25 bg-copper-500/5 text-copper-400" : "border-verified-500/25 bg-verified-500/5 text-verified-400";
  return <article className="rounded-2xl border border-ledger-800 bg-ledger-950/45 p-4 sm:p-5"><div className="flex items-start gap-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border font-data text-[9px] ${toneClass}`}>{code}</span><div className="min-w-0"><h2 className="text-base font-semibold text-ledger-100">{title}</h2><p className="mt-1 text-sm leading-relaxed text-ledger-400">{detail}</p></div></div></article>;
}
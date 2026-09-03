// Confirmation page — shows the deployed instance and next steps (fund it).
import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ethers } from "ethers";
import { config } from "../lib/config";
import { fetchTreasuryInfo } from "../lib/contractReader";
import type { TreasuryInfo } from "../lib/types";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function SignUpDone() {
  const navigate = useNavigate();
  const query = useQuery();
  const addr = query.get("address");
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!addr) {
      navigate("/signup");
      return;
    }
    const checksummed = ethers.getAddress(addr);
    void fetchTreasuryInfo(checksummed)
      .then(setTreasury)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [addr, navigate]);

  if (!addr) return null;

  const explorerBase = config.explorerBaseUrl;
  const checksummed = ethers.getAddress(addr);
  const BASE_ASSET = "0x0bFA6eF009f8739c727b292849029608bd6b115A";

  return (
    <div className="min-h-screen bg-ledger-950">
      <nav className="border-b border-ledger-800">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
        </div>
      </nav>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-6 text-4xl font-bold text-verified-400">✓</div>
        <h1 className="text-2xl font-bold text-ledger-100">Your instance is deployed</h1>
        <p className="mt-3 text-sm leading-relaxed text-ledger-400">
          Congratulations. You now own a unique treasury contract on the Creditcoin CC3 testnet.
          This contract holds your funds and enforces your guardrails as immutable code — no one
          can loosen your limits, not even you, not the agent, not Fair Witness.
        </p>

        <div className="mt-8 rounded-lg border border-ledger-700 bg-ledger-900 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-ledger-400">Your contract</p>
            <a
              href={`${explorerBase}/address/${checksummed}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-data text-verified-400 hover:underline"
            >
              View on explorer
            </a>
          </div>
          <code className="mt-2 block font-data text-sm text-verified-400 break-all py-2">
            {checksummed}
          </code>
        </div>

        {loading && <p className="mt-6 text-sm text-ledger-400">Reading your guardrails…</p>}
        {error && <p className="mt-4 text-sm text-alert-400">{error}</p>}

        {treasury && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-ledger-100">Your immutable guardrails</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <GuardrailRow label="Max trade size" value={`${Number(BigInt(treasury.guardrails.maxTradeSize)) / 1_000_000} USDC`} />
              <GuardrailRow label="Max slippage" value={`${treasury.guardrails.maxSlippageBps} bps`} />
              <GuardrailRow label="Min arb width" value={`${treasury.guardrails.minArbWidthBps} bps`} />
              <GuardrailRow label="Max drift" value={`${treasury.guardrails.maxDriftBps} bps`} />
              <GuardrailRow label="Max confirm gap" value={`${treasury.guardrails.maxConfirmGapBlocks} blocks`} />
              <GuardrailRow label="Actions per epoch" value={treasury.guardrails.maxActionsPerEpoch.toString()} />
              <GuardrailRow label="Epoch length" value={`${Math.round(Number(treasury.guardrails.epochLength) / 3600)} hours`} />
            </div>
          </div>
        )}

        <div className="mt-8 rounded-md border border-verified-500/30 bg-verified-500/5 p-6">
          <p className="text-sm font-semibold text-verified-400">Next step: fund your contract</p>
          <p className="mt-1 text-sm text-ledger-400">
            Send test USDC (BASE_ASSET) from{" "}
            <a
              href={`${explorerBase}/address/${BASE_ASSET}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-verified-400"
            >
              {`${BASE_ASSET.slice(0, 8)}…${BASE_ASSET.slice(-4)}`}
            </a>
            ) to your contract above. The public mint function is available on testnet.
            Once funded, your agent will begin watching for arbitrage opportunities.
          </p>
        </div>

        <div className="mt-6">
          <Link
            to="/verify"
            className="text-sm text-ledger-400 hover:text-verified-400 transition"
          >
            ← Back to verify an action
          </Link>
        </div>
      </div>
    </div>
  );
}

function GuardrailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-md border border-ledger-800 bg-ledger-950 px-3 py-2">
      <span className="text-xs text-ledger-400">{label}</span>
      <span className="font-data text-xs text-ledger-100">{value}</span>
    </div>
  );
}

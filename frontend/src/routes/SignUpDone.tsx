// Confirmation page — shows the deployed instance and next steps (fund it, register
// the agent). The "Register the agent" card is the one-tx owner action that allowlists
// the platform's low-privilege agent key as a submitter on the fresh instance — without
// it, a newly deployed instance is never watched by the agent at all.
import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ethers } from "ethers";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { creditcoinTestnet, wallet, client as thirdwebClient } from "../lib/thirdweb";
import { config } from "../lib/config";
import { fetchTreasuryInfo, fetchAgentRegistered } from "../lib/contractReader";
import type { TreasuryInfo } from "../lib/types";

// Owner-only write: add the platform agent to the instance's submitter allowlist.
const REGISTER_AGENT_ABI = ["function registerAgent(address agent)"];

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
  // Agent-registration card state.
  const [account, setAccount] = useState(() => wallet.getAccount());
  const [agentStatus, setAgentStatus] = useState<"loading" | "unset" | "registered" | "error">("loading");
  const [regState, setRegState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [regError, setRegError] = useState<string | null>(null);

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

  // Restore the embedded-wallet session — the wallet that just deployed (or a
  // returning session in this browser) is the instance owner, the only address
  // allowed to call registerAgent.
  useEffect(() => {
    let cancelled = false;
    wallet
      .autoConnect({ client: thirdwebClient })
      .then(() => {
        if (!cancelled) setAccount(wallet.getAccount());
      })
      .catch(() => {
        /* no stored session in this browser — the card offers the dashboard route */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Public on-chain read: is the platform agent already allowlisted on THIS instance?
  useEffect(() => {
    if (!addr) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setAgentStatus("loading");
      try {
        const ok = await fetchAgentRegistered(ethers.getAddress(addr), config.agentSubmitAddress);
        if (!cancelled) setAgentStatus(ok ? "registered" : "unset");
      } catch {
        if (!cancelled) setAgentStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addr]);

  async function handleRegisterAgent() {
    if (!account || !addr) return;
    if (!config.agentSubmitAddress) {
      setRegError("Build is missing VITE_AGENT_SUBMIT_ADDRESS — cannot register.");
      setRegState("error");
      return;
    }
    setRegError(null);
    setRegState("pending");
    try {
      const checksummed = ethers.getAddress(addr);
      const signer = await ethers6Adapter.signer.toEthers({
        client: thirdwebClient,
        chain: creditcoinTestnet,
        account,
      });
      const instance = new ethers.Contract(checksummed, REGISTER_AGENT_ABI, signer);
      const tx = await instance.registerAgent(config.agentSubmitAddress);
      const receipt = await tx.wait();
      if (receipt?.status !== 1) throw new Error("Transaction reverted (status 0).");
      const ok = await fetchAgentRegistered(checksummed, config.agentSubmitAddress);
      setAgentStatus(ok ? "registered" : "error");
      setRegState("done");
    } catch (err) {
      setRegState("error");
      const msg = err instanceof Error ? err.message : String(err);
      setRegError(
        /user rejected|user denied|user cancelled/i.test(msg)
          ? "Transaction was rejected in your wallet — nothing was sent."
          : msg
      );
    }
  }

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

        {/* One-tx owner action: allowlist the platform agent as a submitter. */}
        <div className="mt-6 rounded-lg border border-ledger-700 bg-ledger-900 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-ledger-400">Fair Witness agent</p>
            {agentStatus === "registered" && (
              <span className="text-xs font-data text-verified-400">registered ✓</span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ledger-400">
            Register the platform's agent key as an allowed submitter on your contract. It
            is a separate low-privilege key that holds gas money only — it can never move
            your funds, and every action it takes is still hard-checked against the
            immutable guardrails above.
          </p>
          {agentStatus === "loading" && (
            <p className="mt-3 text-sm text-ledger-400">Checking registration…</p>
          )}
          {agentStatus === "error" && (
            <p className="mt-3 text-sm text-alert-400">
              Couldn't read agent status from the chain — check the RPC config and reload.
            </p>
          )}
          {agentStatus === "registered" ? (
            <p className="mt-3 text-sm text-verified-400">
              ✓ Registered. Once your contract is funded, the agent will begin watching it.
            </p>
          ) : (
            <>
              {agentStatus === "unset" && (
                <p className="mt-3 text-sm text-ledger-400">
                  Not registered yet — one transaction from you (the owner) enables it.
                </p>
              )}
              {account && config.agentSubmitAddress ? (
                <>
                  <button
                    onClick={handleRegisterAgent}
                    disabled={regState === "pending"}
                    className="mt-4 rounded-md bg-verified-500 px-5 py-2 text-sm font-semibold text-ledger-950 hover:bg-verified-400 transition disabled:opacity-50"
                  >
                    {regState === "pending" ? "Confirm in your wallet…" : "Register the agent"}
                  </button>
                  {regError && <p className="mt-3 text-sm text-alert-400">{regError}</p>}
                </>
              ) : (
                <p className="mt-3 text-xs text-ledger-500">
                  {config.agentSubmitAddress ? (
                    <>
                      No wallet session in this browser — sign in via the{" "}
                      <Link to="/dashboard" className="underline hover:text-verified-400">Dashboard</Link>{" "}
                      to register.
                    </>
                  ) : (
                    "Build config missing VITE_AGENT_SUBMIT_ADDRESS."
                  )}
                </p>
              )}
            </>
          )}
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

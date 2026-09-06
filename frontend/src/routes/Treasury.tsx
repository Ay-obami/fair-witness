// Phase 1, Page 11 — Treasury page (`/treasury`).
// Shows the current instance's immutable identity + guardrails, balance, owner,
// and a static "agent can / cannot" permissions list. Only lists permissions
// the contract actually enforces (ASCTreasuryJournal.sol / ASCTreasuryFactory.sol).
import { useEffect, useState } from "react";
import { config } from "../lib/config";
import { fetchTreasury, fetchNativeBalance, fetchAgentStatus } from "../lib/dataProvider";
import { fetchTenantList, type DiscoveredTenant } from "../lib/tenantDiscovery";
import { TenantPanel } from "../components/TenantPanel";
import { NetworkIndicator } from "../components/networkIndicator";
import { Layout } from "../components/layout";
import type { TreasuryInfo } from "../lib/types";

export default function Treasury() {
  const [treasuryAddress, setTreasuryAddress] = useState(config.treasuryAddress);
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [agentRegistered, setAgentRegistered] = useState<boolean | null>(null);

  const [discovered, setDiscovered] = useState<DiscoveredTenant[]>([]);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);

  // On-chain index discovery (public/tenants.json) — same pattern as Verify.
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

  // When the user switches instance via the TenantPanel, update the address.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!treasuryAddress) {
        setTreasury(null);
        setError("No instance address configured yet — paste one below to view its guardrails.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const info = await fetchTreasury(treasuryAddress);
        if (!cancelled) setTreasury(info);
      } catch (err) {
        if (!cancelled) {
          setTreasury(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treasuryAddress]);

  // Fetch balance once we have a treasury.
  useEffect(() => {
    let cancelled = false;
    if (!treasuryAddress) {
      // No reset needed: balance only renders inside the instance section,
      // which is hidden when no instance is loaded.
      return;
    }
    void (async () => {
      setBalanceLoading(true);
      try {
        const bal = await fetchNativeBalance(treasuryAddress);
        if (!cancelled) setBalance(bal);
      } catch {
        if (!cancelled) setBalance("unavailable");
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treasuryAddress]);

  // Fetch agent registration status.
  useEffect(() => {
    let cancelled = false;
    if (!treasuryAddress || !config.agentSubmitAddress) {
      // No reset needed: the agent section only renders when both are present.
      return;
    }
    void (async () => {
      const registered = await fetchAgentStatus(treasuryAddress);
      if (!cancelled) setAgentRegistered(registered);
    })();
    return () => {
      cancelled = true;
    };
  }, [treasuryAddress]);

  const explorerUrl = (address: string) =>
    `${config.explorerBaseUrl}/address/${address}`;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs uppercase tracking-widest text-verified-400">
              Fair Witness
            </p>
            <NetworkIndicator />
          </div>
          <h1 className="text-2xl font-semibold text-ledger-100">Treasury instance</h1>
          <p className="mt-2 text-sm leading-relaxed text-ledger-400">
            Read-only view of the immutable, on-chain identity and guardrails
            for a single treasury instance. Everything here is read live from
            the selected instance — it cannot be changed, only read.
          </p>
        </header>

        <div className="mb-6">
          <TenantPanel
            treasury={treasury ?? null}
            loading={loading}
            error={error ?? null}
            onSwitch={setTreasuryAddress}
            discovered={discovered}
            discoveryFailed={discoveryFailed}
          />
        </div>

        {loading && <p className="text-sm text-ledger-400">Loading instance…</p>}
        {error && (
          <p className="rounded-md border border-alert-500/30 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">
            {error}
          </p>
        )}

        {treasury && (
          <section className="space-y-6">
            {/* Identity */}
            <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledger-200">
                Identity
              </h2>
              <dl>
                <dt className="text-xs uppercase tracking-wide text-ledger-400">Network</dt>
                <dd className="font-data text-sm text-ledger-100">Creditcoin CC3 testnet</dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">
                  Treasury address
                </dt>
                <dd className="font-data text-sm text-verified-400 break-all">
                  {treasury.address}
                </dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">Owner</dt>
                <dd className="font-data text-sm text-ledger-100 break-all">
                  {treasury.owner}
                </dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">
                  Native balance
                </dt>
                <dd className="font-data text-sm text-ledger-100">
                  {balanceLoading ? "Loading…" : balance ?? "unavailable"}
                </dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">
                  Journal length
                </dt>
                <dd className="font-data text-sm text-ledger-100">{treasury.journalLength} entries</dd>
              </dl>
            </section>

            {/* Guardrails */}
            <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledger-200">
                Guardrails (constructor-set immutables)
              </h2>
              <p className="mb-3 text-xs text-ledger-400">
                These were baked into the contract at deployment. They cannot be
                changed — not by the agent, not by us, not even by you. This is a
                feature: it's the guarantee that makes "your limits really
                applied" honest.
              </p>
              <dl>
                <dt className="text-xs uppercase tracking-wide text-ledger-400">Max trade size</dt>
                <dd className="font-data text-sm text-ledger-100">{treasury.guardrails.maxTradeSize} (base asset)</dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">Max slippage</dt>
                <dd className="font-data text-sm text-ledger-100">≤ {treasury.guardrails.maxSlippageBps} bps</dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">Min arbitrage width</dt>
                <dd className="font-data text-sm text-ledger-100">≥ {treasury.guardrails.minArbWidthBps} bps</dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">Max drift between proofs</dt>
                <dd className="font-data text-sm text-ledger-100">≤ {treasury.guardrails.maxDriftBps} bps</dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">Max confirm gap</dt>
                <dd className="font-data text-sm text-ledger-100">≤ {treasury.guardrails.maxConfirmGapBlocks} blocks</dd>
                <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">Actions per epoch</dt>
                <dd className="font-data text-sm text-ledger-100">≤ {treasury.guardrails.maxActionsPerEpoch} ({treasury.guardrails.epochLength}s epochs)</dd>
              </dl>
            </section>

            {/* Agent registration */}
            {config.agentSubmitAddress && (
              <section className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledger-200">
                  Agent submitter
                </h2>
                <dl>
                  <dt className="text-xs uppercase tracking-wide text-ledger-400">
                    Platform agent address
                  </dt>
                  <dd className="font-data text-sm text-ledger-100 break-all">
                    {config.agentSubmitAddress}
                  </dd>
                  <dt className="mt-1 text-xs uppercase tracking-wide text-ledger-400">
                    Registered on this instance?
                  </dt>
                  <dd className="font-data text-sm text-ledger-100">
                    {agentRegistered === null
                      ? "Checking…"
                      : agentRegistered
                        ? "Yes — the agent is allowlisted to submit actions here"
                        : "No — the agent is not registered on this instance and cannot act on it"}
                  </dd>
                </dl>
              </section>
            )}
          </section>
        )}

        {treasury && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledger-200">
              On-chain references
            </h2>
            <ul className="space-y-1 text-xs">
              <li>
                <a
                  href={explorerUrl(treasury.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-data text-external-400 hover:text-external-500"
                >
                  Treasury contract → {treasury.address.slice(0, 6) + "…" + treasury.address.slice(-4)}
                </a>
              </li>
              <li>
                <a
                  href={explorerUrl(treasury.owner)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-data text-external-400 hover:text-external-500"
                >
                  Owner ({treasury.owner.slice(0, 6) + "…" + treasury.owner.slice(-4)}) → explorer
                </a>
              </li>
            </ul>
          </section>
        )}
      </div>
    </Layout>
  );
}

// Phase 1, Page 12 — Architecture page (`/architecture`).
// Interactive diagram: LLM Agent → ASC Treasury → Attestcoin → Execution → Journal,
// with a clear trust-boundary line around the treasury. Funds/policy/execution
// inside; agent decision outside (no custody).
import { NetworkIndicator } from "../components/networkIndicator";
import { Layout } from "../components/layout";

export default function Architecture() {
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
          <h1 className="text-2xl font-semibold text-ledger-100">Architecture</h1>
          <p className="mt-2 text-sm leading-relaxed text-ledger-400">
            A plain-language map of what does what — and, crucially, what trust
            each piece requires. The teal line marks the trust boundary: anything
            inside it is on-chain and independently verifiable; anything outside
            is off-chain reasoning that the contract re-checks before acting.
          </p>
        </header>

        <section className="mb-8 rounded-lg border border-ledger-700 bg-ledger-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ledger-200">
            Trust boundary
          </h2>
          <p className="text-sm leading-relaxed text-ledger-400">
            <strong className="text-verified-400">Inside the boundary</strong>{" "}
            (on-chain, verifiable): the treasury contract enforces all guardrails,
            verifies the attestation proofs, executes against the DEX, and journals
            the result. The agent cannot bypass what the contract checks.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ledger-400">
            <strong className="text-copper-400">Outside the boundary</strong>{" "}
            (off-chain, human-readable): the LLM agent reasons about opportunities
            and proposes actions. It <em>decides</em>, but never <em>executes</em>{" "}
            directly — the contract re-validates every bound before touching funds.
          </p>
        </section>

        <section className="space-y-4">
          {/* Step 1: LLM Agent (outside) */}
          <div className="rounded-lg border border-copper-500/30 bg-copper-500/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-copper-500/30 bg-copper-500 text-xs font-bold text-background">
                1
              </span>
              <h3 className="text-lg font-semibold text-copper-400">LLM Agent (off-chain)</h3>
              <span className="ml-auto rounded-full border border-copper-500/30 bg-copper-500/10 px-2.5 py-1 text-xs font-data uppercase tracking-wide text-copper-400">
                outside trust boundary
              </span>
            </div>
            <p className="text-sm text-ledger-400">
              Watches the source chain, waits for two Attestcoin proofs confirming
              a price gap, then asks the LLM (Gemini, temperature 0 + seed for
              determinism) whether the gap clears the instance's guardrails.
              The agent only <em>proposes</em> — it never touches funds directly.
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-ledger-400">
              <li>Never holds user funds — only submits proposals to the contract</li>
              <li>Decisions are hash-committed and independently verifiable</li>
              <li>Uses one platform LLM key (Gemini), not per-user keys</li>
            </ul>
          </div>

          {/* Step 2: ASC Treasury (inside) */}
          <div className="rounded-lg border border-verified-500/30 bg-verified-500/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-verified-500/30 bg-verified-500 text-xs font-bold text-background">
                2
              </span>
              <h3 className="text-lg font-semibold text-verified-400">ASC Treasury (on-chain, per-user)</h3>
              <span className="ml-auto rounded-full border border-verified-500/30 bg-verified-500/10 px-2.5 py-1 text-xs font-data uppercase tracking-wide text-verified-400">
                inside trust boundary
              </span>
            </div>
            <p className="text-sm text-ledger-400">
              Each user gets their own factory-deployed instance. The guardrails
              (max trade, slippage, drift, rate limit — all seven) are
              <strong> constructor-set immutables</strong> — baked in once at
              deployment, unchangeable forever, even by the owner.
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-ledger-400">
              <li>Independent per-user contract — no shared mutable settings</li>
              <li>Enforces guardrails independently before any trade</li>
              <li>Never holds custody — it only mediates trades within the limits you set</li>
            </ul>
          </div>

          {/* Step 3: Attestation */}
          <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ledger-700 bg-ledger-800 text-xs font-bold text-verified-400">
                3
              </span>
              <h3 className="text-lg font-semibold text-ledger-200">Attestation (Sepolia → Creditcoin)</h3>
              <span className="ml-auto rounded-full border border-external-500/30 bg-external-500/10 px-2.5 py-1 text-xs font-data uppercase tracking-wide text-external-400">
                external evidence
              </span>
            </div>
            <p className="text-sm text-ledger-400">
              The agent builds two Attestcoin zero-knowledge proofs on Sepolia facts:
              a source-chain price observation, and a confirmation of the same fact at
              a later block. The treasury contract verifies both proofs on-chain before
              accepting any action — so the gap the AI saw is cryptographically bound
              to the execution.
            </p>
          </div>

          {/* Step 4: Execution */}
          <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ledger-700 bg-ledger-800 text-xs font-bold text-verified-400">
                4
              </span>
              <h3 className="text-lg font-semibold text-ledger-200">DEX Execution (on-chain)</h3>
            </div>
            <p className="text-sm text-ledger-400">
              If both proofs verify and the guardrails clear, the treasury executes
              a bounded swap against the destination DEX. The slippage and trade-size
              limits are enforced by the contract's own revert paths — the agent cannot
              override them.
            </p>
          </div>

          {/* Step 5: Journal */}
          <div className="rounded-lg border border-ledger-700 bg-ledger-900 p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ledger-700 bg-ledger-800 text-xs font-bold text-verified-400">
                5
              </span>
              <h3 className="text-lg font-semibold text-ledger-200">Journal (on-chain)</h3>
            </div>
            <p className="text-sm text-ledger-400">
              Every executed trade is written to the journal as a structured entry with
              a <code className="font-data text-xs text-ledger-200">decisionHash</code>
              that commits to the agent's off-chain reasoning. You can reconstruct the
              entire chain — fact, proof, decision, action — and verify the hash matches
              independently.
            </p>
            <p className="mt-2 text-xs text-ledger-400">
              Note: rejected attempts are intentionally not journaled — they revert
              on-chain. Your guardrails did their job; that's the security outcome,
              not an error to log.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-ledger-700 bg-ledger-900 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledger-200">
            Data flow summary
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-ledger-400">
            <li>
              Something happens on <span className="text-external-400">Sepolia</span> →
              Attestcoin observes it
            </li>
            <li>
              Two ZK proofs are built (observation + confirmation at a later block)
            </li>
            <li>
              Agent submits: proofs + fact + reasoning →{" "}
              <span className="text-verified-400">treasury contract</span>
            </li>
            <li>
              Treasury verifies proofs on-chain, checks guardrails (all immutable)
            </li>
            <li>
              If all clear → executes bounded DEX swap → journals the result
            </li>
            <li>
              You verify any step independently via block explorer or the Verify page
            </li>
          </ol>
        </section>
      </div>
    </Layout>
  );
}

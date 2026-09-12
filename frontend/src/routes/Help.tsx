// Plain-language help docs for non-technical users.
// Separate from docs/ (which is for developers) — this is the user-facing FAQ.
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { ControlledDemoNotice } from "../components/ControlledDemoNotice";
import { config } from "../lib/config";

export default function Help() {
  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-16 pb-32">
        <h1 className="text-3xl font-bold text-ledger-100">Help &amp; docs</h1>
        <p className="mt-3 text-sm leading-relaxed text-ledger-400">
          Plain-language answers to common Fair Witness questions. The locked technical
          architecture is documented separately in docs/architecture/ARCHITECTURE_LOCK.md.
        </p>
        <div className="mt-5"><ControlledDemoNotice /></div>

        <div className="mt-12 space-y-12">
          <Section
            title="What are guardrails, and why can't I change mine after I set them?"
            content={
              <>
                <p>
                  The schema-v1 mandate fixes enabled strategies, assets, venue, maximum action
                  value, slippage, evidence/market limits, target allocation, risk exposure and
                  rate limits. Those values are constructor-set state in your treasury, so the
                  reasoning layer cannot loosen them later.
                </p>
                <p>
                  If you want materially different limits, create another treasury with a new
                  mandate. Keeping the active treasury's authority fixed makes the safety boundary
                  easier to reason about and audit.
                </p>
              </>
            }
          />

          <Section
            title="What happens to the funds I deposit?"
            content={
              <>
                <p>
                  <strong>Your funds stay in your own treasury contract.</strong> When controlled
                  fwUSD or fwWCTC is sent to the treasury, it does not go to a Fair Witness wallet
                  or shared custody account. The bounded agent can submit a proposal to your
                  treasury, but the treasury independently decides whether it is allowed.
                </p>
                <p>
                  A proposal above the deterministic policy ceiling, using the wrong asset/venue,
                  stale evidence, excessive slippage, a replayed commitment or another disallowed
                  condition is rejected without granting the AI custody.
                </p>
              </>
            }
          />

          <Section
            title="What does a verified execution mean vs. a rejected attempt?"
            content={
              <>
                <p>
                  <strong>A verified execution</strong> means the proposal passed the treasury's
                  on-chain evidence and policy checks and the fixed adapter completed the swap.
                  The resulting transaction and attempt record are independently inspectable on
                  Creditcoin.
                </p>
                <p>
                  <strong>A rejected attempt</strong> means deterministic policy refused a
                  submitted proposal and recorded the reason. An AI decision to WAIT is different:
                  that is an off-chain decision not to submit anything at all.
                </p>
              </>
            }
          />

          <Section
            title="What is the AI allowed to decide?"
            content={
              <>
                <p>
                  The AI reasoning layer decides only whether a deterministic, policy-bounded
                  candidate should be acted on now: <strong>EXECUTE</strong> or <strong>WAIT</strong>,
                  plus rationale. It cannot rewrite the strategy, direction, asset, venue, route,
                  recipient, policy, or action ceiling.
                </p>
                <p>
                  It never receives the treasury owner key or custody of treasury funds. Even an
                  incorrect recommendation must still pass the treasury's independent checks.
                </p>
              </>
            }
          />

          <Section
            title="Is this real money? (Testnet disclaimer)"
            content={
              <>
                <p>
                  <strong>Everything in the controlled demonstration uses fixed-supply TESTNET
                  tokens with no represented economic value.</strong> fwUSD and fwWCTC are
                  independently issued on each chain; they are not bridged, redeemable,
                  collateralized or economically pegged.
                </p>
                <p>
                  The controlled markets demonstrate real public-testnet transactions,
                  Attestcoin proofs, Creditcoin verification and policy-constrained execution.
                  They do not demonstrate natural arbitrage or production profitability.
                </p>
              </>
            }
          />

          <Section
            title="Troubleshooting"
            content={
              <>
                <p>
                  <strong>I signed in but don't see activity yet.</strong> The runner acts only on
                  current-factory treasuries that have authorized the bounded agent and enabled
                  autonomous mode. Proof readiness, public RPC latency or a policy WAIT can also
                  result in no transaction, which is a safe outcome.
                </p>
                <p>
                  <strong>I funded the treasury but the balance isn't visible.</strong> Confirm the
                  token transfer on the block explorer and verify that the destination was the
                  treasury address, not the factory or the agent. The dashboard reads ERC-20
                  balances directly from chain.
                </p>
                <p>
                  <strong>I want another mandate.</strong> Use <em>New treasury</em>. Your current
                  account can own multiple treasuries, each with its own independent mandate,
                  balances, journal and lifecycle state.
                </p>
              </>
            }
          />
        </div>

        <div className="mt-16 border-t border-ledger-800 pt-8">
          <p className="text-xs text-ledger-500">
            Need more? Read the <Link to="/" className="text-verified-400 hover:underline">landing page</Link>,{" "}
            the{" "}
            <a
              href={`${config.explorerBaseUrl}/address/${config.factoryAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-verified-400 hover:underline"
            >
              current lifecycle factory
            </a>
            , or inspect the public protocol evidence pages.
          </p>
        </div>
      </div>
    </Layout>
  );
}

function Section({ title, content }: { title: string; content: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-ledger-100">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ledger-400">
        {content}
      </div>
    </section>
  );
}

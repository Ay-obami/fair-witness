// Plain-language help docs for non-technical users.
// Separate from docs/ (which is for developers) — this is the user-facing FAQ.
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";
import { ControlledDemoNotice } from "../components/ControlledDemoNotice";

export default function Help() {
  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-16 pb-32">
        <h1 className="text-3xl font-bold text-ledger-100">Help &amp; docs</h1>
        <p className="mt-3 text-sm leading-relaxed text-ledger-400">
          Plain-language answers to the questions we get most often. If you're looking for
          the locked technical architecture, see docs/architecture/ARCHITECTURE_LOCK.md.
        </p>
        <div className="mt-5"><ControlledDemoNotice /></div>

        <div className="mt-12 space-y-12">
          <Section
            title="What are guardrails, and why can't I change mine after I set them?"
            content={
              <>
                <p>
                  The schema-v1 mandate fixes enabled strategies, assets, venue, action size,
                  slippage, evidence/market limits, target allocation, risk exposure and rate
                  limits. They are written into your treasury contract as immutable state —
                  meaning no one can change them after deployment, including you, including
                  Fair Witness, including the AI.
                </p>
                <p>
                  This sounds restrictive, but it's the entire point: the safety guarantee is
                  only as strong as the thing enforcing it. If your owner (you) or the platform
                  could loosen the limits later, the guarantee becomes a promise that might be
                  broken under pressure. Immutable code can't be broken.
                </p>
              </>
            }
          />

          <Section
            title="What happens to the funds I deposit?"
            content={
              <>
                <p>
                  <strong>Your funds stay in your own contract.</strong> When you deposit test
                  fwUSD or fwWCTC into the controlled treasury, it goes to a contract you own — not a
                  shared pool, not a platform account. The Fair Witness agent can request trades
                  from your contract, but only if the trade fits entirely within your guardrails.
                  If it doesn't, schema-v1 policy journals the rejected attempt on-chain, and your funds
                  stay put.
                </p>
                <p>
                  No one at Fair Witness ever holds custody of your funds, not even briefly.
                  The agent submits transactions <em>to your contract</em> — it does not hold a
                  key to a wallet that contains your money.
                </p>
              </>
            }
          />

          <Section
            title="What does the 'verified' badge mean vs. a rejection/reported entry?"
            content={
              <>
                <p>
                  <strong>A "verified" execution</strong> means the AI agent submitted a trade
                  to your contract, the contract accepted it (checked the proofs, verified the
                  bounds, confirmed the math), and the trade actually happened on-chain. The
                  dashboard shows a green checkmark with a link to the transaction on the block
                  explorer — anyone can click through and confirm it themselves. This is
                  cryptographically verified truth.
                </p>
                <p>
                  <strong>A schema-v1 rejected attempt</strong> means deterministic policy refused
                  a submitted proposal. Its reason-coded attempt record is on-chain and the treasury
                  remains untouched. An AI decision to WAIT is separate off-chain decision history.
                </p>
                <p>
                  The two look visibly different — and they should. A verified execution is
                  on-chain truth that anyone can check. A rejection is the agent's honest report
                  of why it <em>didn't</em> act, and that honesty matters too, but it carries a
                  different outcome. Legacy entries are labeled separately because the older deployed
                  contract does not have the schema-v1 attempt journal.
                </p>
              </>
            }
          />

          <Section
            title="What LLM is deciding for me, and can it move my funds on its own?"
            content={
              <>
                <p>
                  The platform runs a single LLM (Gemini; OpenAI/Mistral are the tracked direction) that
                  decides <strong>whether</strong> to propose a trade — never <strong>how</strong>
                  to execute it. The actual trade is performed by your contract, which checks
                  every guardrail independently before acting. So even if the LLM makes a
                  mistake, hallucinates, or goes rogue, your contract is the final arbiter: if
                  the trade violates a single bound, the transaction reverts and nothing happens.
                </p>
                <p>
                  The LLM never holds your key. It never has custody of your funds. It can only
                  suggest an action, and your contract decides whether that action is allowed.
                </p>
              </>
            }
          />

          <Section
            title="Is this real money? (Testnet disclaimer)"
            content={
              <>
                <p>
                  <strong>Everything in the controlled demonstration uses fixed-supply TESTNET tokens
                  with no represented economic value.</strong> fwUSD and fwWCTC are independently issued
                  on each chain; they are not bridged, redeemable, collateralized, or economically pegged.
                  Do not interpret testnet outputs as profit or loss.
                </p>
                <p>
                  When (and if) Fair Witness moves to mainnet, the testnet contracts will be
                  deprecated, and you would need to re-deploy a new instance with real-value
                  guardrails from scratch. Your testnet deposit has no bearing on any real
                  deployment.
                </p>
              </>
            }
          />

          <Section
            title="Troubleshooting"
            content={
              <>
                <p>
                  <strong>I signed up but don't see any activity yet.</strong> The agent polls on
                  the schema-v1 continuous runner is not the legacy `npm start` entrypoint. Controlled
                  rehearsals follow the operator runbook and keep the treasury paused except during a
                  supervised submission. Attestcoin proof readiness can take several minutes or time out;
                  the safe result is WAIT/no submission.
                </p>
                <p>
                  <strong>I deposited funds but the deposit isn't showing up.</strong> Check the
                  block explorer for your contract address. The agent only sees funds that the
                  contract's internal accounting reflects — if the deposit transaction is
                  confirmed on-chain, the balance should appear within one polling cycle. If it
                  doesn't, verify you sent the correct controlled token to the treasury address (not the factory,
                  not the agent).
                </p>
                <p>
                  <strong>I want to change my guardrails.</strong> You can't — that's by design.
                  If your limits are too tight or too loose, you can deploy a new instance with
                  different guardrails at sign-up. Your existing instance will continue running
                  with its original bounds indefinitely.
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
              href="https://creditcoin-testnet.blockscout.com/address/0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd"
              target="_blank"
              rel="noopener noreferrer"
              className="text-verified-400 hover:underline"
            >
              factory contract
            </a>
            , or email support@fairwitness.xyz.
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

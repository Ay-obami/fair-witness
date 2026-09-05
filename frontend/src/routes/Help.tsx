// Plain-language help docs for non-technical users.
// Separate from docs/ (which is for developers) — this is the user-facing FAQ.
import { Link } from "react-router-dom";

export default function Help() {
  return (
    <div className="min-h-screen bg-ledger-950">
      <nav className="border-b border-ledger-800">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/verify" className="text-ledger-400 hover:text-verified-400 transition">Verify</Link>
            <Link to="/signup" className="text-ledger-400 hover:text-verified-400 transition">Sign up</Link>
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-3xl px-6 py-16 pb-32">
        <h1 className="text-3xl font-bold text-ledger-100">Help &amp; docs</h1>
        <p className="mt-3 text-sm leading-relaxed text-ledger-400">
          Plain-language answers to the questions we get most often. If you're looking for
          the technical whitepaper, see docs/ARCHITECTURE_V2.md.
        </p>

        <div className="mt-12 space-y-12">
          <Section
            title="What are guardrails, and why can't I change mine after I set them?"
            content={
              <>
                <p>
                  Guardrails are seven hard limits you set once, at sign-up: how big a trade
                  can be, how much slippage is tolerable, the minimum gap the AI looks for,
                  how much prices can drift, how quickly it can act again, and how many trades
                  per day. They are written into your treasury contract as immutable code —
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
                  USDC into your treasury instance, it goes to an address you control — not a
                  shared pool, not a platform account. The Fair Witness agent can request trades
                  from your contract, but only if the trade fits entirely within your guardrails.
                  If it doesn't, the contract rejects the transaction on-chain, and your funds
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
                  <strong>A "rejected" or "reported" attempt</strong> means the AI decided
                  <em>not</em> to act — perhaps the gap was too narrow, or the facts were stale,
                  or the rate limit was hit. There is no on-chain execution to verify, so these
                  rows show an amber warning icon and are clearly labeled "agent-reported." They
                  are corroborated only by the reverted transaction on-chain, not by a success.
                </p>
                <p>
                  The two look visibly different — and they should. A verified execution is
                  on-chain truth that anyone can check. A rejection is the agent's honest report
                  of why it <em>didn't</em> act, and that honesty matters too, but it carries a
                  different kind of credibility.
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
                  <strong>Everything on Fair Witness right now uses TESTNET funds with no real
                  value.</strong> The USDC you deposit is fake — it's minted freely from a public
                  faucet on the Creditcoin CC3 testnet. The trades the AI makes have no financial
                  outcome. Do not deposit or trade with the expectation of profit or loss.
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
                  a fixed interval (every 30 seconds). It only acts when a genuine arbitrage gap
                  exists between the source-chain price and the destination-chain pool — which may
                  be rare if the pools are well-balanced. If your guardrails are very tight (small
                  max drift, high min arb width), the AI may be consistently finding the gaps too
                  narrow. Try widening your guardrails slightly.
                </p>
                <p>
                  <strong>I deposited funds but the deposit isn't showing up.</strong> Check the
                  block explorer for your contract address. The agent only sees funds that the
                  contract's internal accounting reflects — if the deposit transaction is
                  confirmed on-chain, the balance should appear within one polling cycle. If it
                  doesn't, verify you sent USDC to the correct contract address (not the factory,
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
              href="https://creditcoin-testnet.blockscout.com/address/0x97c81D68BbCDb1A673b61176d60F071963Abe7f2"
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
    </div>
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

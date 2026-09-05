# Fair Witness — Plain-Language Help

This is the non-technical help section for people who signed up (or are thinking
about it). It deliberately uses no jargon: you won't find `factKey`, `decisionHash`,
or `attestation proofs` here — that lives in `ARCHITECTURE_V2.md` for the developers.

---

## What are "guardrails," and why can't I change mine after I set them?

Guardrails are seven hard limits you pick once, at sign-up:

| Guardrail | What it controls | Example |
|---|---|---|
| Max trade size | How much USDC the AI can propose per trade | 5 USDC |
| Max slippage | How much price impact is tolerable | 150 bps = 1.50% |
| Min arb width | How big the gap must be before the AI proposes a trade | 80 bps |
| Max drift | How far prices may move during the AI's reasoning window |100 bps |
| Max confirm gap | How many blocks may pass between the two proofs the AI accepts |20 blocks |
| Actions per epoch | Max trades your instance allows per epoch window |6 per day |
| Epoch length | How long one window lasts |86400 s = 24h |

They are written into your treasury contract **as immutable code**. Immutable means
unchangeable — no one can change them after deployment, including you, including us,
including the AI. That sounds restrictive, and it is, deliberately: a safety guarantee
that anyone could loosen under pressure is not a safety guarantee at all. The rigid
limits are what let the contract independently refuse a bad trade even if the AI (or an
attacker) wants it. If you later decide the limits were wrong, you deploy a new
instance with new guardrails — your old one keeps running with its original bounds.

---

## What happens to the funds I deposit?

**Your funds stay in your own contract.** Your treasury instance is a unique contract address
that only you control. When you deposit test USDC, it goes to that address — not to
a shared pool, not to us. The AI agent can *request* trades from your contract, but
the contract itself checks every trade against your immutable guardrails before
executing. If a trade would exceed any limit, the contract rejects it on-chain and your
funds stay put.

.

No one at Fair Witness ever holds custody of your funds, not even briefly. We do
not hold a key to any wallet that contains your money. The agent can only submit
transactions *to your contract* — it never *is* your contract's owner and it never
holds your assets in a wallet we control.

---

## What does the "verified" badge mean vs. a rejection/reported entry?

These look different on purpose, because they mean different things.



**A "verified" execution** — green checkmark: the AI proposed a trade, your contract
checked the proof and the bounds, and accepted it. The trade actually happened on-chain.

Anyone can click through to the block explorer and confirm it themselves. This is
cryptographically verifiable truth — you don't have to take our word (or the AI's) for it.



**A "rejected" / "reported" attempt** — amber warning icon: the AI decided *not* to
act, e.g. the gap was too narrow, the facts were stale, or the rate limit was hit. There
is no on-chain execution to verify, so these rows state plainly that they are
**agent-reported** — an honest report of why the AI didn't act, corroborated only by
the reverted transaction on-chain, not by a success. We do not dress these up as if they
were the same kind of evidence as a verified execution — that distinction is the point.

---

## What LLM is deciding for me, and can it move my funds on its own?

The platform runs one LLM (Gemini; OpenAI/Mistral are the tracked direction, and we
deliberately exclude Claude because its API lacks the seeding control we need) that
decides **whether** to
propose a trade. It never decides **how** to execute one, and it never holds your key.





The actual trade is performed by your contract, which checks every guardrail
independently before acting. Even if the LLM hallucinates, makes a mistake, or goes
rogue, your contract is the final arbiter: if the trade violates a single bound,the
transaction reverts and nothing happens. The LLM can't loosen your limits, because your
contract's code won't let anyone.



---

## Is this real money? (Testnet disclaimer)

**No. Everything on Fair Witness right now uses testnet funds with no real value.**

The USDC you deposit is fake — it's minted freely from a public faucet on the Creditcoin
CC3 testnet, and trades have no financial outcome. Do not deposit or trade with the
expectation of profit or loss.



If Fair Witness moves to mainnet later, these testnet contracts will be deprecated and
you would need to deploy a new instance with fresh guardrails. Your testnet deposit has
no bearing on any real deployment, now or later.



---

## Troubleshooting

**I signed up but don't see any activity yet.**
The agent polls every ~30 seconds, but it only *acts* when a genuine arbitrage gap
exists between the source-chain price (a demo-controlled Sepolia `PriceObservation`
contract — not a real market oracle; see the honest caveats in the README) and the
destination-chain pool. Well-balanced pools
may rarely produce a gap that clears your minimum-width guardrail. If your guardrails
are very tight, the AI may be consistently finding gaps too narrow. Try wider values.




**I deposited funds but the deposit isn't showing up.**
Check the block explorer for your contract address. The agent sees funds the contract's
internal accounting reflects — a confirmed deposit should appear within one polling cycle.

If it doesn't, double-check you sent USDC to your **contract address**, not the factory
and not the agent. (BASE_ASSET on CC3 testnet:
 `0x0bFA6eF009f8739c727b292849029608bd6b115A`, public-mint.)



**I want to change my guardrails.**
You can't — by design. Deploy a new instance with different guardrails at sign-up if
you need different bounds. Your existing instance runs forever with its originals.

---

*Still stuck? The landing page has the quick version; the technical depth lives in
[`docs/ARCHITECTURE_V2.md`](ARCHITECTURE_V2.md) and the current honest status is in
[`DEVLOG.md`](../DEVLOG.md).*

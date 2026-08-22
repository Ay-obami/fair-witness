# Project: Attested Custody-Free Arbitrage Journal

**One-liner:** An autonomous cross-chain arbitrage system where the AI agent never holds funds and never executes anything directly — it only generates cross-chain proofs. All capital sits in an ASC treasury that enforces rigid, pre-committed business logic and executes exclusively through a single, replay-safe, journaled entry point. Every fund movement is therefore both *structurally bounded* (custody separation) and *fully reconstructable after the fact* (the journal) — and the design is explicit that it targets manipulation-resistant execution, not MEV-speed execution.

---

## 1. The combined problem statement

Three failure modes, from three different root causes, that a naive "AI agent with a funded wallet, executing fast" design exposes you to simultaneously:

1. **Custody risk.** A funded agent wallet is a single point of failure — private-key compromise (phishing, leaked `.env`, malicious dependency, compromised RPC) lets an attacker drain funds through a plain transfer that never touches your carefully-designed business logic at all. This is not hypothetical; it's the dominant real-world loss pattern for early autonomous trading bots.
2. **No causal record.** Even a well-behaved agent produces no reconstructable link between "attested fact arrived" → "agent decided" → "funds moved." A compliance reviewer, or a hackathon judge, has no way to verify *why* a given trade happened beyond "the agent said so."
3. **Latency-vs-manipulation tradeoff.** Attestcoin proves a *specific past event* (a block was attested, a tx included) — it is not a live price feed. A design that pretends otherwise and tries to compete on arbitrage speed will (a) lose most windows to genuinely fast bots anyway, and (b) inherit exactly the single-block price-manipulation risk (Mango Markets, Harvest Finance, bZx-style attacks) that finality-based verification exists to close. The correct scope is: close the manipulation-resistance gap, don't chase the speed gap.

These aren't three separate features bolted together — they compose. Custody separation only makes the journal's "complete audit trail" claim *true* (there's no side channel funds could move through). The journal only matters because custody separation means the ASC's gated function is the *sole* place decisions get made and recorded. And the arbitrage-condition proof design (re-check against a second attestation, width-bounded conditions) is what keeps the whole system honest about what Attestcoin can and can't promise at this latency.

---

## 2. Architecture

```
┌─────────────────────┐        ┌──────────────────────────────────┐        ┌────────────────────────────┐
│  Source chains        │        │  Off-chain Agent Runner            │        │  Creditcoin: ASCTreasury     │
│  (Sepolia DEX A,      │  poll  │  - watches source-chain events     │ submit │  Journal contract            │
│  Creditcoin-native     │◄──────┤  - detects price gap > threshold   ├───────►│  - holds ALL treasury funds  │
│  DEX B)                │        │  - generates USC proof (ProofBuilder) │     │  - verifies proof (0x0FD2)   │
│                        │        │  - derives deterministic nonce     │        │  - enforces rigid bounds     │
│  No custody here.      │        │  - NO PRIVATE KEY TO TREASURY      │        │  - executes trade itself     │
│  Agent only reads.     │        │  - holds only a low-priv "submit"  │        │  - writes journal entry      │
└─────────────────────┘        │    key with zero fund access       │        └────────────────────────────┘
                                  └──────────────────────────────────┘
```

Key structural rule, enforced in Solidity, not just in the pitch deck: **the ASC treasury contract has no function capable of moving funds that does not go through the single journaled, verify-gated entry point.** No `owner`-only withdraw, no admin escape hatch, no second contract with transfer rights. If you can't say this sentence truthfully about your actual deployed code, the "custody-free" and "complete audit trail" claims both collapse — so build this constraint first and test it explicitly (see §6).

---

## 3. Replay-safe keying (unchanged core logic, now gating fund movement specifically)

Same two-layer key as before, now doing double duty as both the replay guard *and* the sole gate on capital movement:

- `factKey = keccak256(chainKey, blockHeight, transactionIndex)` — identifies the attested source-chain event (e.g., the DEX A price observation).
- `actionKey = keccak256(factKey, actionType, agent, decisionNonce)` — identifies this specific decision.

**Deterministic nonce derivation is now load-bearing for fund safety, not just journal hygiene.** `decisionNonce = keccak256(factKey, actionType, quotedSourcePrice, quotedDestPrice)` — derived entirely from the fact and the observed arbitrage condition, never from a timestamp or random seed. This means:
- A crashed-and-restarted agent re-deriving its decision from the same fact produces the *same* `actionKey` and gets rejected on resubmission (no double-trade).
- Two genuinely different arbitrage opportunities on the same underlying fact (unlikely here, but structurally possible if the agent also runs other strategies against the same feed) still get distinct, individually-journaled `actionKey`s.

---

## 4. Rigid business logic — the bounds that make custody separation meaningful

Custody separation is only as strong as what the ASC is willing to execute autonomously. Concrete bounds to hard-code (not agent-configurable — that's the whole point):

```solidity
uint256 public constant MAX_TRADE_SIZE = 5_000e6;      // e.g. 5,000 USDC per trade
uint256 public constant MAX_SLIPPAGE_BPS = 150;          // 1.5% max slippage tolerance
uint256 public constant MIN_ARB_WIDTH_BPS = 80;          // don't act on gaps that could be attestation-lag noise
uint256 public constant MAX_ACTIONS_PER_EPOCH = 6;        // rate limit — caps blast radius of a rogue-but-uncompromised agent
mapping(address => uint256) public whitelistedDestPair;   // only pre-approved trading pairs
```

`MIN_ARB_WIDTH_BPS` is the direct implementation of the latency-honesty point from earlier: the ASC should refuse to act on a price gap narrow enough that it's plausibly just attestation lag or normal noise rather than a real, survivable arbitrage opportunity. This is a specific, defensible number you set and justify in your docs (e.g., "attestation + proof + verification round-trip observed at ~X seconds in testing; we only act on gaps wide enough to plausibly persist that long").

---

## 5. Second-attestation re-check (the honest fix for "price at block N ≠ price now")

Rather than pretend Attestcoin gives you a live feed, make the staleness explicit and defensible:

```solidity
function executeArbitrage(
    // proof #1 — source chain price observation
    ProofData calldata sourceProof,
    // proof #2 — a SECOND, more recent attestation confirming the condition still plausibly holds
    ProofData calldata confirmProof,
    uint256 decisionNonce,
    bytes32 decisionHash
) external onlyRegisteredAgent returns (bool) {

    require(confirmProof.blockHeight > sourceProof.blockHeight, "Confirm must be newer");
    require(
        confirmProof.blockHeight - sourceProof.blockHeight <= MAX_CONFIRM_GAP_BLOCKS,
        "Confirmation too old to be meaningful"
    );

    bytes32 factKey = _factKey(sourceProof);
    bytes32 actionKey = keccak256(abi.encode(factKey, ActionType.ARBITRAGE, msg.sender, decisionNonce));
    require(!executedActions[actionKey], "Action already executed");

    bool v1 = VERIFIER.verifyAndEmit(sourceProof.chainKey, sourceProof.blockHeight, sourceProof.encodedTx,
                                       sourceProof.merkleProof, sourceProof.continuityProof);
    require(v1, "Source proof verification failed");

    bool v2 = VERIFIER.verifyAndEmit(confirmProof.chainKey, confirmProof.blockHeight, confirmProof.encodedTx,
                                       confirmProof.merkleProof, confirmProof.continuityProof);
    require(v2, "Confirmation proof verification failed");

    (uint256 srcPrice, uint256 srcStatus) = _decodePrice(sourceProof.encodedTx);
    (uint256 confPrice, uint256 confStatus) = _decodePrice(confirmProof.encodedTx);
    require(srcStatus == 1 && confStatus == 1, "Underlying tx did not succeed");

    uint256 gapBps = _bpsGap(srcPrice, confPrice);
    require(gapBps <= MAX_DRIFT_BPS, "Price drifted too much between observation and confirmation — stale, abort");

    uint256 arbWidthBps = _arbWidth(confPrice, _creditcoinDexPrice());
    require(arbWidthBps >= MIN_ARB_WIDTH_BPS, "Arbitrage window too narrow to be trustworthy");

    executedActions[actionKey] = true;

    uint256 tradeSize = _boundedTradeSize(arbWidthBps); // capped at MAX_TRADE_SIZE
    _executeTrade(tradeSize, MAX_SLIPPAGE_BPS);          // treasury moves funds HERE, and only here

    journal[actionKey] = JournalEntry({
        factKey: factKey, actionKey: actionKey,
        attestedAt: uint64(block.timestamp), actedAt: uint64(block.timestamp),
        agent: msg.sender, decisionHash: decisionHash,
        actionType: ActionType.ARBITRAGE,
        actionPayload: abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps)
    });
    journalIndex.push(actionKey);

    emit ActionJournaled(actionKey, factKey, ActionType.ARBITRAGE, msg.sender, decisionHash);
    return true;
}
```

This single function is where all three pieces actually meet: **custody** (only this function moves funds, funds never touch the agent), **journal** (every execution — and every rejected attempt, since `require` reverts are visible on-chain too — is attributable to a specific fact and decision), and **honest latency handling** (the drift check and width check are explicit, numeric, defensible claims about what "confirmed" means here, not a pretense of real-time pricing).

---

## 6. What you must actually test to make the claims true

Since the whole pitch rests on "custody-free" and "complete audit trail" being *architectural properties*, not just design intentions, your test suite (Foundry) should explicitly try to violate them:

- **Test: no function other than `executeArbitrage` can move treasury funds.** Attempt calls to any other public/external function and assert none can transfer the treasury's tokens.
- **Test: agent's registered address holds zero token balance at all times** (assert `token.balanceOf(agentAddress) == 0` invariant across a fuzzed sequence of calls).
- **Test: replayed identical proof + nonce reverts.** Submit the same `sourceProof`/`confirmProof`/`decisionNonce` twice; second call must revert on `executedActions[actionKey]`.
- **Test: crash-and-retry simulation.** Derive `decisionNonce` deterministically from fact data (per §3), submit once, simulate a "retry" by resubmitting with independently-recomputed-but-identical nonce; must revert, proving the retry-safety property, not just the naive "same calldata twice" case.
- **Test: drift/width rejection.** Construct a `confirmProof` with a price outside `MAX_DRIFT_BPS` of `sourceProof`, or an arb width under `MIN_ARB_WIDTH_BPS`; both must revert.
- **Test: rate limit.** Exceed `MAX_ACTIONS_PER_EPOCH` within an epoch; the `(N+1)`th call must revert even with a fully valid proof.

Passing these six as a visible Foundry test suite is a much stronger judging artifact than a demo video — it's you proving the claims rather than asserting them.

---

## 7. Build timeline (3–4 weeks, solo)

- **Week 1:** Deploy toy source-chain price contracts (two, to simulate DEX A / DEX B) on Sepolia. Get single-proof `verifyAndEmit()` working end-to-end via `@gluwa/usc-sdk`. Benchmark actual gas cost and actual attestation-to-verification wall-clock latency — this number directly informs your `MIN_ARB_WIDTH_BPS` and `MAX_CONFIRM_GAP_BLOCKS` constants, so measure early, don't guess.
- **Week 2:** Build `ASCTreasuryJournal.sol` — the combined contract from §5, plus the journal storage from the earlier design. Write the six invariant tests from §6 before building the agent runner (test-first keeps you honest about what the contract actually guarantees).
- **Week 3:** Off-chain agent runner: poll loop, price-gap detection, deterministic nonce derivation, proof generation via `ProofBuilder`, submission (using a low-privilege key with zero token approval/allowance — verify this in a test too). Build the replay/audit viewer (CLI or minimal frontend) that reconstructs a full decision chain from an `actionKey`.
- **Week 4:** Buffer, adversarial demo (deliberately submit a stale/manipulated/duplicate proof on stage and show it getting rejected — this is a stronger demo moment than showing the happy path), docs, gas/latency numbers written up honestly.

---

## 8. Off-chain agent runner (the "no keys to funds" side, made concrete)

This is the piece that was only described in prose so far. It's deliberately the least novel part of the system — that's a feature, not a gap: the contract is where the trust guarantees live, so the runner should be boring, deterministic, and replaceable.

```typescript
// agent-runner.ts
import { ProofBuilder, ChainInfo } from "@gluwa/usc-sdk";
import { ethers } from "ethers";

const SOURCE_CHAIN_KEY = 1; // Sepolia, per ChainInfo.getSupportedChains()
const CONFIRM_GAP_TARGET_BLOCKS = 3; // how far apart source vs confirm proofs should be

// The submit key has ZERO token approvals and ZERO balance of the traded asset.
// It exists only to pay gas for calling executeArbitrage() — verify this with
// the "agent holds zero balance" invariant test from §6, not just by assertion here.
const submitWallet = new ethers.Wallet(process.env.AGENT_SUBMIT_KEY!, provider);
const treasury = new ethers.Contract(TREASURY_ADDRESS, TREASURY_ABI, submitWallet);

interface PriceObservation {
  blockHeight: number;
  txIndex: number;
  price: bigint;
  encodedTx: string;
}

async function pollSourcePrice(): Promise<PriceObservation | null> {
  // reads a public price-emitting event on the toy Sepolia DEX contract —
  // no privileged access, this is read-only chain-watching
  const latest = await sourceChainProvider.getBlockNumber();
  const events = await sourceDexContract.queryFilter(
    sourceDexContract.filters.Swap(),
    latest - 5,
    latest
  );
  if (events.length === 0) return null;
  const ev = events[events.length - 1];
  return {
    blockHeight: ev.blockNumber,
    txIndex: ev.transactionIndex,
    price: decodePriceFromSwapEvent(ev),
    encodedTx: await getRawTx(ev.transactionHash),
  };
}

function deterministicNonce(factKey: string, actionType: number, srcPrice: bigint, destPrice: bigint): bigint {
  // MUST be pure function of the fact + observed condition — never Date.now(),
  // never Math.random(). This is what makes a crash-and-retry idempotent (§3/§6).
  return BigInt(
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint8", "uint256", "uint256"],
        [factKey, actionType, srcPrice, destPrice]
      )
    )
  );
}

async function evaluateAndAct() {
  const obs = await pollSourcePrice();
  if (!obs) return;

  const destPrice = await getCreditcoinDexPrice(); // read-only, local to Creditcoin
  const gapBps = bpsGap(obs.price, destPrice);

  if (gapBps < MIN_ARB_WIDTH_BPS_LOCAL_ESTIMATE) return; // don't even bother proving — save gas/latency

  // Build proof #1: the source price observation
  const sourceProof = await ProofBuilder.build({
    chainKey: SOURCE_CHAIN_KEY,
    blockHeight: obs.blockHeight,
    transactionIndex: obs.txIndex,
  });

  // Wait for a second, later block to be attested before building proof #2 —
  // this IS the "second independent attestation" from §5, not a formality.
  await ChainInfo.waitUntilHeightAttested(
    SOURCE_CHAIN_KEY,
    obs.blockHeight + CONFIRM_GAP_TARGET_BLOCKS,
    { timeoutMs: 15 * 60_000 }
  );
  const confirmObs = await pollSourcePrice(); // re-read current on-chain state after waiting
  const confirmProof = await ProofBuilder.build({
    chainKey: SOURCE_CHAIN_KEY,
    blockHeight: confirmObs!.blockHeight,
    transactionIndex: confirmObs!.txIndex,
  });

  const factKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint64", "uint64", "uint32"],
      [SOURCE_CHAIN_KEY, obs.blockHeight, obs.txIndex]
    )
  );
  const nonce = deterministicNonce(factKey, ACTION_TYPE_ARBITRAGE, obs.price, destPrice);

  // Pre-flight check BEFORE spending gas: has this exact actionKey already executed?
  // Catches the crash-and-restart case cheaply, off-chain, before touching the contract.
  const actionKey = computeActionKey(factKey, ACTION_TYPE_ARBITRAGE, submitWallet.address, nonce);
  if (await treasury.executedActions(actionKey)) {
    console.log(`Action ${actionKey} already executed — skipping resubmission (retry-safe).`);
    return;
  }

  const reasoning = {
    observedGapBps: gapBps,
    sourcePrice: obs.price.toString(),
    confirmPrice: confirmObs!.price.toString(),
    rule: "R-ARB-1: act if gap >= MIN_ARB_WIDTH_BPS and drift <= MAX_DRIFT_BPS",
    timestamp: new Date().toISOString(),
  };
  const decisionHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(reasoning)));
  await offChainReasoningStore.put(decisionHash, reasoning); // IPFS / simple KV — outside the ASC

  try {
    const tx = await treasury.executeArbitrage(sourceProof, confirmProof, nonce, decisionHash);
    await tx.wait();
    console.log(`Executed, actionKey=${actionKey}, tx=${tx.hash}`);
  } catch (err) {
    // Expected reverts (stale, too-narrow, rate-limited) are NOT failures of the system —
    // they're the rigid business logic working as designed. Log them distinctly from
    // unexpected errors (RPC failure, out of gas) rather than treating all catches alike.
    console.log(`Rejected by contract (expected if stale/narrow/rate-limited): ${err}`);
  }
}

setInterval(evaluateAndAct, POLL_INTERVAL_MS);
```

Three things worth calling out about this file specifically, since a judge reading your code will look for exactly these:

- **The submit wallet's separation from funds is testable, not just asserted in a comment.** Pair this file with the Foundry invariant test from §6 that asserts `token.balanceOf(agentAddress) == 0` across a fuzzed run — the code comment above is a claim, the test is the proof.
- **The pre-flight `executedActions[actionKey]` check is an optimization, not the safety mechanism.** The actual safety guarantee is the on-chain `require(!executedActions[actionKey])` inside `executeArbitrage`. The off-chain check just avoids wasting gas on a doomed resubmission — say this explicitly in your docs so it's clear the security property doesn't depend on the off-chain code being correct.
- **Expected reverts are logged as normal operation, not exceptions.** This matters for your demo: showing a stale/manipulated proof getting cleanly rejected (§7's suggested "adversarial demo" moment) should look like the system working, not the system erroring.

### Audit/replay viewer (minimal version)

A CLI is enough for the demo — don't build a frontend unless you have time left over in week 4:

```typescript
// replay.ts — given an actionKey, reconstruct the full decision chain
async function replay(actionKey: string) {
  const entry = await treasury.journal(actionKey);
  const reasoning = await offChainReasoningStore.get(entry.decisionHash);

  console.log(`Fact:     chain=${SOURCE_CHAIN_KEY} block=${entry.factKey} (verify independently on Sepolia explorer)`);
  console.log(`Decision: ${JSON.stringify(reasoning, null, 2)}`);
  console.log(`Hash check: ${ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(reasoning))) === entry.decisionHash ? "MATCH — reasoning not tampered with" : "MISMATCH — investigate"}`);
  console.log(`Action:   ${decodeActionPayload(entry.actionPayload)}`);
  console.log(`Executed: ${new Date(Number(entry.actedAt) * 1000).toISOString()} by agent ${entry.agent}`);
}
```

That hash-match line is the actual payoff of the whole `decisionHash` design — it's the moment in the demo where you prove the off-chain reasoning wasn't edited after the fact, which is the concrete answer to "why did the agent move $50k on Tuesday" from the original problem statement.

## 9. What's still honestly not solved

- **Agent-supplied inputs to the deterministic nonce are still agent-controlled.** A malicious (not just compromised) agent could in principle try to game deterministic-nonce derivation to create collisions or avoid legitimate rate-limit tracking. Custody separation caps the *damage* (bounded trade size, whitelisted pairs), but doesn't make the agent's *decision quality* trustworthy — only its *execution* trustworthy.
- **`MIN_ARB_WIDTH_BPS` and `MAX_DRIFT_BPS` are judgment calls, not proofs.** They reduce, not eliminate, the chance of acting on manipulated or stale data. State your measured latency numbers and reasoning in the docs rather than presenting the thresholds as guaranteed-safe.
- **This is not a competitive MEV/speed arbitrage system, and the docs should say so directly.** The pitch is "manipulation- and custody-resistant execution for arbitrage windows wide enough to survive attestation latency," not "fast bot." Undersell the speed, oversell the auditability and the fund-safety guarantees — that's the actually-true, actually-defensible claim.

# Attestcoin Protocol Integration

Fair Witness uses the Attestcoin Protocol as a **security-critical cross-chain evidence layer**, not as an auxiliary data feed.

The system observes market state on Ethereum Sepolia, obtains Attestcoin proofs for the source transactions, verifies those proofs on Creditcoin, semantically validates what the proven transactions mean, and only then allows deterministic treasury policy to consider an action.

> **AI proposes. Deterministic policy authorizes. Treasury executes.**
>
> Attestcoin is what makes the cross-chain facts entering that authorization path independently verifiable on Creditcoin.

## 1. Integration at a glance

```text
Ethereum Sepolia controlled V3 market
        |
        | observation transaction
        v
EthereumV3MarketObserver
        |
        | source + confirmation tx hashes
        v
@gluwa/usc-sdk / Attestcoin proof builder
        |
        | Merkle + continuity proofs
        v
Fair Witness agent
        |
        | typed proposal + proofs
        v
Creditcoin FairWitnessTreasury
        |
        +--> VerifiedMarketFactValidator
        |      |
        |      +--> BlockProver precompile 0x...0FD2
        |      +--> ChainInfo precompile   0x...0FD3
        |      +--> semantic transaction/event validation
        |
        +--> deterministic policy
               |
               +--> reject with reason code
               or
               +--> bounded Penguin V3 execution
```

The current source chain is Ethereum Sepolia (`chainId 11155111`) with Attestcoin chain key `1`. The destination is Creditcoin testnet (`chainId 102031`). Current addresses are maintained in `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`.

## 2. Source market facts

Fair Witness does not ask Attestcoin to prove an arbitrary web/API value. A dedicated source-chain observer publishes a transaction that captures the controlled V3 market state used by the demo.

Current source configuration:

| Item | Value |
|---|---|
| Source chain | Ethereum Sepolia |
| Source chain ID | `11155111` |
| Attestcoin chain key | `1` |
| Market observer | `0x9bAF94da27d5C71c42b40D25b43070083DE7296E` |
| Source V3 pool | `0xB88deB0436eAD37A6Dd625e9140AE45D5024424f` |

The observer/pool identity is frozen into the Creditcoin-side validator. This prevents a valid proof for an unrelated source transaction from being treated as a valid Fair Witness market fact.

## 3. Attestcoin SDK usage in the agent

The agent integrates `@gluwa/usc-sdk` through `agent/src/attestcoinClient.ts`.

It uses three SDK surfaces:

1. `proofProvider.service.ProofBuilder` - obtains the proof package for a source-chain transaction.
2. `blockProver.PrecompileBlockProver` - performs a read-only verification pre-check against Creditcoin.
3. `chainInfo.PrecompileChainInfoProvider` - confirms that the source chain is supported and waits for the relevant height to become attested.

The runtime does not treat proof-builder availability as equivalent to on-chain attestation. Before building/submitting a proof, it waits for both:

```ts
await proofBuilder.waitUntilHeightAttested(chainKey, height)
await chainInfoProvider.waitUntilHeightAttested(chainKey, height)
```

This is intentional because a proof-builder cache can lag or disagree temporarily with the authoritative on-chain attestation state.

Proof construction returns the fields required by the Creditcoin verifier:

```ts
{
  chainKey,
  blockHeight,
  transactionIndex,
  encodedTransaction,
  merkleProof,
  continuityProof
}
```

The agent may call `verifySingle(...)` as a gas-saving pre-check, but that result is **not** the security boundary. Final authorization depends on the Creditcoin contract verifying the proof again.

## 4. Dual-proof model: source + confirmation

Fair Witness deliberately uses two Attestcoin-backed source observations:

- a **source observation**;
- a later **confirmation observation**.

The validator requires the confirmation block to be newer and within a configured maximum gap. It also compares the confirmation proof to the current Attestcoin height so that two mutually consistent but very old proofs cannot pass freshness checks.

Current controlled-demo oracle parameters include:

- maximum proof age: 64 source-chain blocks;
- maximum source-to-confirmation gap: 12 blocks;
- destination TWAP window: 300 seconds;
- minimum V3 observation cardinality: 16.

The dual-proof model is one layer of the defense. It does not replace destination-market TWAP/liquidity checks or treasury policy.

## 5. On-chain verification on Creditcoin

`contracts/src/VerifiedMarketFactValidator.sol` is the core Attestcoin enforcement boundary.

For each source/confirmation pair it:

1. verifies both proofs use the immutable supported source-chain key;
2. requires the confirmation height to be newer;
3. enforces the maximum confirmation gap;
4. reads the latest attested height from the Creditcoin ChainInfo precompile;
5. rejects proofs above that height;
6. rejects evidence that is too old relative to the latest attestation;
7. calls the BlockProver precompile to verify and emit both proof results;
8. recomputes the Merkle transaction index and requires it to match the submitted index;
9. semantically decodes the proven source transactions;
10. returns a typed verified observation to treasury policy.

The deployed precompile addresses used by the controlled schema-v1 generation are:

| Precompile | Address |
|---|---|
| Attestcoin BlockProver | `0x0000000000000000000000000000000000000FD2` |
| Attestcoin ChainInfo | `0x0000000000000000000000000000000000000FD3` |

## 6. Why semantic validation matters

A cryptographic inclusion proof answers the question:

> "Was this transaction included in the attested source chain?"

Fair Witness also needs to answer:

> "Does this transaction mean the market fact our policy expects?"

`AttestedMarketEventDecoder` therefore binds the proven transaction to the expected observer and source pool and validates the expected receipt/event semantics before the result can become policy input.

This distinction is important. Attestcoin proves cross-chain inclusion/continuity; Fair Witness supplies application-specific semantics.

A proof for an unrelated transaction, a reverted transaction, the wrong observer, or the wrong market must not become authorization merely because the Merkle proof itself is valid.

## 7. From verified fact to AI decision

Once source facts are verified/assembled, deterministic code derives a candidate for one of the enabled strategies:

```text
Risk Reduction -> Rebalancing -> Arbitrage
```

The AI reasoning layer receives the candidate and can return only:

```text
EXECUTE
or
WAIT
```

It cannot choose arbitrary execution terms such as recipient, target contract, calldata, route, token pair, venue, or amount.

If the model selects `EXECUTE`, the proposal builder creates a schema-v1 proposal from deterministic candidate and mandate data. The proposal commits to `evidenceHash`, `observationHash`, `decisionHash`, and `policyHash`.

The treasury then re-verifies the Attestcoin evidence and independently recomputes the relevant policy conditions before any approval or token movement occurs.

## 8. Failure behavior

Attestcoin is deliberately fail-closed in the execution path.

Examples that prevent authorization include:

- unsupported source chain;
- proof-builder failure;
- source height not yet attested;
- proof above latest attested height;
- stale proof;
- invalid Merkle/continuity proof;
- source/confirmation ordering failure;
- excessive confirmation gap;
- transaction-index mismatch;
- semantic observer/pool/event mismatch.

A proof API saying "success" is never enough to move treasury assets.

## 9. Public-testnet evidence

The controlled demo uses synthetic market conditions because no sufficiently active comparable market existed across the supported public testnets. The cross-chain proof and Creditcoin verification path is nevertheless real.

One recorded valid path in `contracts/deployments/controlled-demo-schema-v1.json` is `VALID_ATTESTCOIN_RISK_REDUCTION`:

| Evidence | Value |
|---|---|
| Source observation tx | `0x1c0e67ad9621ec5d23f061d330e1b7b41d69c66646a97358e1be09dfe42e408f` |
| Confirmation observation tx | `0xf87e562164ca1f23dea01df67b0f907cd36f9e2b25d49f99133a74f43a906cbb` |
| Source block | `11667084` |
| Confirmation block | `11667085` |
| Creditcoin execution tx | `0x05b04421472d9318e297b255ad233d974839518e88d6f7ee981d64d4ec3e58a4` |
| Treasury attempt | `2` |

The historical evidence manifest also preserves controlled Arbitrage, Rebalancing, Risk Reduction, rejection, deployment, and market-setup receipts for independent inspection.

## 10. What Attestcoin does and does not prove

### Attestcoin provides

- decentralized cross-chain transaction inclusion/continuity evidence;
- a Creditcoin-native verification surface;
- an attested source-chain height model;
- cryptographic evidence that Fair Witness can bind into deterministic policy.

### Attestcoin does not by itself prove

- that two independently issued test tokens are economically equivalent;
- bridge availability or redemption;
- natural arbitrage;
- profitability;
- future destination execution price;
- that a transaction has the application-specific meaning Fair Witness expects.

Those boundaries are why Fair Witness combines Attestcoin verification with semantic decoding, destination-market checks, replay protection, deterministic policy, and a constrained execution adapter.

## 11. Why the integration is core to Fair Witness

Without Attestcoin, the cross-chain observation would have to be trusted because an API, server, or agent claimed it was true. That would undermine the product's central security model.

With Attestcoin, the source-chain evidence entering Creditcoin is independently verifiable and can be consumed by the treasury without granting the AI, agent host, database, or centralized oracle operator authority over the fact itself.

That is the core Fair Witness proposition:

> **Autonomous AI can reason over cross-chain information without becoming the authority that defines either the facts or the transaction.**

## Related implementation references

- `agent/src/attestcoinClient.ts`
- `contracts/src/VerifiedMarketFactValidator.sol`
- `contracts/src/libraries/AttestedMarketEventDecoder.sol`
- `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`
- `contracts/deployments/controlled-demo-schema-v1.json`
- `docs/ARCHITECTURE.md`
- `docs/architecture/SECURITY_MODEL.md`
- `docs/architecture/POLICY_MODEL.md`
- `docs/CONTROLLED_DEMO_RUNBOOK.md`

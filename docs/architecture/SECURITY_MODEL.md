# Security Model and Threat Analysis

## Fundamental rule

**AI proposes. Deterministic policy authorizes. Treasury executes.**

The AI, its prompt, model provider, agent host, database, public RPCs, and proposal submit key are untrusted or compromiseable. Safety must hold when the AI is malicious, wrong, stale, oversized, replaying data, or attempting unauthorized terms.

## Assets and trust boundaries

Protected assets:

- WCTC and stable balances in each tenant treasury;
- integrity of immutable mandate and replay/rate state;
- correct relationship between evidence, decision, policy result, and execution;
- audit record integrity.

Trusted for enforcement:

- deployed treasury bytecode and immutable configuration;
- Creditcoin consensus/EVM;
- Attestcoin BlockProver/ChainInfo behavior;
- exact source observer/pool semantics frozen in the validator;
- exact PenguinSwap router/factory/pool/token tuple frozen in the adapter;
- ERC-20 behavior of the selected assets.

Not trusted for authorization:

- AI output or reasoning;
- agent-side calculations and preflight checks;
- proof-builder/API success flags without on-chain verification;
- Supabase contents or RLS;
- frontend validation;
- caller-supplied hashes, prices, metrics, or labels;
- a registered agent merely because it is registered.

## Mandatory invariants

1. Treasury funds never enter the agent EOA.
2. No AI-accessible function can select an arbitrary target, route, recipient, token, selector, or calldata.
3. An exact token approval is created only after policy approval and is cleared after execution; a rejected attempt creates no approval.
4. The adapter output recipient is always the calling treasury.
5. Every executed action uses the exact immutable pair, venue, fee tier, and pool.
6. Source facts are accepted only after Attestcoin proof verification and semantic event validation.
7. Proof freshness is absolute relative to current Attestcoin height, not just relative between two old proofs.
8. Deterministic policy recomputes direction, valuation, allocation/exposure, amount cap, edge, slippage, and replay state.
9. A registered malicious proposer cannot exceed any universal or strategy bound.
10. A policy rejection leaves treasury balances, approvals, execution replay key, execution count, and daily risk usage unchanged.
11. A successful execution produces exactly one linked attempt/execution record.
12. A strategy/evidence pair can execute at most once per treasury.
13. Supabase loss, corruption, or compromise cannot move capital or change on-chain policy.
14. Owner exit is allowed only for configured assets, to the owner, and is journaled.

## Threats and controls

| Threat | Required control |
|---|---|
| AI asks for $7,000 when cap is $1,000 | Recompute permitted value; reject `AMOUNT_EXCEEDS_POLICY`; journal; no approval. |
| AI changes token or venue | Exact equality to immutable adapter/pair; reject and journal. |
| AI supplies arbitrary calldata | Proposal ABI has no calldata/target/recipient field. |
| Stale but valid proof | Validator compares confirmation height to current Attestcoin height. |
| Forged transaction index | Validator compares full-width calculated Merkle index. |
| Valid proof of irrelevant/reverted transaction | Decoder enforces destination observer, receipt success, exact event emitter/topic/window/pool and recomputed value. |
| Two old proofs close to each other | Absolute freshness plus confirmation gap/order. |
| Destination spot manipulation | Use TWAP and bound spot/TWAP deviation and minimum liquidity. |
| Wrong economic direction | Policy derives direction from verified/reference and portfolio state. |
| Exact replay | Proposal processed map + nonce; reason-coded replay attempt. |
| Changed nonce/agent/amount on same fact | Strategy-scoped evidence execution key. |
| Cross-strategy use of evidence | Allowed once per strategy; each branch independently evaluates eligibility. |
| Agent key theft | Attacker still cannot bypass policy; owner can deregister; attempt cap contains storage/gas grief. |
| Database says evidence is verified | Ignored by treasury; only validator result controls policy. |
| Database reasoning edited | Decision hash mismatch is surfaced; it cannot affect execution retroactively. |
| Strategy race on stale balances | Fixed priority, one submission per cycle, fresh on-chain policy reads, snapshot invalidation after execution. |
| Malicious/fee-on-transfer token | Adapter exact-transfer and output postconditions; immutable supported token provenance. |
| Adapter/router failure | Atomic rollback; do not sacrifice asset/replay atomicity to journal a low-level failure. |
| Owner loses access or needs funds | Constrained owner exit to owner for allowed assets; journal event. |
| Registered agent journal spam | Per-epoch attempt cap; unauthorized callers are rejected before storage. |

## Rejection persistence caveat

An EVM revert erases emitted events and state. Therefore ordinary policy failures from registered agents must be represented as successful transactions whose business result is `REJECTED`; they return a code and never enter the asset-moving path. Invalid evidence and recoverable external-read errors must be caught.

Some failures necessarily revert before a record can be admitted: malformed ABI calldata, unauthorized caller, attempt-cap exhaustion, out-of-gas, and unexpected invariant failure. Those are visible in transaction receipts but are not falsely described as complete journal records.

## Custody roles

- Treasury contract: sole holder and policy-gated mover of strategy capital.
- Treasury owner: configures mandate at deployment, manages submitter allowlist/mode, and can exit allowed assets only to self.
- Agent submit EOA: pays gas and submits typed proposals; should hold no strategy tokens and no owner key.
- AI/model provider: no key and no direct contract access.
- Indexer/backend: read/project chain and persist artifacts; service credentials have no treasury authority.

## Attestcoin claim boundary

Attestcoin proves inclusion and continuity for a source-chain transaction. Semantic decoder logic makes that transaction meaningful by binding it to a specific observer and market event. Attestcoin does not prove economic profitability, token equivalence across chains, bridge availability, or future execution price. These are separate assumptions/checks and must be stated honestly.

## Deployment security gates

Before broadcast, verify chain IDs, bytecode, constructor arguments, observer/pool/token identity, Attestcoin supported chain key, proof-age settings, pool cardinality/history/liquidity, asset decimals, adapter provenance, owner/agent separation, protocol ceilings, funding amounts, and expected post-state. Save transaction receipts and independently read every immutable.

No contract is called “deployed,” “live,” or “Attestcoin integrated” merely because local tests pass.

## Residual risks

- Testnet venue liquidity and oracle history may be thin/manipulable.
- Stable test token may not maintain economic parity.
- Model availability affects liveness, not policy safety.
- A compromised registered agent can cause bounded gas/storage use and deny service until deregistered.
- Immutable-policy errors require migration to a new treasury.
- Source/destination asset economic identity is unresolved for the desired independent Sepolia WCTC market.
- The contract cannot guarantee an end-to-end two-leg profitable cross-chain arbitrage cycle from a single destination swap.

These risks constrain claims; they do not justify weakening controls.

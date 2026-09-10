# Proof identity regression and fix — 2026-09-08

Status: local regression reproduced; source fix implemented; targeted and full contract regressions pass.
This is a focused security correction discovered during Phase 1 reassessment, not
completion of Phase 1 or a market architecture change.

## Reproduction

Command: `forge test --root contracts --match-contract ProofIdentityTest -vv`.
Before the fix: exit 1, one failed test: `next call did not revert as expected`.
After one successful execution, changing only sourceProof.transactionIndex from 0
 to 1 allowed another execution with identical chain key, block, encoded transaction,
Merkle proof, continuity proof, nonce, decision hash and direction. The regression
asserts the hash of all verifier inputs is unchanged before the second call.

This proves the treasury policy defect with the disclosed mock verifier. It is not
a claim of an exploit executed against deployed funds or a real cryptographic proof.

## Root cause and correction

_factKey used the submitted transactionIndex. verifyAndEmit does not accept that
metadata argument; its Merkle proof determines the actual position. The index was
not compared with that position, so an attacker could change action identity without
changing the verified evidence.

After both proofs verify, treasury now compares both submitted indices with
VERIFIER.calculateTxIndex applied to the exact same Merkle proofs. Mismatch reverts
with TransactionIndexMismatch before swapping or recording journal state. Comparison
uses uint64, so indices outside the uint32 metadata range cannot match by truncation.
Action-key/fact-key formulas, tenant isolation, guardrails and proof verification
remain intact. No constructor, entrypoint or journal-field changes were made.

The verifier interface adds calculateTxIndex(MerkleProof) returning uint64, matching
installed @gluwa/usc-sdk 0.18.0 ABI. The mock implements the observed path-bit
convention only; it still does not validate real cryptographic proofs.

## Live semantic evidence (read-only)

[evidence/proof-index-semantics.json](evidence/proof-index-semantics.json) records
chainId 102031 and calls to 0x0000000000000000000000000000000000000FD2 pinned at
block 0x53245e. Results for isLeft sibling vectors:

| Vector | Returned index |
| --- | --- |
| empty | 0 |
| false | 0 |
| true | 1 |
| true, false | 1 |
| false, true | 2 |
| true, false, true | 5 |
| 33 true values | 8589934591 |

These are synthetic index-calculation probes, not proof verification. No wallet,
private key, transaction submission, deployment or state change was used.

## Regression coverage

ProofIdentity.t.sol adds five tests:

- Same verified inputs plus changed source index cannot execute twice; balances and
  journal length are unchanged after rejection.
- Fuzzed forged source indices reject.
- Fuzzed forged confirmation indices reject.
- Matching source/confirmation path indices execute, journal correctly and exact
  replay still rejects even with changed nonce/reasoning hash.
- A proof-derived index wider than uint32 rejects rather than truncating.

Initial post-fix targeted run: five passed, including three fuzz tests at 256 runs
per test. Full contract regression now passes: 43/43. Agent/frontend baselines remain
41/41 and frontend build PASS from the prior checkpoint; no client ABI build was run
in this continuation.

## Compatibility and remaining limits

New builds require calculateTxIndex on the configured verifier. It was read-queried
on the actual testnet precompile, but full live proof/execution integration of this
build is NOT VERIFIED. Existing deployed instances are unchanged and cannot be
claimed fixed. Two read-only precompile calls are added for successful execution;
full live gas impact is not measured.

Phase 1 still lacks comparable source/destination market assets. Expected-source-chain
binding, absolute freshness and real swap decoding remain separate unresolved work;
this patch does not claim to fix those. No security requirement was relaxed.

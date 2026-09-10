# Phase 3 — Attestcoin Hardening

> **QUALIFIED FOR CURRENT TARGET (2026-09-08):** Proof-index/decoder/ABI hardening
> remains reusable, but the key-3/mainnet freshness configuration does not prove the
> selected Sepolia key-1 path. Phase 1 is reopened; see
> SEPOLIA-ONLY-REASSESSMENT.md.

Date: 2026-09-08
Status: COMPLETE — local and read-only checkpoint

## Implemented and verified

- Compared `INativeQueryVerifier` and `INativeChainInfo` against the installed
  official USC SDK v0.18 ABI. Exact selectors and ABI hashes are recorded in
  `evidence/phase3-precompile-abi.json`.
- Re-queried Creditcoin testnet read-only: chain ID 102031; BlockProver
  `calculateTxIndex` responds at `0x...0FD2`; ChainInfo latest-attestation
  responds at `0x...0FD3`.
- Re-measured Ethereum attestation lag at 39 blocks, inside the frozen 64-block
  absolute-age bound at this checkpoint.
- Migrated the new-path proof index end-to-end in Solidity from uint32 to uint64 and
  proved preservation of an index with bit 40 set.
- Added arbitrary malformed-envelope fuzz rejection, uint64 forged-index fuzz
  rejection, wrong log emitter, zero logged liquidity, same-height confirmation,
  exact freshness/gap boundary, and unverified-confirmation tests.
- Hardened arithmetic-mean tick narrowing against malformed pool return data.

## Tests

- Full Foundry suite: 76 passed, 0 failed.
- Receipt decoder: 12 tests, including 256 fuzz runs.
- Proof/freshness validator: 13 tests, including 256 fuzz runs.
- Phase 2 checkpoint remains green: agent 42/42 + build; frontend build passes.

## Evidence boundary

- Live calls were read-only. No proof-verification transaction was sent.
- A real proof generated for a deployed market observer remains NOT VERIFIED and is
  required in Phase 10.
- The 64-block value remains suitable for the measured 39-block lag, but must be
  re-measured before immutable deployment.
- The validator has no fund-moving authority and does not itself implement replay;
  the future treasury consumes verified facts and owns action uniqueness.

PHASE 3 COMPLETE

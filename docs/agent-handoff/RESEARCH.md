# Research Agenda — Phase 1 gate questions

Phase 0 established *what is*. Phase 1 must establish *what is real* before the
architecture freeze. Each item lists the question, current status, and the evidence
path to close it. Nothing below may be asserted from docs alone — every "yes" needs
an on-chain or primary-source proof recorded back into these handoff files.

## R1. Is there a real PenguinSwap (or better) venue on Creditcoin testnet?

- Status: **UNVERIFIED**. PenguinSwap references exist only in historical docs
  (PRD, DEVLOG); DEVLOG session 7 says the testnet DEX had no usable USDC/WCTC pool
  as of late August. `docs/DEPLOYMENT.md` explicitly defers "confirm PenguinSwap's
  real router address and ABI".
- Evidence path: search Blockscout for verified contracts + token lists; query
  known router ABIs (`getAmountsOut`-style selectors) by `eth_call`; check liquidity
  pools via factory `PairCreated`-style events; document router address + exact ABI
  + pool addresses + reserves, or record the negative result.
- Decision riding on it: replacement for `DEX_ROUTER` in new deployments (or a
  documented fallback per PRD §12 with claims scoped to mock-venue mechanics).

## R2. Real token pair + faucet story on Creditcoin testnet

- Status: **UNVERIFIED**. Mock USDC/MQT have public `mint` (VERIFIED in bytecode).
- Evidence path: find real-ish stablecoin/wrapped-native tokens on testnet (Blockscout
  token list), their holders/faucets, and whether a USDC↔WCTC-style pool with real
  depth exists. Record decimals — the contract assumes 6-decimal BASE (`getQuote`
  uses `1e6`).

## R3. Attestcoin flow — full specification, not just the happy path

- Status: happy path **VERIFIED indirectly** (7 live executions succeeded through
  precompile `0x…0FD2` with real prover proofs). Remaining: exact `verify()` selector
  set + revert taxonomy from the real precompile (bogus selector reverts
  `"Unknown selector"` — VERIFIED live), supported chain keys (`SOURCE_CHAIN_KEY=1`
  documented from `PrecompileChainInfoProvider.getSupportedChains()` — UNVERIFIED),
  proof size/latency limits of `prover.cc3-testnet.creditcoin.network`.
- Evidence path: re-run `PrecompileChainInfoProvider` live; capture the precompile's
  selector table by probing; read `@gluwa/usc-sdk` source (npm-pack verified in
  session history); document gas costs of verify from the Sep 2–3 txs.

## R4. Real Sepolia source market (architecture-freeze input)

- Status: current source is the permissionless `PriceObservation` (STOP 3). Options:
  (a) keep it, add writer restriction + attest real txs of our own writes;
  (b) attest a *real* Sepolia market event (Uniswap V2/Sushi swap, Chainlink
  price-feed `AnswerUpdated`) — `sepoliaWatcher`/`attestcoinClient` would need a new
  event decoder; (c) hybrid.
- Evidence path: verify a concrete Uniswap V2 pair + a Chainlink feed exist on
  Sepolia with observable events; measure prover cost/latency for a real swap tx.

## R5. Cross-chain messaging reality

- Status: the design has **no bridge/messaging** — it re-verifies source facts on the
  destination via the precompile (stateless). Confirm no hidden dependency on
  Hyperlane/Wormhole-style messaging in any phase plan; if a future phase adds
  messaging, document the trust change explicitly.

## R6. Gas + economics on Creditcoin testnet

- Status: gas price observed 500,000,000 (500 gwei) in Sep-1 deploy txs (Blockscout).
  Execution gas for the 7 live trades not yet extracted.
- Evidence path: read receipts of the 7 execution txs (`eth_getTransactionReceipt`);
  compute verify+swap+journal cost; feed the guardrail defaults if needed.

## R7. Judge-facing claims inventory

- Produce the list of claims the submission will make, each with its VERIFIED
  evidence pointer (DEPLOYMENTS.md/CURRENT_STATE.md). Anything unprovable becomes
  "designed, UNVERIFIED" — never asserted.

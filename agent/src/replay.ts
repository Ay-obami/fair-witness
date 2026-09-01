import { ethers } from "ethers";
import { config } from "./config.js";
import treasuryAbi from "./abi/ASCTreasuryJournal.json" with { type: "json" };
import { ReasoningStore } from "./reasoningStore.js";

/**
 * Usage: npm run replay -- <actionKey>
 *
 * Reconstructs the full attestation -> decision -> action chain for a given actionKey,
 * per PRD FR7. The hash-match line is the actual payoff of the whole decisionHash design
 * — see DESIGN.md "Audit/replay viewer" for why.
 */
async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error("Usage: npm run replay -- <actionKey>");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const treasury = new ethers.Contract(config.treasuryAddress, treasuryAbi.abi, provider);
  const reasoningStore = new ReasoningStore();

  const entry = await treasury.getJournalEntry(key);

  if (entry.actedAt === 0n) {
    console.log(`No journal entry found for actionKey ${key}`);
    return;
  }

  console.log("=== Fair Witness — Replay ===\n");
  console.log(`actionKey:   ${key}`);
  console.log(`factKey:     ${entry.factKey}`);
  console.log(`  -> independently verifiable on the Sepolia explorer for the source tx`);
  console.log(`agent:       ${entry.agent}`);
  console.log(`actionType:  ${entry.actionType}`);
  console.log(`attestedAt:  ${new Date(Number(entry.attestedAt) * 1000).toISOString()}`);
  console.log(`actedAt:     ${new Date(Number(entry.actedAt) * 1000).toISOString()}`);
  console.log(`decisionHash:${entry.decisionHash}`);

  const reasoning = await reasoningStore.get(entry.decisionHash);
  if (!reasoning) {
    console.log("\n⚠️  No off-chain reasoning found locally for this decisionHash.");
    console.log("    (In production this would be fetched from wherever the agent published it —");
    console.log("     IPFS, a shared DB, etc. This demo uses a local file store; see reasoningStore.ts.)");
  } else {
    console.log("\n--- Off-chain reasoning payload ---");
    console.log(JSON.stringify(reasoning, null, 2));

    const matches = reasoningStore.verifyHash(reasoning, entry.decisionHash);
    console.log(
      matches
        ? "\n✅ HASH MATCH — this reasoning has not been tampered with since the on-chain commitment."
        : "\n❌ HASH MISMATCH — investigate. The retrieved reasoning does not match what was committed on-chain."
    );
  }

  try {
    const [tradeSize, srcPrice, confPrice, arbWidthBps, amountOut] = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint256", "uint256", "uint256", "uint256", "uint256"],
      entry.actionPayload
    );
    console.log("\n--- Action payload ---");
    console.log(`tradeSize:   ${tradeSize} (base asset, 6 decimals)`);
    console.log(`srcPrice:    ${srcPrice}`);
    console.log(`confPrice:   ${confPrice}`);
    console.log(`arbWidthBps: ${arbWidthBps}`);
    console.log(`amountOut:   ${amountOut} (quote asset received)`);
  } catch {
    console.log("\n(actionPayload could not be decoded as a successful ARBITRAGE action)");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

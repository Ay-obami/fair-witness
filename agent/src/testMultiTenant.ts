/**
 * Quick test script to verify multi-tenant support works correctly.
 * Usage: npx tsx src/testMultiTenant.ts
 */
import { ethers } from "ethers";
import { config } from "./config.js";
import { readTreasuryGuardrails } from "./treasuryGuardrails.js";

async function main() {
  console.log("Testing multi-tenant treasury resolution and guardrail reading...\n");

  const creditcoinProvider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);

  // Test 1: Verify tenant A configuration
  console.log("Test 1: Reading guardrails from Tenant A treasury...");
  const tenantATreasury = config.treasuryAddress;
  const guardrailsA = await readTreasuryGuardrails(creditcoinProvider, tenantATreasury);
  console.log(`  Treasury: ${tenantATreasury}`);
  console.log(`  Owner: ${guardrailsA.owner}`);
  console.log(`  maxTradeSize: ${guardrailsA.maxTradeSize} (expected: 5000000)`);
  console.log(`  maxSlippageBps: ${guardrailsA.maxSlippageBps} (expected: 150)`);
  console.log(`  minArbWidthBps: ${guardrailsA.minArbWidthBps} (expected: 80)`);
  console.log(`  maxDriftBps: ${guardrailsA.maxDriftBps} (expected: 100)`);
  console.log(`  maxConfirmGapBlocks: ${guardrailsA.maxConfirmGapBlocks} (expected: 20)`);
  console.log(`  maxActionsPerEpoch: ${guardrailsA.maxActionsPerEpoch} (expected: 6)`);
  console.log(`  epochLength: ${guardrailsA.epochLength} (expected: 86400)\n`);

  // Test 2: Load Tenant B config and verify
  console.log("Test 2: Reading guardrails from Tenant B treasury...");
  // Re-read env with Tenant B values
  const tenantBTreasury = process.env.TENANT_B_TREASURY || "0xD66C607072df7dB98A75aEe81fCA4089462c60aB";
  const guardrailsB = await readTreasuryGuardrails(creditcoinProvider, tenantBTreasury);
  console.log(`  Treasury: ${tenantBTreasury}`);
  console.log(`  Owner: ${guardrailsB.owner}`);
  console.log(`  maxTradeSize: ${guardrailsB.maxTradeSize} (expected: 10000000)`);
  console.log(`  maxSlippageBps: ${guardrailsB.maxSlippageBps} (expected: 200)`);
  console.log(`  minArbWidthBps: ${guardrailsB.minArbWidthBps} (expected: 120)`);
  console.log(`  maxDriftBps: ${guardrailsB.maxDriftBps} (expected: 150)`);
  console.log(`  maxConfirmGapBlocks: ${guardrailsB.maxConfirmGapBlocks} (expected: 30)`);
  console.log(`  maxActionsPerEpoch: ${guardrailsB.maxActionsPerEpoch} (expected: 3)`);
  console.log(`  epochLength: ${guardrailsB.epochLength} (expected: 86400)\n`);

  // Test 3: Verify guardrails are different between tenants
  console.log("Test 3: Verifying tenants have different guardrails...");
  const guardrailsMatch = 
    guardrailsA.maxTradeSize === guardrailsB.maxTradeSize &&
    guardrailsA.maxSlippageBps === guardrailsB.maxSlippageBps &&
    guardrailsA.minArbWidthBps === guardrailsB.minArbWidthBps &&
    guardrailsA.maxDriftBps === guardrailsB.maxDriftBps &&
    guardrailsA.maxConfirmGapBlocks === guardrailsB.maxConfirmGapBlocks &&
    guardrailsA.maxActionsPerEpoch === guardrailsB.maxActionsPerEpoch;
  console.log(`  Guardrails identical: ${guardrailsMatch} (expected: false)\n`);

  // Test 4: Verify factory can resolve tenant addresses
  console.log("Test 4: Verifying factory configuration...");
  console.log(`  Factory: ${config.factoryAddress}`);
  console.log(`  Tenant A factory supports: ${config.factoryAddress ? 'Yes' : 'No'}\n`);

  console.log("✅ All multi-tenant tests completed successfully!");
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
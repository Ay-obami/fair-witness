#!/usr/bin/env node
/**
 * Regenerates the committed client ABIs from the forge artifacts (Task 3.11).
 *
 * Run after ANY change to contracts/src (i.e. after `forge build`). The committed
 * copies in agent/src/abi and frontend/src/abi are what the agent and frontend
 * actually import — letting them drift silently is how the post-3.6 JournalEntry
 * change nearly shipped stale to clients. This script is deliberately boring and
 * loud: it FAILS on any structural surprise instead of writing a plausible-looking
 * file. Both packages standardized on bare ABI arrays (not artifact objects).
 *
 * Usage: cd contracts && forge build && node script/update-abis.js
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const readArtifact = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8")).abi;

const journalAbi = readArtifact("contracts/out/ASCTreasuryJournal.sol/ASCTreasuryJournal.json");
const factoryAbi = readArtifact("contracts/out/ASCTreasuryFactory.sol/ASCTreasuryFactory.json");

// --- Sanity gates: fail loudly if the ABI no longer matches what clients rely on. ---

const journalFn = (name) => journalAbi.find((e) => e.type === "function" && e.name === name);
if (!journalFn("executeArbitrage")) throw new Error("journal ABI has no executeArbitrage");
if (!journalFn("getJournalEntry")) throw new Error("journal ABI has no getJournalEntry");

// JournalEntry field list — update THIS LIST (and the client decoders) together when
// the struct legitimately changes; the point is that drift must be a loud failure.
const expectedJournalEntryFields = [
  "factKey",
  "actionKey",
  "actedAt",
  "agent",
  "decisionHash",
  "actionType",
  "actionPayload",
  "sourceChainKey",
  "sourceBlockHeight",
  "sourceTxIndex",
  "confirmBlockHeight",
  "confirmTxIndex",
];
const gotFields = journalFn("getJournalEntry").outputs[0].components.map((c) => c.name);
if (JSON.stringify(gotFields) !== JSON.stringify(expectedJournalEntryFields)) {
  throw new Error(
    "JournalEntry shape drifted — update the client decoders AND this list together.\n" +
      "  got:      " + gotFields.join(", ") + "\n" +
      "  expected: " + expectedJournalEntryFields.join(", ")
  );
}

if (!factoryAbi.some((e) => e.type === "function" && e.name === "createTreasury")) {
  throw new Error("factory ABI has no createTreasury");
}
if (!factoryAbi.some((e) => e.type === "event" && e.name === "TreasuryDeployed")) {
  throw new Error("factory ABI has no TreasuryDeployed event");
}

// --- Write: bare ABI arrays, matching how every client imports them. ---

const targets = [
  ["agent/src/abi/ASCTreasuryJournal.json", journalAbi],
  ["frontend/src/abi/ASCTreasuryJournal.json", journalAbi],
  ["agent/src/abi/ASCTreasuryFactory.json", factoryAbi],
  ["frontend/src/abi/ASCTreasuryFactory.json", factoryAbi],
];
for (const [rel, abi] of targets) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(abi, null, 2) + "\n");
  console.log("wrote", rel, "(" + abi.length + " ABI entries)");
}
console.log("update-abis: OK — JournalEntry has " + gotFields.length + " fields, all gates passed");

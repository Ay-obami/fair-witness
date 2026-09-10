// Offline, read-only manifest gate. It never imports a signer and cannot broadcast.
const fs = require("fs");
const path = require("path");

const manifestPath = process.argv[2] ?? path.join(__dirname, "..", "deployments", "schema-v1.candidate.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const address = /^0x[0-9a-fA-F]{40}$/;

if (manifest.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
if (manifest.source?.chainId !== "11155111") errors.push("source chain must be Sepolia 11155111");
if (manifest.destination?.chainId !== "102031") errors.push("destination chain must be Creditcoin testnet 102031");
if (manifest.destination?.blockProver?.toLowerCase() !== "0x0000000000000000000000000000000000000fd2") errors.push("unexpected BlockProver");
if (manifest.destination?.chainInfo?.toLowerCase() !== "0x0000000000000000000000000000000000000fd3") errors.push("unexpected ChainInfo");
for (const key of ["stable", "wctc"]) if (!address.test(manifest.source?.[key] ?? "")) errors.push(`invalid source ${key}`);
for (const key of ["penguinFactory", "penguinRouter", "penguinPool", "wctc", "stable"]) {
  if (!address.test(manifest.destination?.[key] ?? "")) errors.push(`invalid destination ${key}`);
}
if (manifest.mandate?.automationMode !== "PAUSED") errors.push("initial automation mode must be PAUSED");
if (manifest.claims?.naturallyOccurringArbitrage !== false || manifest.claims?.productionProfitability !== false) errors.push("economic claims must remain false");

const unresolved = [manifest.source?.pool, manifest.source?.observer, manifest.destination?.validator,
  manifest.destination?.adapter, manifest.destination?.factory, manifest.destination?.treasury,
  manifest.roles?.deployer, manifest.roles?.treasuryOwner, manifest.roles?.agentSubmitter,
  manifest.mandate?.universal, manifest.mandate?.arbitrage, manifest.mandate?.rebalance,
  manifest.mandate?.riskReduction, manifest.mandate?.expectedPolicyHash].filter((value) => value == null).length;
const broadcastReady = errors.length === 0 && unresolved === 0 && manifest.roles.ownerAgentSeparated === true &&
  manifest.mandate.approved === true && Array.isArray(manifest.blockers) && manifest.blockers.length === 0 &&
  manifest.status === "APPROVED_FOR_BROADCAST";

console.log(JSON.stringify({ manifestPath, structuralErrors: errors, unresolvedFields: unresolved, broadcastReady }, null, 2));
if (errors.length > 0) process.exitCode = 1;
else if (!broadcastReady) process.exitCode = 2;

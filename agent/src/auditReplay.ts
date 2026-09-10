import "dotenv/config";
import { reconstructReplay, auditRepositoryFromEnvironment } from "./audit/index.js";

async function main(): Promise<void> {
  const [chain, treasury, id] = process.argv.slice(2);
  if (!chain || !treasury || !id) {
    throw new Error("Usage: npm run replay:audit -- <chainId> <treasuryAddress> <attemptId>");
  }
  const bundle = await reconstructReplay(auditRepositoryFromEnvironment(), BigInt(chain), treasury, BigInt(id));
  if (!bundle.attempt) {
    console.log("MISSING_ARTIFACT — no reconciled schema-v1 attempt projection found");
    return;
  }
  console.log(JSON.stringify(bundle, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  if (bundle.attempt.syncStatus !== "CANONICAL") process.exitCode = 2;
  if (bundle.integrity === "MISMATCH") process.exitCode = 3;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

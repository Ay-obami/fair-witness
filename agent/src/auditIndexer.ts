import "dotenv/config";
import { ethers } from "ethers";
import { AttemptIndexer, auditRepositoryFromEnvironment } from "./audit/index.js";

async function main(): Promise<void> {
  const rpc = process.env.CREDITCOIN_RPC_URL;
  const treasuries = (process.env.AUDIT_TREASURIES ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const fromBlock = Number(process.env.AUDIT_FROM_BLOCK ?? "0");
  if (!rpc || treasuries.length === 0 || !Number.isSafeInteger(fromBlock) || fromBlock < 0) {
    throw new Error("CREDITCOIN_RPC_URL, AUDIT_TREASURIES, and a valid AUDIT_FROM_BLOCK are required");
  }
  const provider = new ethers.JsonRpcProvider(rpc);
  const network = await provider.getNetwork();
  const latest = await provider.getBlockNumber();
  const repository = auditRepositoryFromEnvironment();
  const indexer = new AttemptIndexer(provider, repository, network.chainId);
  for (const treasury of treasuries) {
    const count = await indexer.ingest(ethers.getAddress(treasury), fromBlock, latest);
    console.log(`${treasury}: reconciled ${count} attempt log(s) through block ${latest}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

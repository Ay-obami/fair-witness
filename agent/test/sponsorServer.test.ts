import { afterEach, describe, expect, it, vi } from "vitest";
import { ethers } from "ethers";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";

let directory: string;
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function start() {
  vi.resetModules();
  const { startSponsorServer } = await import("../src/sponsorServer.js");
  server = startSponsorServer();
  if (!server.listening) await new Promise(resolve => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing HTTP port");
  return `http://127.0.0.1:${address.port}`;
}
async function fund(base: string, wallet: ethers.HDNodeWallet) {
  const headers = { Origin: "https://fair-witness.vercel.app", "Content-Type": "application/json" };
  const challenge = await fetch(`${base}/sponsor-challenge?address=${wallet.address}`, { headers }).then(r => r.json()) as { nonce: string; message: string };
  return fetch(`${base}/sponsor-gas`, { method: "POST", headers, body: JSON.stringify({ address: wallet.address, nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
}

describe("HTTP sponsorship accounting", () => {
  it("refuses a configured sponsor without a durable ledger path", async () => {
    vi.stubEnv("GAS_SPONSOR_PRIVATE_KEY", ethers.Wallet.createRandom().privateKey);
    vi.stubEnv("GAS_SPONSOR_LEDGER_PATH", "");
    vi.resetModules();
    await expect(import("../src/sponsorServer.js")).rejects.toThrow("GAS_SPONSOR_LEDGER_PATH");
  });
  it("reserves an ambiguous send before broadcast and denies a new wallet after restart", async () => {
    directory = mkdtempSync(join(tmpdir(), "sponsor-http-"));
    const sponsor = ethers.Wallet.createRandom();
    vi.stubEnv("GAS_SPONSOR_PRIVATE_KEY", sponsor.privateKey);
    vi.stubEnv("GAS_SPONSOR_LEDGER_PATH", join(directory, "ledger.json"));
    vi.stubEnv("GAS_SPONSOR_DAILY_BUDGET_WEI", "250000000000000000");
    vi.stubEnv("PORT", "0");
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getBalance").mockResolvedValue(0n);
    const broadcast = vi.spyOn(ethers.Wallet.prototype, "sendTransaction").mockRejectedValue(new Error("ambiguous RPC timeout"));
    let base = await start();
    expect((await fund(base, ethers.Wallet.createRandom())).status).toBe(500);
    expect(broadcast).toHaveBeenCalledTimes(1);
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
    base = await start();
    expect((await fund(base, ethers.Wallet.createRandom())).status).toBe(429);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});

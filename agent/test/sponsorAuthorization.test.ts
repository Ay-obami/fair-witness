import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { SponsorAuthorization } from "../src/sponsorAuthorization.js";

describe("gas sponsor authorization", () => {
  const wallet = ethers.Wallet.createRandom();

  it("requires a fresh signature from the funded wallet and consumes it once", async () => {
    const auth = new SponsorAuthorization();
    const challenge = auth.issue(wallet.address);
    const signature = await wallet.signMessage(challenge.message);
    expect(auth.consume(wallet.address, challenge.nonce, signature)).toBe(true);
    expect(auth.consume(wallet.address, challenge.nonce, signature)).toBe(false);
  });

  it("rejects another wallet, a changed nonce, and expired challenges", async () => {
    let clock = 1_700_000_000_000;
    const auth = new SponsorAuthorization(() => clock);
    const challenge = auth.issue(wallet.address);
    const signature = await wallet.signMessage(challenge.message);
    expect(auth.consume(ethers.Wallet.createRandom().address, challenge.nonce, signature)).toBe(false);
    expect(auth.consume(wallet.address, ethers.hexlify(ethers.randomBytes(32)), signature)).toBe(false);
    expect(auth.consume(wallet.address, challenge.nonce, await ethers.Wallet.createRandom().signMessage(challenge.message))).toBe(false);
    expect(auth.consume(wallet.address, challenge.nonce, signature)).toBe(true);
    const expiring = auth.issue(wallet.address);
    const expiringSignature = await wallet.signMessage(expiring.message);
    clock += 300_001;
    expect(auth.consume(wallet.address, expiring.nonce, expiringSignature)).toBe(false);
  });

  it("keeps issuing after thousands of unsigned challenges and rejects a forged token", async () => {
    const auth = new SponsorAuthorization();
    for (let i = 0; i < 5_100; i++) auth.issue(wallet.address);
    const challenge = auth.issue(wallet.address);
    const signature = await wallet.signMessage(challenge.message);
    const forged = `${challenge.nonce.slice(0, -1)}${challenge.nonce.endsWith("0") ? "1" : "0"}`;
    expect(auth.consume(wallet.address, forged, signature)).toBe(false);
    expect(auth.consume(wallet.address, challenge.nonce, signature)).toBe(true);
  });
});

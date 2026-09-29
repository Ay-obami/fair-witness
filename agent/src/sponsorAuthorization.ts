import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ethers } from "ethers";

const TTL_MS = 300_000;

export class SponsorAuthorization {
  private readonly secret = randomBytes(32);
  private readonly used = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now, private readonly chainId = 102031) {}

  private mac(address: string, random: string, expiresAt: number): Buffer {
    return createHmac("sha256", this.secret).update(`${this.chainId}:${address}:${random}:${expiresAt}`).digest();
  }

  issue(address: string) {
    const recipient = ethers.getAddress(address);
    const expiresAt = this.now() + TTL_MS;
    const random = randomBytes(32).toString("hex");
    const nonce = `${random}.${expiresAt}.${this.mac(recipient, random, expiresAt).toString("hex")}`;
    const message = this.message(recipient, nonce, expiresAt);
    return { nonce, message, expiresAt };
  }

  private message(address: string, nonce: string, expiresAt: number): string {
    return `Fair Witness gas sponsorship\nChain ID: ${this.chainId}\nAddress: ${address}\nNonce: ${nonce}\nExpires at: ${expiresAt}`;
  }

  consume(address: string, nonce: string, signature: string): boolean {
    const parts = /^([a-f0-9]{64})\.([0-9]{1,16})\.([a-f0-9]{64})$/.exec(nonce);
    if (!parts) return false;
    const expiresAt = Number(parts[2]);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= this.now() || expiresAt > this.now() + TTL_MS || this.used.has(nonce)) return false;
    try {
      const recipient = ethers.getAddress(address);
      if (!timingSafeEqual(this.mac(recipient, parts[1], expiresAt), Buffer.from(parts[3], "hex"))) return false;
      if (ethers.verifyMessage(this.message(recipient, nonce, expiresAt), signature) !== recipient) return false;
    } catch {
      return false;
    }
    for (const [key, expiry] of this.used) if (expiry <= this.now()) this.used.delete(key);
    this.used.set(nonce, expiresAt);
    return true;
  }
}

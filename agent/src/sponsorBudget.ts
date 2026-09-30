import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface Ledger {
  version: 1;
  identity: string;
  day: number;
  spentWei: string;
  lastReservedAt: Record<string, number>;
}

/** Durable principal reservations. Failed/ambiguous sends deliberately remain charged. */
export class SponsorBudget {
  constructor(private readonly path: string, private readonly identity: string) {}

  private read(now: number): Ledger {
    const today = Math.floor(now / 86_400_000);
    if (!existsSync(this.path)) return { version: 1, identity: this.identity, day: today, spentWei: "0", lastReservedAt: {} };
    const data: unknown = JSON.parse(readFileSync(this.path, "utf8"));
    const state = data as Ledger;
    if (!state || state.version !== 1 || state.identity !== this.identity
        || !Number.isSafeInteger(state.day) || state.day < 0
        || typeof state.spentWei !== "string" || !/^\d+$/.test(state.spentWei)
        || !state.lastReservedAt || typeof state.lastReservedAt !== "object" || Array.isArray(state.lastReservedAt)
        || Object.values(state.lastReservedAt).some(time => !Number.isSafeInteger(time) || time < 0)) {
      throw new Error("invalid sponsor budget ledger or sponsor identity mismatch");
    }
    // Moving the host clock backwards must not create a new spending budget.
    if (today > state.day) { state.day = today; state.spentWei = "0"; }
    return state;
  }

  snapshot(now: number) { return { spentWei: BigInt(this.read(now).spentWei) }; }

  reserve(address: string, amount: bigint, budget: bigint, cooldown: number, now: number): void {
    if (amount <= 0n || budget <= 0n || !Number.isSafeInteger(now) || now < 0
        || !Number.isSafeInteger(cooldown) || cooldown < 0 || cooldown > 30 * 86_400_000) throw new Error("invalid sponsor reservation");
    // An interrupted reservation leaves this lock in place and stops further spending.
    // Operators must reconcile the ledger and chain before removing a stale lock.
    const lockPath = `${this.path}.lock`;
    const lock = openSync(lockPath, "wx", 0o600);
    let persisted = false;
    let writeStarted = false;
    try {
      const state = this.read(now);
      const key = address.toLowerCase();
      const last = state.lastReservedAt[key];
      if (last !== undefined && now - last < cooldown) throw new Error("address sponsorship cooldown is still active");
      if (BigInt(state.spentWei) + amount > budget) throw new Error("daily sponsor budget exhausted");
      state.spentWei = (BigInt(state.spentWei) + amount).toString();
      // Keep entries for at least the longest allowed cooldown even if config changes.
      for (const [wallet, time] of Object.entries(state.lastReservedAt)) {
        if (now - time >= 30 * 86_400_000) delete state.lastReservedAt[wallet];
      }
      state.lastReservedAt[key] = now;
      const temporary = `${this.path}.tmp`;
      writeStarted = true;
      const fd = openSync(temporary, "w", 0o600);
      try { writeFileSync(fd, JSON.stringify(state)); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, this.path);
      const directory = openSync(dirname(this.path), "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
      persisted = true;
    } finally {
      closeSync(lock);
      // Ordinary policy rejections did not modify the ledger. Persistence errors keep
      // the lock to fail closed, even if an atomic rename may already have succeeded.
      if (!writeStarted || persisted) unlinkSync(lockPath);
    }
  }
}

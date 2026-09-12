import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ethers } from "ethers";
import { runtimeHealthSnapshot } from "./runtimeHealth.js";

const RPC = process.env.CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const CHAIN_ID = Number(process.env.CREDITCOIN_CHAIN_ID ?? "102031");
const PORT = Number(process.env.PORT ?? "8080");
const TARGET_WEI = BigInt(process.env.GAS_SPONSOR_TARGET_WEI ?? "250000000000000000"); // 0.25 CTC
const MIN_BALANCE_WEI = BigInt(process.env.GAS_SPONSOR_MIN_BALANCE_WEI ?? "50000000000000000"); // 0.05 CTC
const MAX_TOPUP_WEI = BigInt(process.env.GAS_SPONSOR_MAX_TOPUP_WEI ?? TARGET_WEI.toString());
const DAILY_BUDGET_WEI = BigInt(process.env.GAS_SPONSOR_DAILY_BUDGET_WEI ?? (TARGET_WEI * 10n).toString());
const ADDRESS_COOLDOWN_MS = Math.max(0, Number(process.env.GAS_SPONSOR_ADDRESS_COOLDOWN_MS ?? "86400000"));
const ALLOWED_ORIGINS = (process.env.SPONSOR_ALLOWED_ORIGINS ?? "https://fair-witness.vercel.app")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (MIN_BALANCE_WEI < 0n || MIN_BALANCE_WEI > TARGET_WEI) {
  throw new Error("GAS_SPONSOR_MIN_BALANCE_WEI must be between 0 and GAS_SPONSOR_TARGET_WEI");
}
if (TARGET_WEI <= 0n || MAX_TOPUP_WEI <= 0n || DAILY_BUDGET_WEI <= 0n) {
  throw new Error("gas sponsor target, max top-up and daily budget must all be positive");
}

const sponsorKey = process.env.GAS_SPONSOR_PRIVATE_KEY;
const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
const sponsor = sponsorKey ? new ethers.Wallet(sponsorKey, provider) : null;
const lastFundedAt = new Map<string, number>();
let budgetDay = Math.floor(Date.now() / 86_400_000);
let sponsoredTodayWei = 0n;
let sponsorSerial: Promise<void> = Promise.resolve();

function allowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
}

function cors(res: ServerResponse, origin?: string) {
  if (origin && allowedOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error("request body too large");
  }
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid JSON body");
  return parsed as Record<string, unknown>;
}

function refreshDailyBudget() {
  const currentDay = Math.floor(Date.now() / 86_400_000);
  if (currentDay !== budgetDay) {
    budgetDay = currentDay;
    sponsoredTodayWei = 0n;
  }
}

async function topUpUnlocked(address: string) {
  if (!sponsor) throw new Error("GAS_SPONSOR_PRIVATE_KEY is not configured");
  refreshDailyBudget();

  const recipient = ethers.getAddress(address);
  const key = recipient.toLowerCase();
  const current = await provider.getBalance(recipient);

  // A previously sponsored wallet should be able to perform many lifecycle writes
  // without being refilled after every tiny gas spend. Only sponsor again once the
  // account is genuinely running low, then refill toward TARGET_WEI.
  if (current >= MIN_BALANCE_WEI) {
    return {
      address: recipient,
      funded: false,
      balanceWei: current.toString(),
      minBalanceWei: MIN_BALANCE_WEI.toString(),
      targetWei: TARGET_WEI.toString(),
    };
  }

  const last = lastFundedAt.get(key);
  if (last && Date.now() - last < ADDRESS_COOLDOWN_MS) {
    throw new Error("address sponsorship cooldown is still active");
  }

  const amount = TARGET_WEI - current;
  if (amount > MAX_TOPUP_WEI) throw new Error("requested top-up exceeds sponsor ceiling");
  if (sponsoredTodayWei + amount > DAILY_BUDGET_WEI) throw new Error("daily sponsor budget exhausted");

  const tx = await sponsor.sendTransaction({ to: recipient, value: amount });
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("sponsor transaction was not confirmed successfully");
  sponsoredTodayWei += amount;
  lastFundedAt.set(key, Date.now());
  return {
    address: recipient,
    funded: true,
    amountWei: amount.toString(),
    balanceBeforeWei: current.toString(),
    minBalanceWei: MIN_BALANCE_WEI.toString(),
    txHash: receipt.hash,
    targetWei: TARGET_WEI.toString(),
  };
}

async function topUp(address: string) {
  let release!: () => void;
  const previous = sponsorSerial;
  sponsorSerial = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await topUpUnlocked(address);
  } finally {
    release();
  }
}

export function startSponsorServer() {
  const server = createServer(async (req, res) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    cors(res, origin);
    if (req.method === "OPTIONS") {
      res.statusCode = allowedOrigin(origin) ? 204 : 403;
      return res.end();
    }
    if (req.method === "GET" && req.url === "/health") {
      refreshDailyBudget();
      return json(res, 200, {
        ok: true,
        sponsorConfigured: Boolean(sponsor),
        chainId: CHAIN_ID,
        sponsor: {
          targetWei: TARGET_WEI.toString(),
          minBalanceWei: MIN_BALANCE_WEI.toString(),
          maxTopupWei: MAX_TOPUP_WEI.toString(),
          dailyBudgetWei: DAILY_BUDGET_WEI.toString(),
          sponsoredTodayWei: sponsoredTodayWei.toString(),
          remainingDailyBudgetWei: (DAILY_BUDGET_WEI > sponsoredTodayWei ? DAILY_BUDGET_WEI - sponsoredTodayWei : 0n).toString(),
          addressCooldownMs: ADDRESS_COOLDOWN_MS,
        },
        agent: runtimeHealthSnapshot(),
      });
    }
    if (req.method !== "POST" || req.url !== "/sponsor-gas") return json(res, 404, { error: "not found" });
    if (!allowedOrigin(origin)) return json(res, 403, { error: "origin not allowed" });
    if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      return json(res, 415, { error: "application/json is required" });
    }
    try {
      const payload = await body(req);
      if (typeof payload.address !== "string" || !ethers.isAddress(payload.address)) {
        return json(res, 400, { error: "valid address is required" });
      }
      const result = await topUp(payload.address);
      return json(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[sponsor] request failed", message);
      const status = message.includes("cooldown") || message.includes("budget") ? 429 : 500;
      return json(res, status, { error: message });
    }
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[sponsor] listening on :${PORT}; configured=${Boolean(sponsor)} targetWei=${TARGET_WEI} minBalanceWei=${MIN_BALANCE_WEI} dailyBudgetWei=${DAILY_BUDGET_WEI}`,
    );
  });
  return server;
}

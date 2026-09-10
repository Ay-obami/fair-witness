import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ethers } from "ethers";

const RPC = process.env.CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const CHAIN_ID = Number(process.env.CREDITCOIN_CHAIN_ID ?? "102031");
const PORT = Number(process.env.PORT ?? "8080");
const TARGET_WEI = BigInt(process.env.GAS_SPONSOR_TARGET_WEI ?? "250000000000000000"); // 0.25 CTC
const MAX_TOPUP_WEI = BigInt(process.env.GAS_SPONSOR_MAX_TOPUP_WEI ?? TARGET_WEI.toString());
const ALLOWED_ORIGINS = (process.env.SPONSOR_ALLOWED_ORIGINS ?? "https://fair-witness.vercel.app")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const sponsorKey = process.env.GAS_SPONSOR_PRIVATE_KEY;
const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
const sponsor = sponsorKey ? new ethers.Wallet(sponsorKey, provider) : null;
const inFlight = new Map<string, Promise<unknown>>();

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

async function topUp(address: string) {
  if (!sponsor) throw new Error("GAS_SPONSOR_PRIVATE_KEY is not configured");
  const recipient = ethers.getAddress(address);
  const current = await provider.getBalance(recipient);
  if (current >= TARGET_WEI) {
    return { address: recipient, funded: false, balanceWei: current.toString(), targetWei: TARGET_WEI.toString() };
  }
  const amount = TARGET_WEI - current;
  if (amount > MAX_TOPUP_WEI) throw new Error("requested top-up exceeds sponsor ceiling");
  const existing = inFlight.get(recipient.toLowerCase());
  if (existing) return existing;
  const task = (async () => {
    const tx = await sponsor.sendTransaction({ to: recipient, value: amount });
    const receipt = await tx.wait();
    return {
      address: recipient,
      funded: true,
      amountWei: amount.toString(),
      txHash: receipt?.hash ?? tx.hash,
      targetWei: TARGET_WEI.toString(),
    };
  })().finally(() => inFlight.delete(recipient.toLowerCase()));
  inFlight.set(recipient.toLowerCase(), task);
  return task;
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
      return json(res, 200, { ok: true, sponsorConfigured: Boolean(sponsor), chainId: CHAIN_ID });
    }
    if (req.method !== "POST" || req.url !== "/sponsor-gas") return json(res, 404, { error: "not found" });
    if (!allowedOrigin(origin)) return json(res, 403, { error: "origin not allowed" });
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
      return json(res, 500, { error: message });
    }
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[sponsor] listening on :${PORT}; configured=${Boolean(sponsor)} targetWei=${TARGET_WEI}`);
  });
  return server;
}

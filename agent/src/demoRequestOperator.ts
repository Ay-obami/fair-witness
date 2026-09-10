import "dotenv/config";

export const REQUEST_STATUSES = ["REQUESTED", "ACKNOWLEDGED", "COMPLETED", "DECLINED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestedStrategy = "ARBITRAGE" | "REBALANCING" | "RISK_REDUCTION";

export interface DemoRequest {
  request_id: string;
  strategy: RequestedStrategy;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
}

const COMMANDS: Record<RequestedStrategy, string> = {
  ARBITRAGE: "npm run demo:arbitrage",
  REBALANCING: "npm run demo:rebalance",
  RISK_REDUCTION: "npm run demo:risk:valid",
};

export function supervisedCommand(strategy: RequestedStrategy): string {
  return COMMANDS[strategy];
}

export class DemoRequestOperator {
  private readonly baseUrl: string;

  constructor(url: string, private readonly serviceRoleKey: string) {
    this.baseUrl = url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    if (!this.baseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Demo request operation failed: ${response.status} ${await response.text()}`);
    return response;
  }

  async list(): Promise<DemoRequest[]> {
    const response = await this.request("demo_requests?select=request_id,strategy,status,created_at,updated_at&order=created_at.asc");
    return response.json() as Promise<DemoRequest[]>;
  }

  async find(requestId: string): Promise<DemoRequest> {
    const response = await this.request(`demo_requests?request_id=eq.${encodeURIComponent(requestId)}&select=request_id,strategy,status,created_at,updated_at&limit=1`);
    const rows = await response.json() as DemoRequest[];
    if (!rows[0]) throw new Error(`Demo request not found: ${requestId}`);
    return rows[0];
  }

  async setStatus(requestId: string, status: Exclude<RequestStatus, "REQUESTED">): Promise<DemoRequest> {
    const response = await this.request(`demo_requests?request_id=eq.${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    });
    const rows = await response.json() as DemoRequest[];
    if (!rows[0]) throw new Error(`Demo request not found: ${requestId}`);
    return rows[0];
  }
}

async function main() {
  const operator = new DemoRequestOperator(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const [action = "list", requestId] = process.argv.slice(2);
  if (action === "list") {
    const rows = await operator.list();
    if (!rows.length) return console.log("No demo requests.");
    for (const row of rows) console.log(`${row.request_id}  ${row.strategy.padEnd(14)}  ${row.status.padEnd(12)}  ${row.created_at}`);
    return;
  }
  if (!requestId) throw new Error(`Usage: npm run demo:requests -- ${action} <request-id>`);
  if (action === "show") {
    const row = await operator.find(requestId);
    console.log(`${row.request_id} ${row.strategy} ${row.status}`);
    console.log(`Supervised command: ${supervisedCommand(row.strategy)}`);
    return;
  }
  const status = ({ acknowledge: "ACKNOWLEDGED", complete: "COMPLETED", decline: "DECLINED" } as const)[action as "acknowledge" | "complete" | "decline"];
  if (!status) throw new Error("Action must be list, show, acknowledge, complete, or decline");
  const row = await operator.setStatus(requestId, status);
  console.log(`${row.request_id} ${row.strategy} -> ${row.status}`);
  if (status === "ACKNOWLEDGED") console.log(`Run under supervision: ${supervisedCommand(row.strategy)}`);
}

if (process.argv[1]?.endsWith("demoRequestOperator.ts") || process.argv[1]?.endsWith("demoRequestOperator.js")) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

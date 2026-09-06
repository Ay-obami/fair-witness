import type { TradeDirection } from "../lib/types";

export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

export function directionLabel(direction: TradeDirection | undefined): string {
  if (direction === "SELL_BASE_FOR_QUOTE") return "SELL base → quote";
  if (direction === "BUY_BASE_FOR_QUOTE") return "BUY base ← quote";
  return "not recorded (pre-direction journal entry)";
}

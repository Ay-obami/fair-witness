type ErrorLike = {
  message?: unknown;
  shortMessage?: unknown;
  reason?: unknown;
  details?: unknown;
  error?: unknown;
  info?: unknown;
  cause?: unknown;
};

function pickMessage(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (value instanceof Error && value.message) return value.message;
  if (typeof value !== "object") return null;

  const obj = value as ErrorLike & Record<string, unknown>;
  for (const key of ["shortMessage", "reason", "message", "details"] as const) {
    const candidate = obj[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const info = obj.info as Record<string, unknown> | undefined;
  for (const nested of [obj.error, info?.error, obj.cause]) {
    const message = pickMessage(nested, depth + 1);
    if (message) return message;
  }

  try {
    const json = JSON.stringify(value);
    if (json && json !== "{}") return json;
  } catch {
    // Ignore circular/non-serializable objects and return the safe fallback below.
  }
  return null;
}

export function humanError(error: unknown, fallback = "The transaction could not be completed."): string {
  const message = pickMessage(error) ?? fallback;
  return message
    .replace(/^Error:\s*/i, "")
    .replace(/\s*\(action=.*$/i, "")
    .trim();
}

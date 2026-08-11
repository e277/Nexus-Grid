/** Time helpers shared across workflows and agents. */

/** Current UTC time as an ISO-8601 string with a Z suffix. */
export function utcnowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Current UTC calendar date as `YYYY-MM-DD`. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` for today shifted by `days` (negative = in the past). */
export function dateOffsetIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two `YYYY-MM-DD` dates (`to - from`). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

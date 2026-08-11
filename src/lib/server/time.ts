/** Time helpers shared across sources, agents, and workflows. */

/** Current UTC time as an ISO-8601 string with a Z suffix. */
export function utcnowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

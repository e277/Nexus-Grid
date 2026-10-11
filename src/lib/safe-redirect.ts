/**
 * A post-sign-in destination, restricted to this site.
 *
 * A callback URL comes from the query string, so anything but a same-site path
 * would make sign-in an open redirect: `//evil.example` and `/\evil.example`
 * are both read by browsers as another host.
 */
export function safeCallback(value: unknown, fallback = "/console"): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : fallback;
}

/**
 * Who is making an API request.
 *
 * Two kinds of caller: a person, carrying the console's session cookie, and a
 * service account, carrying `Authorization: Bearer <token>`. A bearer header
 * is decided on its own — a request presenting a bad token is refused, never
 * quietly retried as the cookie it may also carry.
 */

import { matchApiToken, policyFromEnv, type Role } from "./policy";

export interface Principal {
  /** What the audit trail records: an email, or `service:<name>`. */
  id: string;
  role: Role;
  kind: "user" | "service";
}

const policy = policyFromEnv();

export async function identify(request: Request): Promise<Principal | null> {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    const token = match ? matchApiToken(match[1].trim(), policy) : null;
    return token ? { id: `service:${token.name}`, role: token.role, kind: "service" } : null;
  }

  // Imported here rather than at the top so the route plumbing, and its
  // tests, do not load Auth.js until a request actually needs a session.
  const { auth, authConfigured } = await import("@/auth");
  if (!authConfigured()) return null;

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return { id: email, role: session.user.role, kind: "user" };
}

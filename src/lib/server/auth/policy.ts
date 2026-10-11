/**
 * Who may use the console, and what they may do there.
 *
 * Pure functions over an `AccessPolicy` read from the environment, so the
 * decisions that matter — is this person allowed in, as what, and does that
 * role cover this route — are testable without a running identity provider.
 *
 * The policy fails closed: an address that is on no list and outside every
 * allowed domain gets no role, and no role means no session.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** Ordered weakest to strongest; each role includes everything before it. */
export const ROLES = ["viewer", "operator", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when `role` carries at least the rights of `required`. */
export function satisfies(role: Role, required: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(required);
}

/** A service account: an integration, scraper or CI job calling the API. */
export interface ApiToken {
  name: string;
  role: Role;
  /** Hex SHA-256 of the token. The token itself is never stored. */
  sha256: string;
}

export interface AccessPolicy {
  /** Lower-cased addresses per role. A person on two lists gets the stronger role. */
  emails: Record<Role, Set<string>>;
  /** Lower-cased domains whose verified addresses get `defaultRole`. */
  domains: Set<string>;
  defaultRole: Role;
  apiTokens: ApiToken[];
}

type Env = Record<string, string | undefined>;

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Parse `AUTH_API_TOKENS`: comma-separated `name:role:sha256hex` entries.
 *
 * A malformed entry is dropped with a warning rather than failing the whole
 * list, so one typo cannot lock out every other integration — but it is never
 * guessed at either.
 */
export function parseApiTokens(value: string | undefined): ApiToken[] {
  const tokens: ApiToken[] = [];
  for (const entry of (value ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    const [name, role, sha256] = entry.split(":").map((part) => part.trim());
    if (!name || !isRole(role) || !/^[0-9a-f]{64}$/i.test(sha256 ?? "")) {
      console.warn(`Ignoring malformed AUTH_API_TOKENS entry for "${name ?? "?"}"`);
      continue;
    }
    tokens.push({ name, role, sha256: sha256.toLowerCase() });
  }
  return tokens;
}

export function policyFromEnv(env: Env = process.env): AccessPolicy {
  const defaultRole = env.AUTH_DEFAULT_ROLE?.trim().toLowerCase();
  return {
    emails: {
      viewer: new Set(list(env.AUTH_VIEWER_EMAILS)),
      operator: new Set(list(env.AUTH_OPERATOR_EMAILS)),
      admin: new Set(list(env.AUTH_ADMIN_EMAILS)),
    },
    domains: new Set(list(env.AUTH_ALLOWED_DOMAINS).map((domain) => domain.replace(/^@/, ""))),
    defaultRole: isRole(defaultRole) ? defaultRole : "viewer",
    apiTokens: parseApiTokens(env.AUTH_API_TOKENS),
  };
}

function normalise(email: string | null | undefined): string | null {
  const address = email?.trim().toLowerCase();
  return address && address.includes("@") ? address : null;
}

/** A grant stored in the database, managed from the console. */
export interface StoredGrant {
  role: Role;
  disabled: boolean;
}

/**
 * The role an address is entitled to, or null when it may not sign in.
 *
 * In order:
 * 1. An address named in the environment gets that role — the strongest one
 *    if it is on several lists. The database cannot override it, so whoever
 *    deploys can never be locked out from the console.
 * 2. A grant stored in the database: its role, or nothing if disabled. A
 *    disabled grant also shuts out an address that its domain would admit.
 * 3. An allowed domain gets the default role.
 */
export function resolveRole(
  email: string | null | undefined,
  policy: AccessPolicy,
  stored: StoredGrant | null = null
): Role | null {
  const address = normalise(email);
  if (!address) return null;

  for (const role of [...ROLES].reverse()) {
    if (policy.emails[role].has(address)) return role;
  }

  if (stored) return stored.disabled ? null : stored.role;

  const domain = address.slice(address.lastIndexOf("@") + 1);
  if (policy.domains.has(domain)) return policy.defaultRole;

  return null;
}

/** Whether the environment pins this address's role (and so the console cannot change it). */
export function pinnedByEnvironment(email: string, policy: AccessPolicy): Role | null {
  const address = normalise(email);
  if (!address) return null;
  for (const role of [...ROLES].reverse()) {
    if (policy.emails[role].has(address)) return role;
  }
  return null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The service account a bearer token belongs to, compared in constant time. */
export function matchApiToken(token: string, policy: AccessPolicy): ApiToken | null {
  if (!token) return null;
  const presented = Buffer.from(hashToken(token), "hex");
  let found: ApiToken | null = null;
  // Every entry is compared, match or not, so timing says nothing about which.
  for (const candidate of policy.apiTokens) {
    if (timingSafeEqual(presented, Buffer.from(candidate.sha256, "hex"))) found = candidate;
  }
  return found;
}

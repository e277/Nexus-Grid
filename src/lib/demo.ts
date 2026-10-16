/**
 * Demo accounts: one shared identity per role, offered on the sign-in page
 * when the deployment sets AUTH_DEMO_LOGIN=1 (see `demoLoginEnabled` in auth.ts).
 *
 * The addresses sit under `.invalid`, a top-level domain reserved so that it
 * never resolves (RFC 2606). No real identity provider can verify an address
 * there, so a demo identity cannot collide with a real person, and the role is
 * read back from the address itself rather than from any access list.
 *
 * Kept free of server imports: the console uses it to tell a demo session
 * apart, and the sign-in page to describe the choices.
 */

import type { Role } from "./server/auth/policy";

const DEMO_DOMAIN = "demo.nexus-grid.invalid";

/** Weakest first, the order the sign-in page lists them in. */
export const DEMO_ROLES: readonly Role[] = ["viewer", "operator", "admin"];

/** What each demo role is for, in the words the sign-in page shows. */
export const DEMO_ROLE_COPY: Record<Role, { label: string; detail: string }> = {
  viewer: { label: "Viewer", detail: "Read findings, analysis and the audit trail." },
  operator: { label: "Operator", detail: "Also run sweeps and decide approval gates." },
  admin: { label: "Admin", detail: "Also see metrics. Access settings stay locked." },
};

export function demoEmail(role: Role): string {
  return `${role}@${DEMO_DOMAIN}`;
}

/** The role a demo address stands for, or null for any other address. */
export function demoRoleOf(email: string | null | undefined): Role | null {
  const address = email?.trim().toLowerCase() ?? "";
  return DEMO_ROLES.find((role) => address === demoEmail(role)) ?? null;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return demoRoleOf(email) !== null;
}

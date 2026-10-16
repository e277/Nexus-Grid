import { pinnedByEnvironment, policyFromEnv, ROLES } from "@/lib/server/auth/policy";
import { listUsers, upsertUser } from "@/lib/server/auth/users";
import { databaseConfigured } from "@/lib/server/db/client";
import { api, HttpError, jsonBody } from "@/lib/server/http";
import { optionalBool, optionalString, requiredEnum } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const policy = policyFromEnv();

function requireDatabase() {
  if (!databaseConfigured()) {
    throw new HttpError(503, "Managing access from the console needs a database (set DATABASE_URL).");
  }
}

/**
 * Who has been granted access from the console, plus who the environment
 * pins, so an admin sees the whole list and which entries they cannot change.
 */
export const GET = api(
  async () => {
    const stored = databaseConfigured() ? await listUsers() : [];
    const pinned = (["admin", "operator", "viewer"] as const).flatMap((role) =>
      [...policy.emails[role]].map((email) => ({ email, role }))
    );
    return {
      database: databaseConfigured(),
      users: stored.map((user) => ({ ...user, pinned_role: pinnedByEnvironment(user.email, policy) })),
      environment: pinned,
      allowed_domains: [...policy.domains],
      default_role: policy.defaultRole,
    };
  },
  // A demo admin is any visitor; the list names the deployment's real users.
  { access: "admin", demo: false }
);

/** Grant, change or disable one person's access. */
export const POST = api(
  async ({ request, principal }) => {
    requireDatabase();
    const body = await jsonBody(request);

    const email = optionalString(body, "email")?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(422, "email must be an email address");
    }
    const role = requiredEnum(body, "role", ROLES);
    const disabled = optionalBool(body, "disabled", false);

    if (pinnedByEnvironment(email, policy)) {
      throw new HttpError(409, `${email} is set in the deployment's environment and can only be changed there.`);
    }
    if (principal?.id.toLowerCase() === email) {
      throw new HttpError(409, "You can't change your own access. Ask another admin.");
    }

    return upsertUser({ email, name: optionalString(body, "name"), role, disabled }, principal?.id ?? "system");
  },
  {
    access: "admin",
    // A grant outlives the demo: a visitor could hand their own account admin.
    demo: false,
    audit: (result) => {
      const user = result as { email: string; role: string; disabled: boolean };
      return {
        action: user.disabled ? "users.disabled" : "users.granted",
        detail: `${user.email} as ${user.role}`,
      };
    },
  }
);

/**
 * Sign-in for the operator console (Auth.js v5).
 *
 * Identity comes from the deploying organisation's own provider — Microsoft
 * Entra ID, Okta or any OIDC issuer, Google Workspace, GitHub — each switched
 * on by its environment variables. Nexus-Grid stores no passwords and has no
 * user table: sessions are signed, encrypted JWT cookies, which suits a system
 * whose state is otherwise process-local.
 *
 * Who gets in, and as what, is `lib/server/auth/policy.ts`. The role is
 * re-resolved on every session read rather than frozen into the cookie at
 * sign-in, so taking someone off the allow-list revokes them at their next
 * request after the change is deployed.
 */

import NextAuth, { type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { demoEmail, demoRoleOf } from "./lib/demo";
import { isRole, policyFromEnv, resolveRole, type Role } from "./lib/server/auth/policy";
import { findGrant, recordSignIn } from "./lib/server/auth/users";

declare module "next-auth" {
  interface Session {
    user: { role: Role } & DefaultSession["user"];
  }
}

const env = process.env;

/** Eight hours: a working shift, after which the IdP is asked again. */
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * One-click local sign-in, for working on the console without an IdP.
 *
 * Only in a development server, and only when asked for: `next build` sets
 * NODE_ENV to production, so no deployed build can ever offer it.
 */
export function devLoginEnabled(): boolean {
  return env.NODE_ENV !== "production" && env.AUTH_DEV_LOGIN === "1";
}

/**
 * One button per role on the sign-in page, for showing the console to people
 * who are not on the access list.
 *
 * Unlike the development sign-in this works in a deployed build, so it is off
 * unless AUTH_DEMO_LOGIN=1 is set: anyone who can reach the sign-in page can
 * then come in as any role. Each role is one shared identity (lib/demo.ts) and
 * the role is read from that identity on every request, so unsetting the flag
 * ends every demo session at its next request. Demo admins cannot see or
 * change who has access (`demo: false` on those routes).
 */
export function demoLoginEnabled(): boolean {
  return env.AUTH_DEMO_LOGIN === "1";
}

function devRole(): Role {
  const role = env.AUTH_DEV_ROLE?.trim().toLowerCase();
  return isRole(role) ? role : "admin";
}

function providers(): Provider[] {
  const enabled: Provider[] = [];

  if (env.AUTH_MICROSOFT_ENTRA_ID_ID && env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
    enabled.push(
      MicrosoftEntraID({
        clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      })
    );
  }

  if (env.AUTH_OIDC_ISSUER && env.AUTH_OIDC_ID && env.AUTH_OIDC_SECRET) {
    enabled.push({
      id: "oidc",
      name: env.AUTH_OIDC_NAME || "Single sign-on",
      type: "oidc",
      issuer: env.AUTH_OIDC_ISSUER,
      clientId: env.AUTH_OIDC_ID,
      clientSecret: env.AUTH_OIDC_SECRET,
    });
  }

  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    enabled.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
  }

  if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
    enabled.push(GitHub({ clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET }));
  }

  if (devLoginEnabled()) {
    enabled.push(
      Credentials({
        id: "dev",
        name: "Development sign-in",
        credentials: {},
        authorize: () => {
          const email = env.AUTH_DEV_EMAIL || "developer@localhost.test";
          return { id: email, email, name: "Local developer" };
        },
      })
    );
  }

  if (demoLoginEnabled()) {
    enabled.push(
      Credentials({
        id: "demo",
        name: "Demo account",
        credentials: { role: {} },
        authorize: (credentials) => {
          const role = credentials?.role;
          if (!isRole(role)) return null;
          const email = demoEmail(role);
          return { id: email, email, name: `Demo ${role}` };
        },
      })
    );
  }

  return enabled;
}

const configuredProviders = providers();

/**
 * The providers to offer on the sign-in page, without their secrets. Demo
 * accounts are left out: the page offers those as one button per role.
 */
export const signInOptions = configuredProviders
  .map((provider) => {
    const resolved = typeof provider === "function" ? provider() : provider;
    // The built-in providers keep caller overrides in `options` and apply them
    // later, so an overridden id or name is only visible there for now.
    const overrides = ("options" in resolved ? resolved.options : undefined) as
      | { id?: string; name?: string }
      | undefined;
    return { id: overrides?.id ?? resolved.id, name: overrides?.name ?? resolved.name };
  })
  .filter((option) => option.id !== "demo");

/**
 * Whether sign-in can work at all. Without a secret Auth.js cannot sign a
 * cookie, and without a provider there is nothing to sign in with; either way
 * the console stays shut and the sign-in page says why.
 */
export function authConfigured(): boolean {
  return Boolean(env.AUTH_SECRET) && configuredProviders.length > 0;
}

const policy = policyFromEnv();

async function roleFor(email: string | null | undefined, provider: unknown): Promise<Role | null> {
  if (provider === "dev") return devLoginEnabled() ? devRole() : null;
  if (provider === "demo") return demoLoginEnabled() ? demoRoleOf(email) : null;
  return resolveRole(email, policy, await findGrant(email));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: configuredProviders,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  events: {
    async signIn({ user, account }) {
      // Demo accounts are shared and fixed; they are not people to list on
      // the Access page.
      if (!user.email || account?.provider === "demo") return;
      await recordSignIn(user.email, user.name).catch((error) => {
        console.error("Could not record sign-in", error);
      });
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // An address the provider has not verified is a claim, not an identity.
      // Google and generic OIDC say so explicitly; GitHub only returns a
      // verified primary address, and Entra addresses belong to the tenant.
      if (profile && profile.email_verified === false) return false;
      return (await roleFor(user.email, account?.provider)) !== null;
    },
    async jwt({ token, account }) {
      if (account) token.provider = account.provider;
      const role = await roleFor(token.email, token.provider);
      // No role any more: end the session rather than serve a stale one.
      if (!role) return null;
      token.role = role;
      return token;
    },
    session({ session, token }) {
      session.user.role = isRole(token.role) ? token.role : "viewer";
      return session;
    },
  },
});

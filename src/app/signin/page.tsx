import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth, authConfigured, signInOptions } from "@/auth";
import { safeCallback } from "@/lib/safe-redirect";

import { Brand } from "../../components/landing/Brand";
import { ThemeToggle } from "../../components/ThemeToggle";
import { signInWith } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

/** Auth.js error codes, said the way the person reading them needs to hear. */
const ERRORS: Record<string, string> = {
  AccessDenied:
    "That account isn't on this deployment's access list. Ask an administrator to add your address or your organisation's domain.",
  Configuration:
    "Sign-in is misconfigured on the server. An administrator needs to check the identity provider settings.",
  Verification: "That sign-in link has expired or was already used. Start again below.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);
  const configured = authConfigured();

  if (configured && (await auth())) redirect(callbackUrl);

  const errorCode = typeof params.error === "string" ? params.error : null;
  const error = errorCode
    ? (ERRORS[errorCode] ?? "Sign-in didn't complete. Try again, or use another provider.")
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-ng-bg">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-xl border border-ng-border bg-ng-surface p-6 shadow-ng-md sm:p-8">
          <h1 className="text-ng-2xl font-bold tracking-tight text-ng-primary">
            Sign in to the console
          </h1>
          <p className="mt-1.5 text-ng-base leading-relaxed text-ng-secondary">
            Use your organisation account. Access is limited to people your administrator has
            added.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-md border border-ng-danger-bd bg-ng-danger-bg px-3 py-2.5 text-ng-sm leading-snug text-ng-danger-tx"
            >
              {error}
            </p>
          ) : null}

          {configured ? (
            <div className="mt-6 flex flex-col gap-2.5">
              {signInOptions.map((provider) => (
                <form key={provider.id} action={signInWith}>
                  <input type="hidden" name="provider" value={provider.id} />
                  <input type="hidden" name="callbackUrl" value={callbackUrl} />
                  <button
                    type="submit"
                    className="flex h-11 w-full items-center justify-center rounded-md border border-ng-border bg-ng-raised px-4 text-ng-base font-semibold text-ng-primary transition-colors hover:border-ng-accent hover:bg-ng-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
                  >
                    Continue with {provider.name}
                  </button>
                </form>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-md border border-ng-warning-bd bg-ng-warning-bg px-3 py-3 text-ng-sm leading-snug text-ng-warning-tx">
              <p className="font-semibold">Sign-in isn&apos;t set up for this deployment yet.</p>
              <p className="mt-1">
                An administrator needs to set <code className="font-mono">AUTH_SECRET</code> and at
                least one identity provider. Until then the console stays closed.
              </p>
            </div>
          )}

          <p className="mt-6 flex items-start gap-2 text-ng-sm leading-snug text-ng-secondary">
            <ShieldCheck size={16} className="mt-px shrink-0 text-ng-accent" aria-hidden />
            Every run you start and every gate you decide is recorded under your name.
          </p>
        </div>
      </main>
    </div>
  );
}

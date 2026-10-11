import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth, authConfigured } from "@/auth";

import App from "../../App";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Operator Console" };

/**
 * The console, behind sign-in.
 *
 * The gate is here, on the server, before any of the client shell is sent:
 * an anonymous visitor gets a redirect, not a console that renders and then
 * discovers every API call is refused.
 */
export default async function ConsolePage() {
  if (!authConfigured()) redirect("/signin");

  const session = await auth();
  const email = session?.user?.email;
  if (!session || !email) redirect("/signin?callbackUrl=/console");

  return (
    <App viewer={{ name: session.user.name ?? null, email, role: session.user.role }} />
  );
}

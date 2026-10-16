"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { safeCallback } from "@/lib/safe-redirect";

export async function signInWith(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  await signIn(provider, { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

/**
 * Sign in as the shared demo account for one role.
 *
 * A credentials sign-in that fails throws here rather than redirecting, so the
 * failure is sent back to the sign-in page to be explained like any other.
 */
export async function signInAsDemo(formData: FormData) {
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  try {
    await signIn("demo", { role: String(formData.get("role") ?? ""), redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/signin?${new URLSearchParams({ error: error.type, callbackUrl })}`);
    }
    // The successful sign-in's redirect travels as a thrown error too.
    throw error;
  }
}

export async function signOutOfConsole() {
  await signOut({ redirectTo: "/" });
}

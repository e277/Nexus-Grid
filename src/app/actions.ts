"use server";

import { signIn, signOut } from "@/auth";
import { safeCallback } from "@/lib/safe-redirect";

export async function signInWith(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  await signIn(provider, { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signOutOfConsole() {
  await signOut({ redirectTo: "/" });
}

"use server";

import { signOut } from "@/lib/auth";

/** Used by the header form. `signOut` throws the redirect, which must propagate. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

// Sign-in with Supabase. Only @illinois.edu Google accounts get in; the database refuses the rest
// (see supabase/001_accounts.sql), so nothing here has to be trusted to enforce that.

import { createClient, type User } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Null when this copy of the site has no Supabase settings, e.g. a fresh clone without a .env.local file. */
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null;

export async function currentUser(): Promise<User | null> {
  if (supabase === null) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Sends the browser to Google, which returns to `returnTo` after sign-in. */
export async function signInWithGoogle(returnTo: string): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // `hd` asks Google to show the student's Illinois account first. The real check is in the database.
    options: { redirectTo: returnTo, queryParams: { hd: "illinois.edu", prompt: "select_account" } },
  });
  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function deleteMyAccount(): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    throw error;
  }
  // The account is gone on the server; clear the copy of the session saved in this browser.
  await supabase.auth.signOut({ scope: "local" });
}

/** The name Google gave, falling back to the start of the email address. */
export function fullName(user: User): string {
  const name = user.user_metadata?.full_name;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : (user.email ?? "").split("@")[0];
}

export function firstName(user: User): string {
  return fullName(user).split(/\s+/)[0];
}

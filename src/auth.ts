// Sign-in with Supabase. Only @illinois.edu Google accounts get in; the database refuses the rest
// (see supabase/001_accounts.sql), so nothing here has to be trusted to enforce that.

import { createClient, type User } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** Null when this copy of the site has no sign-in settings, e.g. a fresh clone without a .env.local file. */
export const supabase = url && publishableKey && googleClientId ? createClient(url, publishableKey) : null;

export async function currentUser(): Promise<User | null> {
  if (supabase === null) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/**
 * Draws Google's own sign-in button in `container`. Google signs the student in right on this page and
 * hands back a signed ID token, which Supabase checks. Because Supabase never sends the browser to Google
 * itself, Google's screen names this site instead of supabase.co. `onSignIn` gets null once signed in.
 */
export async function renderGoogleButton(container: HTMLElement, onSignIn: (error: Error | null) => void): Promise<void> {
  if (supabase === null || !googleClientId) {
    return;
  }
  await loadGoogleScript();
  // Google puts a hash of the nonce inside the token and Supabase compares it with the original,
  // so a token Google issued for some other sign-in can't be replayed here.
  const nonce = crypto.randomUUID();
  google.accounts.id.initialize({
    client_id: googleClientId,
    nonce: await sha256Hex(nonce),
    // Asks Google to offer the student's Illinois account first. The real check is in the database.
    hd: "illinois.edu",
    callback: ({ credential }) => {
      void supabase.auth
        .signInWithIdToken({ provider: "google", token: credential, nonce })
        .then(({ error }) => onSignIn(error), onSignIn);
    },
  });
  google.accounts.id.renderButton(container, { theme: "outline", size: "large", text: "signin_with", shape: "rectangular" });
}

let googleScript: Promise<void> | undefined;

function loadGoogleScript(): Promise<void> {
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScript = undefined;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.append(script);
  });
  return googleScript;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

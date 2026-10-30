// The Account page: sign in with an Illinois Google account, sign out, or delete the account.

import type { User } from "@supabase/supabase-js";
import { currentUser, deleteMyAccount, fullName, signInWithGoogle, signOut, supabase } from "./auth.ts";
import { element } from "./eventList.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const PRIMARY_BUTTON = "rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const DANGER_BUTTON = "rounded-sm border border-error px-4 py-2.5 font-semibold text-error disabled:opacity-60";

async function showAccount(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(heading("Accounts aren't set up"), paragraph("This copy of the site has no sign-in settings."));
    return;
  }
  // Supabase sends people back here with an error when sign-in fails, e.g. a non-Illinois account.
  const signInError = readSignInError();
  const user = await currentUser();
  content.replaceChildren(...(user ? signedIn(user) : signedOut(signInError)));
}

function signedOut(signInError: string | null): HTMLElement[] {
  const button = element("button", `mt-6 ${PRIMARY_BUTTON}`, "Sign in with Google");
  button.type = "button";
  const status = element("p", "mt-3 text-error", "");
  status.setAttribute("role", "status");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Opening Google…";
    try {
      await signInWithGoogle(pageUrlWithoutQuery());
    } catch {
      button.disabled = false;
      button.textContent = "Sign in with Google";
      status.textContent = "Couldn't start sign-in. Check your connection and try again.";
    }
  });

  return [
    heading("Sign in"),
    ...(signInError ? [element("p", "mt-4 font-semibold text-error", signInError)] : []),
    paragraph("Sign in with your @illinois.edu Google account. Other Google accounts can't sign in."),
    paragraph("Accounts are optional: everything on the site works without one. Saving events, following clubs, and submitting events are coming next."),
    button,
    status,
    privacyNote(),
  ];
}

function signedIn(user: User): HTMLElement[] {
  const signOutButton = element("button", `mt-6 ${PRIMARY_BUTTON}`, "Sign out");
  signOutButton.type = "button";
  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    await signOut();
    window.location.reload();
  });

  const deleteButton = element("button", `mt-3 ${DANGER_BUTTON}`, "Delete my account");
  deleteButton.type = "button";
  const deleteStatus = element("p", "mt-3 text-error", "");
  deleteStatus.setAttribute("role", "status");
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm("Delete your account? Your name and email will be removed. This can't be undone.")) {
      return;
    }
    deleteButton.disabled = true;
    try {
      await deleteMyAccount();
      content.replaceChildren(heading("Your account was deleted"), paragraph("Your name and email have been removed."));
    } catch {
      deleteButton.disabled = false;
      deleteStatus.textContent = "Couldn't delete your account. Check your connection and try again.";
    }
  });

  return [
    heading("Your account"),
    element("p", "mt-4 text-lg font-semibold", fullName(user)),
    element("p", "text-muted", user.email ?? ""),
    signOutButton,
    element("h2", "mt-10 font-display text-lg font-bold", "Delete account"),
    paragraph("Removes your name and email from the site for good."),
    deleteButton,
    deleteStatus,
    privacyNote(),
  ];
}

/** The error Supabase put in the address after a failed sign-in, removed from the address once read. */
function readSignInError(): string | null {
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  const description = params.get("error_description");
  if (description === null && params.get("error") === null) {
    return null;
  }
  window.history.replaceState(null, "", pageUrlWithoutQuery());
  if (description?.includes("Only @illinois.edu")) {
    return "Only @illinois.edu accounts can sign in. Choose your Illinois account and try again.";
  }
  // Supabase's own wording, so a problem can be reported and fixed. Shown as plain text, never as HTML.
  return `Sign-in didn't work. Please try again. (Details: ${description ?? params.get("error")})`;
}

function pageUrlWithoutQuery(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function heading(text: string): HTMLElement {
  return element("h1", "mt-8 font-display text-xl leading-tight font-bold", text);
}

function paragraph(text: string): HTMLElement {
  return element("p", "mt-3", text);
}

function privacyNote(): HTMLElement {
  const note = element("p", "mt-10 text-sm text-muted", "We store only your name and email. ");
  const link = element("a", "underline decoration-line underline-offset-3 hover:decoration-current", "Privacy");
  link.href = "./privacy.html";
  note.append(link);
  return note;
}

setUpPage();
void showAccount();

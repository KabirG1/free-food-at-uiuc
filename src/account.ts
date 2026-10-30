// The Account page: sign in with an Illinois Google account, or, once signed in, the account settings.

import type { User } from "@supabase/supabase-js";
import { currentUser, deleteMyAccount, fullName, renderGoogleButton, signOut, supabase } from "./auth.ts";
import { element } from "./dom.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const PRIMARY_BUTTON = "rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const DANGER_BUTTON = "rounded-sm border border-error px-4 py-2.5 font-semibold text-error disabled:opacity-60";

async function showAccount(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(heading("Accounts aren't set up"), paragraph("This copy of the site has no sign-in settings."));
    return;
  }
  const user = await currentUser();
  content.replaceChildren(...(user ? signedIn(user) : signedOut()));
}

function signedOut(): HTMLElement[] {
  // Google draws its own button inside this box once its script loads.
  const buttonBox = element("div", "mt-6 min-h-11", "");
  const loading = element("p", "text-muted", "Loading sign-in…");
  buttonBox.append(loading);
  const status = element("p", "mt-3 text-error", "");
  status.setAttribute("role", "status");
  renderGoogleButton(buttonBox, (error) => {
    if (error) {
      status.textContent = signInErrorMessage(error);
    } else {
      // Reload so the menu shows the student's name too.
      window.location.reload();
    }
  })
    .then(() => loading.remove())
    .catch(() => {
      loading.remove();
      status.textContent = "Couldn't load Google sign-in. Check your connection and reload the page.";
    });

  return [
    heading("Sign in"),
    paragraph("Sign in with your @illinois.edu Google account. Other Google accounts can't sign in."),
    paragraph("Accounts are optional: everything on the site works without one. Signing in lets you save events and see them on any device. Following clubs and submitting events are coming next."),
    buttonBox,
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
    if (!window.confirm("Delete your account? Your name, email, and saved events will be removed. This can't be undone.")) {
      return;
    }
    deleteButton.disabled = true;
    try {
      await deleteMyAccount();
      content.replaceChildren(heading("Your account was deleted"), paragraph("Your name, email, and saved events have been removed."));
    } catch {
      deleteButton.disabled = false;
      deleteStatus.textContent = "Couldn't delete your account. Check your connection and try again.";
    }
  });

  return [
    heading("Account settings"),
    element("p", "mt-4 text-lg font-semibold", fullName(user)),
    element("p", "text-muted", user.email ?? ""),
    signOutButton,
    element("h2", "mt-10 font-display text-lg font-bold", "Delete account"),
    paragraph("Removes your name, email, and saved events from the site for good."),
    deleteButton,
    deleteStatus,
    privacyNote(),
  ];
}

function signInErrorMessage(error: Error): string {
  if (error.message.includes("Only @illinois.edu")) {
    return "Only @illinois.edu accounts can sign in. Choose your Illinois account and try again.";
  }
  // Supabase's own wording, so a problem can be reported and fixed. Shown as plain text, never as HTML.
  return `Sign-in didn't work. Please try again. (Details: ${error.message})`;
}

function heading(text: string): HTMLElement {
  return element("h1", "mt-8 font-display text-xl leading-tight font-bold", text);
}

function paragraph(text: string): HTMLElement {
  return element("p", "mt-3", text);
}

function privacyNote(): HTMLElement {
  const note = element("p", "mt-10 text-sm text-muted", "We store only your name, email, and the events you save. ");
  const link = element("a", "underline decoration-line underline-offset-3 hover:decoration-current", "Privacy");
  link.href = "./privacy.html";
  note.append(link);
  return note;
}

setUpPage();
void showAccount();

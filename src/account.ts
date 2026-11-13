// The Account page: sign in with an Illinois Google account, or, once signed in, the account settings.

import type { User } from "@supabase/supabase-js";
import { announce } from "./announce.ts";
import { currentUser, deleteMyAccount, fullName, renderGoogleButton, signOut, supabase } from "./auth.ts";
import { describePlan, planSize } from "./calendarPlan.ts";
import { element } from "./dom.ts";
import {
  calendarAccessForTap,
  calendarErrorMessage,
  connectCalendar,
  disconnectCalendar,
  loadCalendarConnection,
  prepareCalendarAccess,
  requestCalendarAccess,
  setIncludeFollowed,
  syncCalendar,
} from "./googleCalendar.ts";
import { CALENDAR_NAME } from "./googleCalendarApi.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const PRIMARY_BUTTON = "rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const SECONDARY_BUTTON = "rounded-sm border border-selected px-4 py-2.5 font-semibold disabled:opacity-60";
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
    paragraph("Accounts are optional: everything on the site works without one. Signing in lets you save events, see them on any device, and submit events you know about."),
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
    const calendar = await loadCalendarConnection().catch(() => null);
    // Deleting the account can't reach Google, so the calendar would stay behind.
    const calendarNote = calendar === null ? "" : ` Your “${CALENDAR_NAME}” Google calendar will stay; to delete it, turn off Google Calendar first.`;
    if (!window.confirm(`Delete your account? Your name, email, saved events, and followed clubs will be removed. This can't be undone.${calendarNote}`)) {
      return;
    }
    deleteButton.disabled = true;
    try {
      await deleteMyAccount();
      content.replaceChildren(heading("Your account was deleted"), paragraph("Your name, email, saved events, and followed clubs have been removed."));
      announce("Your account was deleted.");
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
    calendarSection(),
    element("h2", "mt-10 font-display text-lg font-bold", "Delete account"),
    paragraph("Removes your name, email, saved events, and followed clubs from the site for good."),
    deleteButton,
    deleteStatus,
    privacyNote(),
  ];
}

/** An on/off switch with its label, for the Google Calendar settings. */
function renderSwitch(id: string, labelText: string): { row: HTMLElement; toggle: HTMLButtonElement } {
  const row = element("div", "mt-4 flex items-center justify-between gap-4", "");
  const label = element("label", "cursor-pointer font-semibold", labelText);
  label.id = `${id}-label`;
  label.htmlFor = id;
  const toggle = element(
    "button",
    "group relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full bg-muted transition-colors aria-checked:bg-selected disabled:cursor-default disabled:opacity-60",
    "",
  );
  toggle.id = id;
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", "false");
  toggle.setAttribute("aria-labelledby", label.id);
  toggle.disabled = true;
  const knob = element("span", "absolute top-0.5 left-0.5 size-6 rounded-full bg-page transition-transform group-aria-checked:translate-x-5", "");
  knob.setAttribute("aria-hidden", "true");
  toggle.append(knob);
  row.append(label, toggle);
  return { row, toggle };
}

function isOn(toggle: HTMLButtonElement): boolean {
  return toggle.getAttribute("aria-checked") === "true";
}

/**
 * The Google Calendar settings: a switch for Google Calendar itself, off until the student turns it on, and
 * once it's on, a second switch for adding followed clubs' events. Turning Google Calendar on asks Google for
 * permission and creates the calendar; turning it off asks first, then deletes the calendar. Each switch only
 * changes once that has worked, so it always shows what the calendar really holds.
 */
function calendarSection(): HTMLElement {
  const section = element("section", "", "");
  const main = renderSwitch("calendar-switch", "Add saved events to Google Calendar");
  const explanation = paragraph(
    `Adds the events you save to a calendar called “${CALENDAR_NAME}” in your Google Calendar, and removes them when you unsave them. The site can only see and change that one calendar, never your other events.`,
  );
  const note = element("p", "mt-3 text-sm text-muted", "Checking whether Google Calendar is connected…");
  const status = statusLine("", "success");
  const showStatus = (text: string, kind: "success" | "error") => {
    status.textContent = text;
    status.className = statusClass(kind);
  };

  // Shown only while Google Calendar is on.
  const extras = element("div", "", "");
  extras.hidden = true;
  const followed = renderSwitch("followed-switch", "Also add events from clubs I follow");
  const followedNote = element(
    "p",
    "mt-2 text-sm text-muted",
    "Adds every upcoming event from the clubs you follow. Unfollowing a club removes its events, except ones you saved.",
  );
  const update = element("button", `mt-6 cursor-pointer ${SECONDARY_BUTTON}`, "Update Google Calendar");
  update.type = "button";
  const updateNote = element(
    "p",
    "mt-2 text-sm text-muted",
    "Adds anything missing, updates events that changed, and removes ones you no longer need. Happens on its own when you save or follow.",
  );
  extras.append(followed.row, followedNote, update, updateNote);

  // Turning off deletes the calendar, so it asks first, on the page: a browser popup could use up the tap
  // Google's window needs to open.
  const confirmBox = element("div", "mt-4 border-y border-line py-4", "");
  confirmBox.hidden = true;
  const confirmButton = element("button", `cursor-pointer ${DANGER_BUTTON}`, "Delete calendar and turn off");
  confirmButton.type = "button";
  const cancelButton = element("button", `cursor-pointer ${SECONDARY_BUTTON}`, "Cancel");
  cancelButton.type = "button";
  const confirmButtons = element("div", "mt-3 flex flex-wrap gap-3", "");
  confirmButtons.append(confirmButton, cancelButton);
  confirmBox.append(
    element("p", "", `Turning this off deletes the “${CALENDAR_NAME}” calendar and its events from your Google Calendar. Your saved events stay saved here.`),
    confirmButtons,
  );

  const showSettings = (connected: boolean, includeFollowed: boolean) => {
    main.toggle.setAttribute("aria-checked", String(connected));
    main.toggle.disabled = false;
    followed.toggle.setAttribute("aria-checked", String(includeFollowed));
    followed.toggle.disabled = false;
    extras.hidden = !connected;
    confirmBox.hidden = true;
    note.textContent = connected
      ? ""
      : "Off. Google asks for permission when you turn it on. Afterwards, a Google window may briefly open when you save an event.";
  };

  main.toggle.addEventListener("click", async () => {
    if (isOn(main.toggle)) {
      confirmBox.hidden = false;
      confirmButton.focus();
      return;
    }
    // First, while the tap still counts, so Google's window is allowed to open.
    const access = requestCalendarAccess(true);
    main.toggle.disabled = true;
    note.textContent = "Connecting… Allow access in Google's window.";
    showStatus("", "success");
    try {
      const added = (await connectCalendar(access)).add.length;
      showSettings(true, false);
      showStatus(added === 0 ? "Connected. Events you save from now on will be added." : `Connected. Added ${countText(added)} you saved.`, "success");
    } catch (error) {
      showSettings(false, false);
      showStatus(calendarErrorMessage(error, "Couldn't connect Google Calendar."), "error");
    }
  });

  followed.toggle.addEventListener("click", async () => {
    const include = !isOn(followed.toggle);
    const access = requestCalendarAccess();
    followed.toggle.disabled = true;
    showStatus(include ? "Adding events from clubs you follow…" : "Removing events from clubs you follow…", "success");
    try {
      const plan = await setIncludeFollowed(access, include);
      showSettings(true, include);
      showStatus(
        include
          ? plan.add.length === 0
            ? "On. Clubs you follow have no upcoming events to add right now."
            : `On. Added ${countText(plan.add.length)} from clubs you follow.`
          : `Off. Removed ${countText(plan.remove.length)} from clubs you follow. Events you saved stay.`,
        "success",
      );
    } catch (error) {
      showSettings(true, !include);
      showStatus(calendarErrorMessage(error, "Couldn't change that setting."), "error");
    }
  });

  cancelButton.addEventListener("click", () => {
    confirmBox.hidden = true;
    main.toggle.focus();
  });

  confirmButton.addEventListener("click", async () => {
    const access = requestCalendarAccess();
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    main.toggle.disabled = true;
    confirmButton.textContent = "Turning off…";
    try {
      await disconnectCalendar(access);
      showSettings(false, false);
      showStatus(`Turned off. The “${CALENDAR_NAME}” calendar was deleted.`, "success");
    } catch (error) {
      main.toggle.disabled = false;
      showStatus(calendarErrorMessage(error, "Couldn't turn off Google Calendar."), "error");
    }
    confirmButton.disabled = false;
    cancelButton.disabled = false;
    confirmButton.textContent = "Delete calendar and turn off";
  });

  update.addEventListener("click", async () => {
    const access = calendarAccessForTap();
    update.disabled = true;
    update.textContent = "Updating…";
    try {
      const plan = await syncCalendar(access);
      if (plan === null) {
        throw new Error("Google Calendar isn't connected");
      }
      showStatus(planSize(plan) === 0 ? "Google Calendar was already up to date." : `Updated Google Calendar: ${describePlan(plan)}.`, "success");
    } catch (error) {
      showStatus(calendarErrorMessage(error, "Couldn't update Google Calendar."), "error");
    }
    update.disabled = false;
    update.textContent = "Update Google Calendar";
  });

  loadCalendarConnection().then(
    (found) => {
      showSettings(found !== null, found?.includeFollowed ?? false);
      // Loaded now so Google's window can open the moment a switch is pressed.
      prepareCalendarAccess().catch(() => undefined);
    },
    () => {
      note.textContent = "";
      showStatus("Couldn't check whether Google Calendar is connected. Refresh the page to try again.", "error");
    },
  );

  section.append(element("h2", "mt-10 font-display text-lg font-bold", "Google Calendar"), main.row, explanation, note, confirmBox, extras, status);
  return section;
}

function countText(count: number): string {
  return `${count} ${count === 1 ? "event" : "events"}`;
}

function statusClass(kind: "success" | "error"): string {
  return `mt-3 ${kind === "error" ? "text-error" : "font-semibold"}`;
}

function statusLine(text: string, kind: "success" | "error"): HTMLElement {
  const line = element("p", statusClass(kind), text);
  line.setAttribute("role", "status");
  return line;
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
  const note = element("p", "mt-10 text-sm text-muted", "We store only your name, email, the events you save or submit, the clubs you follow, and which Google calendar the site made for you if you connect one. ");
  const link = element("a", "underline decoration-line underline-offset-3 hover:decoration-current", "Privacy");
  link.href = "./privacy.html";
  note.append(link);
  return note;
}

setUpPage();
void showAccount();

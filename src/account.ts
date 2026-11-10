// The Account page: sign in with an Illinois Google account, or, once signed in, the account settings.

import type { User } from "@supabase/supabase-js";
import { currentUser, deleteMyAccount, fullName, renderGoogleButton, signOut, supabase } from "./auth.ts";
import { element } from "./dom.ts";
import { loadEventsFile } from "./eventList.ts";
import { savedEventsToShow, type FoodEvent } from "./events.ts";
import {
  addSavedEventsAgain,
  calendarErrorMessage,
  connectCalendar,
  disconnectCalendar,
  loadCalendarConnection,
  prepareCalendarAccess,
  requestCalendarAccess,
} from "./googleCalendar.ts";
import { CALENDAR_NAME } from "./googleCalendarApi.ts";
import { setUpPage } from "./layout.ts";
import { loadSavedEvents } from "./savedEvents.ts";

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
    const calendarId = await loadCalendarConnection().catch(() => null);
    // Deleting the account can't reach Google, so the calendar would stay behind.
    const calendarNote = calendarId === null ? "" : ` Your “${CALENDAR_NAME}” Google calendar will stay; to delete it, turn off Google Calendar first.`;
    if (!window.confirm(`Delete your account? Your name, email, saved events, and followed clubs will be removed. This can't be undone.${calendarNote}`)) {
      return;
    }
    deleteButton.disabled = true;
    try {
      await deleteMyAccount();
      content.replaceChildren(heading("Your account was deleted"), paragraph("Your name, email, saved events, and followed clubs have been removed."));
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

/**
 * The Google Calendar setting: a switch, off until the student turns it on. Turning it on asks Google for
 * permission and creates the calendar; turning it off asks first, then deletes the calendar. The switch only
 * changes once that has worked, so it always shows whether the calendar is really connected.
 */
function calendarSection(): HTMLElement {
  const section = element("section", "", "");
  const labelId = "calendar-switch-label";
  const row = element("div", "mt-4 flex items-center justify-between gap-4", "");
  const label = element("label", "cursor-pointer font-semibold", "Add saved events to Google Calendar");
  label.id = labelId;
  label.htmlFor = "calendar-switch";
  const toggle = element(
    "button",
    "group relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full bg-muted transition-colors aria-checked:bg-selected disabled:cursor-default disabled:opacity-60",
    "",
  );
  toggle.id = "calendar-switch";
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", "false");
  toggle.setAttribute("aria-labelledby", labelId);
  toggle.disabled = true;
  const knob = element("span", "absolute top-0.5 left-0.5 size-6 rounded-full bg-page transition-transform group-aria-checked:translate-x-5", "");
  knob.setAttribute("aria-hidden", "true");
  toggle.append(knob);
  row.append(label, toggle);

  const explanation = paragraph(
    `Adds the events you save to a calendar called “${CALENDAR_NAME}” in your Google Calendar, and removes them when you unsave them. The site can only see and change that one calendar, never your other events.`,
  );
  const note = element("p", "mt-3 text-sm text-muted", "Checking whether Google Calendar is connected…");
  const status = statusLine("", "success");
  const showStatus = (text: string, kind: "success" | "error") => {
    status.textContent = text;
    status.className = statusClass(kind);
  };

  // Shown only while it's on, for events missed while Google couldn't be reached.
  const addAgain = element("button", `mt-4 cursor-pointer ${SECONDARY_BUTTON}`, "Add saved events again");
  addAgain.type = "button";
  addAgain.hidden = true;

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

  const setOn = (on: boolean) => {
    toggle.setAttribute("aria-checked", String(on));
    toggle.disabled = false;
    addAgain.hidden = !on;
    confirmBox.hidden = true;
    note.textContent = on
      ? "If an event is missing, for example one saved while Google couldn't be reached, add your saved events again."
      : "Off. Google asks for permission when you turn it on. Afterwards, a Google window may briefly open when you save an event.";
  };

  toggle.addEventListener("click", async () => {
    if (toggle.getAttribute("aria-checked") === "true") {
      confirmBox.hidden = false;
      confirmButton.focus();
      return;
    }
    // First, while the tap still counts, so Google's window is allowed to open.
    const access = requestCalendarAccess(true);
    toggle.disabled = true;
    note.textContent = "Connecting… Allow access in Google's window.";
    showStatus("", "success");
    try {
      const events = await upcomingSavedEvents();
      await connectCalendar(access, events);
      setOn(true);
      showStatus(events.length === 0 ? "Connected. Events you save from now on will be added." : `Connected. Added ${countText(events.length)} you saved.`, "success");
    } catch (error) {
      setOn(false);
      showStatus(calendarErrorMessage(error, "Couldn't connect Google Calendar."), "error");
    }
  });

  cancelButton.addEventListener("click", () => {
    confirmBox.hidden = true;
    toggle.focus();
  });

  confirmButton.addEventListener("click", async () => {
    const access = requestCalendarAccess();
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    toggle.disabled = true;
    confirmButton.textContent = "Turning off…";
    try {
      await disconnectCalendar(access);
      setOn(false);
      showStatus(`Turned off. The “${CALENDAR_NAME}” calendar was deleted.`, "success");
    } catch (error) {
      toggle.disabled = false;
      showStatus(calendarErrorMessage(error, "Couldn't turn off Google Calendar."), "error");
    }
    confirmButton.disabled = false;
    cancelButton.disabled = false;
    confirmButton.textContent = "Delete calendar and turn off";
  });

  addAgain.addEventListener("click", async () => {
    const access = requestCalendarAccess();
    addAgain.disabled = true;
    addAgain.textContent = "Adding…";
    try {
      const events = await upcomingSavedEvents();
      await addSavedEventsAgain(access, events);
      showStatus(events.length === 0 ? "You have no upcoming saved events to add." : `Added ${countText(events.length)} to Google Calendar.`, "success");
    } catch (error) {
      showStatus(calendarErrorMessage(error, "Couldn't add your saved events."), "error");
    }
    addAgain.disabled = false;
    addAgain.textContent = "Add saved events again";
  });

  loadCalendarConnection().then(
    (calendarId) => {
      setOn(calendarId !== null);
      // Loaded now so Google's window can open the moment the switch is pressed.
      prepareCalendarAccess().catch(() => undefined);
    },
    () => {
      note.textContent = "";
      showStatus("Couldn't check whether Google Calendar is connected. Refresh the page to try again.", "error");
    },
  );

  section.append(element("h2", "mt-10 font-display text-lg font-bold", "Google Calendar"), row, explanation, note, addAgain, confirmBox, status);
  return section;
}

/** The student's saved events that haven't ended, using the latest listing where there is one. */
async function upcomingSavedEvents(): Promise<FoodEvent[]> {
  const saved = (await loadSavedEvents()) ?? [];
  return savedEventsToShow(saved, await loadEventsFile(), new Date()).map(({ event }) => event);
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

// Google Calendar sync: connecting a student's Google Calendar and keeping the "Free Food @ UIUC" calendar in
// step with their saved events. Google gives the page short-lived access (about an hour), kept only in this
// browser tab; nothing that unlocks a student's calendar is stored on our side. The account code is loaded only
// when needed, so the star button can use this without slowing down the event list.

import type { FoodEvent } from "./events.ts";
import {
  addCalendarEvent,
  CalendarApiError,
  createCalendar,
  deleteCalendar,
  removeCalendarEvent,
} from "./googleCalendarApi.ts";
import { googleClientId, loadGoogleScript } from "./googleScript.ts";

const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const ACCESS_KEY = "google-calendar-access";

/** The connected calendar's ID, null when not connected, or undefined until it has been looked up. */
let knownCalendarId: string | null | undefined;
let connection: Promise<string | null> | undefined;

/** The signed-in student's "Free Food @ UIUC" calendar ID, or null when they haven't connected one. Looked up once per page. */
export function loadCalendarConnection(): Promise<string | null> {
  connection ??= fetchConnection().then(
    (calendarId) => (knownCalendarId = calendarId),
    (error: unknown) => {
      connection = undefined;
      throw error;
    },
  );
  return connection;
}

async function fetchConnection(): Promise<string | null> {
  const { currentUser, supabase } = await import("./auth.ts");
  if (supabase === null || !googleClientId || (await currentUser()) === null) {
    return null;
  }
  const { data, error } = await supabase.from("google_calendars").select("calendar_id").maybeSingle();
  if (error) {
    throw error;
  }
  return typeof data?.calendar_id === "string" ? data.calendar_id : null;
}

function rememberConnection(calendarId: string | null): void {
  knownCalendarId = calendarId;
  connection = Promise.resolve(calendarId);
}

// Access saved for this tab only, so moving between pages doesn't ask Google again. Storage can be blocked
// (private windows, strict settings); then access is simply asked for again.
function storedAccess(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ACCESS_KEY) ?? "null") as { token?: unknown; expiresAt?: unknown } | null;
    // A minute's margin, so access doesn't run out partway through a request.
    if (typeof saved?.token === "string" && typeof saved.expiresAt === "number" && saved.expiresAt > Date.now() + 60_000) {
      return saved.token;
    }
  } catch {
    // Treated as no saved access.
  }
  return null;
}

function storeAccess(token: string, expiresInSeconds: number): void {
  try {
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresInSeconds * 1000 }));
  } catch {
    // Access is asked for again next time.
  }
}

function forgetAccess(): void {
  try {
    sessionStorage.removeItem(ACCESS_KEY);
  } catch {
    // Nothing was saved.
  }
}

let tokenClient: google.accounts.oauth2.TokenClient | undefined;
let pendingAccess: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined;

function settleAccess(result: { token: string } | { error: string }): void {
  const pending = pendingAccess;
  pendingAccess = undefined;
  if ("token" in result) {
    pending?.resolve(result.token);
  } else {
    pending?.reject(new Error(result.error));
  }
}

/** Loads Google's script ahead of a tap that needs it, so Google's window can open during the tap. */
export async function prepareCalendarAccess(): Promise<void> {
  if (tokenClient !== undefined || !googleClientId) {
    return;
  }
  const { currentUser } = await import("./auth.ts");
  const user = await currentUser();
  await loadGoogleScript();
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: googleClientId,
    scope: SCOPE,
    // Picks the student's Illinois account instead of asking which Google account to use.
    login_hint: user?.email,
    callback: (response) => {
      if (response.error || !google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
        settleAccess({ error: response.error ?? "access_denied" });
        return;
      }
      storeAccess(response.access_token, Number(response.expires_in));
      settleAccess({ token: response.access_token });
    },
    error_callback: (error) => settleAccess({ error: error.type }),
  });
}

/**
 * Short-lived access to the student's calendar. Call it straight from a tap, before any `await`: when Google
 * needs to open its window, browsers only allow that during a tap. `askPermission` shows Google's permission
 * screen even if the student already allowed it, for the Connect button.
 */
export function requestCalendarAccess(askPermission = false): Promise<string> {
  const saved = askPermission ? null : storedAccess();
  if (saved !== null) {
    return Promise.resolve(saved);
  }
  const client = tokenClient;
  if (client === undefined) {
    // Tapped before Google's script finished loading. Its window may be blocked now; that shows as an error.
    return prepareCalendarAccess().then(() => requestCalendarAccess(askPermission));
  }
  settleAccess({ error: "replaced" });
  return new Promise((resolve, reject) => {
    pendingAccess = { resolve, reject };
    client.requestAccessToken({ prompt: askPermission ? "consent" : "" });
  });
}

export interface CalendarAccess {
  token: string;
  calendarId: string;
}

/**
 * For a star tap: starts getting access when the student has connected Google Calendar, or resolves to null
 * when they haven't. Call it before any `await`, for the same reason as `requestCalendarAccess`.
 */
export function calendarAccessForTap(): Promise<CalendarAccess | null> {
  const withAccess = (calendarId: string | null) =>
    calendarId === null ? Promise.resolve(null) : requestCalendarAccess().then((token) => ({ token, calendarId }));
  const access = knownCalendarId === undefined ? loadCalendarConnection().then(withAccess) : withAccess(knownCalendarId);
  // The star may give up before using this (say, the save failed), so a failure here mustn't go unhandled.
  access.catch(() => undefined);
  return access;
}

/** Adds the event to the student's calendar, or removes it, after they save or unsave it. False when no calendar is connected. */
export async function syncSavedEvent(access: Promise<CalendarAccess | null>, event: FoodEvent, saved: boolean): Promise<boolean> {
  const calendar = await access;
  if (calendar === null) {
    return false;
  }
  try {
    await (saved
      ? addCalendarEvent(calendar.token, calendar.calendarId, event)
      : removeCalendarEvent(calendar.token, calendar.calendarId, event.id));
    return true;
  } catch (error) {
    // 401 means Google no longer accepts this access (it ran out, or the student withdrew it): ask afresh next time.
    if (error instanceof CalendarApiError && error.status === 401) {
      forgetAccess();
    }
    throw error;
  }
}

/** Adds each of `events` to the calendar, one at a time to stay well inside Google's limits. */
async function addEvents(token: string, calendarId: string, events: FoodEvent[]): Promise<void> {
  for (const event of events) {
    await addCalendarEvent(token, calendarId, event);
  }
}

/**
 * Creates the "Free Food @ UIUC" calendar, remembers it with the account, and adds `upcomingSaved` (the
 * student's saved events that haven't ended) to it.
 */
export async function connectCalendar(access: Promise<string>, upcomingSaved: FoodEvent[]): Promise<void> {
  const token = await access;
  const { supabase } = await import("./auth.ts");
  if (supabase === null) {
    throw new Error("Accounts aren't set up");
  }
  const calendarId = await createCalendar(token);
  const { error } = await supabase.from("google_calendars").insert({ calendar_id: calendarId });
  if (error) {
    // Don't leave behind a calendar the site has no record of.
    await deleteCalendar(token, calendarId).catch(() => undefined);
    throw error;
  }
  rememberConnection(calendarId);
  await addEvents(token, calendarId, upcomingSaved);
}

/** Adds `upcomingSaved` to the connected calendar again, filling in any that are missing. */
export async function addSavedEventsAgain(access: Promise<string>, upcomingSaved: FoodEvent[]): Promise<void> {
  const token = await access;
  const calendarId = await loadCalendarConnection();
  if (calendarId === null) {
    throw new Error("Google Calendar isn't connected");
  }
  await addEvents(token, calendarId, upcomingSaved);
}

/** Deletes the "Free Food @ UIUC" calendar, forgets it, and gives up the site's access to Google Calendar. */
export async function disconnectCalendar(access: Promise<string>): Promise<void> {
  const token = await access;
  const calendarId = await loadCalendarConnection();
  const { currentUser, supabase } = await import("./auth.ts");
  const user = await currentUser();
  if (supabase === null || user === null) {
    throw new Error("Not signed in");
  }
  if (calendarId !== null) {
    await deleteCalendar(token, calendarId);
  }
  const { error } = await supabase.from("google_calendars").delete().eq("user_id", user.id);
  if (error) {
    throw error;
  }
  rememberConnection(null);
  forgetAccess();
  google.accounts.oauth2.revoke(token);
}

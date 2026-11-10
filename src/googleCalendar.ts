// Google Calendar sync: connecting a student's Google Calendar and keeping the "Free Food @ UIUC" calendar in
// step with their saved events and, if they choose, the events of clubs they follow. Every change (a star,
// a Follow, a switch, an update button) runs the same sync: work out what the calendar should hold
// (src/calendarPlan.ts), make those changes in Google, and record them in `calendar_events`.
//
// Google gives the page short-lived access (about an hour), kept only in this browser tab; nothing that unlocks
// a student's calendar is stored on our side. The account code is loaded only when needed, so the star and
// Follow buttons can use this without slowing down the event list.

import { planCalendar, type CalendarPlan, type CalendarRecord } from "./calendarPlan.ts";
import { addCalendarEvent, CalendarApiError, createCalendar, deleteCalendar, removeCalendarEvent } from "./googleCalendarApi.ts";
import { googleClientId, loadGoogleScript } from "./googleScript.ts";

const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const ACCESS_KEY = "google-calendar-access";

export interface CalendarConnection {
  calendarId: string;
  /** "Also add events from clubs I follow" is on. */
  includeFollowed: boolean;
}

/** The connection, null when not connected, or undefined until it has been looked up. */
let known: CalendarConnection | null | undefined;
let connection: Promise<CalendarConnection | null> | undefined;

/** The signed-in student's calendar connection, or null when they haven't connected one. Looked up once per page. */
export function loadCalendarConnection(): Promise<CalendarConnection | null> {
  connection ??= fetchConnection().then(
    (found) => (known = found),
    (error: unknown) => {
      connection = undefined;
      throw error;
    },
  );
  return connection;
}

async function fetchConnection(): Promise<CalendarConnection | null> {
  const { currentUser, supabase } = await import("./auth.ts");
  if (supabase === null || !googleClientId || (await currentUser()) === null) {
    return null;
  }
  const { data, error } = await supabase.from("google_calendars").select("calendar_id, include_followed").maybeSingle();
  if (error) {
    throw error;
  }
  return typeof data?.calendar_id === "string" ? { calendarId: data.calendar_id, includeFollowed: data.include_followed === true } : null;
}

function rememberConnection(found: CalendarConnection | null): void {
  known = found;
  connection = Promise.resolve(found);
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

/** On pages with stars or Follow buttons: gets Google's script ready when a calendar is connected. */
export function prepareIfConnected(): void {
  loadCalendarConnection()
    .then((found) => (found === null ? undefined : prepareCalendarAccess()))
    .catch(() => undefined);
}

/**
 * Short-lived access to the student's calendar. Call it straight from a tap, before any `await`: when Google
 * needs to open its window, browsers only allow that during a tap. `askPermission` shows Google's permission
 * screen even if the student already allowed it, for turning Google Calendar on.
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
 * For a tap that may change the calendar: starts getting access when the student has connected Google Calendar,
 * or resolves to null when there's nothing to do. `forFollowing` is for Follow and Unfollow, which only matter
 * with "Also add events from clubs I follow" on. Call it before any `await`, like `requestCalendarAccess`.
 */
export function calendarAccessForTap(forFollowing = false): Promise<CalendarAccess | null> {
  const withAccess = (found: CalendarConnection | null) =>
    found === null || (forFollowing && !found.includeFollowed)
      ? Promise.resolve(null)
      : requestCalendarAccess().then((token) => ({ token, calendarId: found.calendarId }));
  const access = known === undefined ? loadCalendarConnection().then(withAccess) : withAccess(known);
  // The tap may give up before using this (say, the save failed), so a failure here mustn't go unhandled.
  access.catch(() => undefined);
  return access;
}

async function loadCalendarRecords(): Promise<CalendarRecord[]> {
  const [{ supabase }, { isFoodEvent }] = await Promise.all([import("./auth.ts"), import("./savedEvents.ts")]);
  if (supabase === null) {
    return [];
  }
  const { data, error } = await supabase.from("calendar_events").select("event, marked_cancelled");
  if (error) {
    throw error;
  }
  return data
    .filter((row) => isFoodEvent(row.event))
    .map((row) => ({ event: row.event, markedCancelled: row.marked_cancelled === true }));
}

/** What needs to change in the connected calendar right now. Empty when it isn't connected. */
export async function currentCalendarPlan(): Promise<CalendarPlan> {
  const found = await loadCalendarConnection();
  if (found === null) {
    return { add: [], update: [], remove: [] };
  }
  const [{ loadSavedEvents }, followedClubs, { loadEventsFile }] = await Promise.all([
    import("./savedEvents.ts"),
    import("./followedClubs.ts"),
    import("./eventList.ts"),
  ]);
  const [inCalendar, saved, data] = await Promise.all([loadCalendarRecords(), loadSavedEvents(), loadEventsFile()]);
  if (found.includeFollowed) {
    await followedClubs.loadFollowedClubs();
  }
  return planCalendar({
    inCalendar,
    saved: saved ?? [],
    followedClubs: found.includeFollowed ? followedClubs.followedClubKeys() : new Set(),
    data,
    now: new Date(),
  });
}

/** Makes the changes in `plan`, one at a time to stay well inside Google's limits, recording each as it's done. */
async function applyPlan(calendar: CalendarAccess, plan: CalendarPlan): Promise<void> {
  const { supabase } = await import("./auth.ts");
  if (supabase === null) {
    return;
  }
  for (const { event, maybeCancelled } of [...plan.add, ...plan.update]) {
    await addCalendarEvent(calendar.token, calendar.calendarId, event, maybeCancelled);
    const { error } = await supabase
      .from("calendar_events")
      .upsert({ event_id: event.id, event, ends_at: event.end, marked_cancelled: maybeCancelled });
    if (error) {
      throw error;
    }
  }
  for (const event of plan.remove) {
    await removeCalendarEvent(calendar.token, calendar.calendarId, event.id);
    const { error } = await supabase.from("calendar_events").delete().eq("event_id", event.id);
    if (error) {
      throw error;
    }
  }
}

/**
 * Brings the calendar up to date. Resolves to null when there was nothing to do because Google Calendar isn't
 * connected (or, for a Follow tap, followed clubs aren't included), otherwise to what was changed.
 */
export async function syncCalendar(access: Promise<CalendarAccess | null>): Promise<CalendarPlan | null> {
  const calendar = await access;
  if (calendar === null) {
    return null;
  }
  try {
    const plan = await currentCalendarPlan();
    await applyPlan(calendar, plan);
    return plan;
  } catch (error) {
    // 401 means Google no longer accepts this access (it ran out, or the student withdrew it): ask afresh next time.
    if (error instanceof CalendarApiError && error.status === 401) {
      forgetAccess();
    }
    throw error;
  }
}

/** What to tell the student when something with Google Calendar failed. `start` says what didn't work. */
export function calendarErrorMessage(error: unknown, start: string): string {
  const reason = error instanceof Error ? error.message : "";
  if (reason === "popup_closed" || reason === "access_denied") {
    return `${start} Google's window closed before access was allowed. If Google said the app is blocked, your Illinois account doesn't allow it.`;
  }
  if (reason === "popup_failed_to_open") {
    return `${start} Your browser blocked Google's window. Allow pop-ups for this site and try again.`;
  }
  if (error instanceof CalendarApiError && (error.status === 401 || error.status === 403)) {
    // Google's reason, as plain text, so the cause (such as the Calendar API being turned off) can be fixed.
    return `${start} Google didn't accept the site's access. Try again, and allow access if Google asks.${error.reason === "" ? "" : ` (Google said: ${error.reason})`}`;
  }
  // The technical reason, so a problem can be reported and fixed. Shown as plain text, never as HTML.
  return `${start} Check your connection and try again.${reason === "" ? "" : ` (Details: ${reason})`}`;
}

/** Creates the "Free Food @ UIUC" calendar, remembers it with the account, and adds the student's saved events. */
export async function connectCalendar(access: Promise<string>): Promise<CalendarPlan> {
  const token = await access;
  const { currentUser, supabase } = await import("./auth.ts");
  const user = await currentUser();
  if (supabase === null || user === null) {
    throw new Error("Not signed in");
  }
  const calendarId = await createCalendar(token);
  const { error } = await supabase.from("google_calendars").insert({ calendar_id: calendarId });
  if (error) {
    // Don't leave behind a calendar the site has no record of.
    await deleteCalendar(token, calendarId).catch(() => undefined);
    throw error;
  }
  // Anything recorded from an earlier connection belonged to a calendar that's gone.
  const { error: clearError } = await supabase.from("calendar_events").delete().eq("user_id", user.id);
  if (clearError) {
    throw clearError;
  }
  rememberConnection({ calendarId, includeFollowed: false });
  return (await syncCalendar(Promise.resolve({ token, calendarId })))!;
}

/**
 * Turns "Also add events from clubs I follow" on or off, then adds or removes those events. If the calendar
 * can't be updated, the setting goes back to how it was, so the switch matches the calendar.
 */
export async function setIncludeFollowed(access: Promise<string>, include: boolean): Promise<CalendarPlan> {
  const token = await access;
  const found = await loadCalendarConnection();
  const { supabase } = await import("./auth.ts");
  if (found === null || supabase === null) {
    throw new Error("Google Calendar isn't connected");
  }
  const save = async (value: boolean) => {
    const { error } = await supabase.from("google_calendars").update({ include_followed: value }).eq("calendar_id", found.calendarId);
    if (error) {
      throw error;
    }
    rememberConnection({ ...found, includeFollowed: value });
  };
  await save(include);
  try {
    return (await syncCalendar(Promise.resolve({ token, calendarId: found.calendarId })))!;
  } catch (error) {
    await save(found.includeFollowed).catch(() => undefined);
    throw error;
  }
}

/** Deletes the "Free Food @ UIUC" calendar, forgets it, and gives up the site's access to Google Calendar. */
export async function disconnectCalendar(access: Promise<string>): Promise<void> {
  const token = await access;
  const found = await loadCalendarConnection();
  const { currentUser, supabase } = await import("./auth.ts");
  const user = await currentUser();
  if (supabase === null || user === null) {
    throw new Error("Not signed in");
  }
  if (found !== null) {
    await deleteCalendar(token, found.calendarId);
  }
  for (const table of ["calendar_events", "google_calendars"]) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) {
      throw error;
    }
  }
  rememberConnection(null);
  forgetAccess();
  google.accounts.oauth2.revoke(token);
}

// Calls to the Google Calendar API for the "Free Food @ UIUC" calendar. The site's permission
// (calendar.app.created) only reaches calendars the site created, so none of this can touch a student's other events.

import { CAMPUS_TIME_ZONE, describeFood, type FoodEvent } from "./events.ts";
import { isPrivateLocation } from "./location.ts";

const API = "https://www.googleapis.com/calendar/v3";

export const CALENDAR_NAME = "Free Food @ UIUC";

/**
 * A request Google refused. `status` is the HTTP status, e.g. 401 when the access has run out, and `reason`
 * is Google's explanation when it gave one, so problems can be reported and fixed.
 */
export class CalendarApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason = "",
  ) {
    super(reason === "" ? `Google Calendar answered ${status}` : `${status}: ${reason}`);
  }
}

/** Google's explanation from an error response, e.g. "Google Calendar API has not been used in project … or it is disabled". */
async function refusal(response: Response): Promise<CalendarApiError> {
  let reason = "";
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    reason = typeof body.error?.message === "string" ? body.error.message.slice(0, 500) : "";
  } catch {
    // No explanation given.
  }
  return new CalendarApiError(response.status, reason);
}

/**
 * The Google event ID for one of our events. Google only allows the characters 0-9 and a-v, so the ID is
 * written out in hexadecimal. The same event always gets the same ID, so unsaving knows which one to delete.
 */
export function googleEventId(eventId: string): string {
  const hex = Array.from(new TextEncoder().encode(eventId), (byte) => byte.toString(16).padStart(2, "0")).join("");
  // Google wants at least 5 characters; the prefix keeps even a one-letter ID long enough.
  return `ff${hex}`;
}

/** What goes into Google Calendar for `event`. Google treats it as plain text, so scraped text can't add links or markup. */
export function googleEventBody(event: FoodEvent): Record<string, unknown> {
  const privateLocation = isPrivateLocation(event.location);
  const details = [
    event.club.trim() === "" ? "" : `Hosted by ${event.club}`,
    `Food: ${describeFood(event)}`,
    privateLocation ? "Location: shown after signing in to OneIllinois" : "",
    event.url,
  ].filter((line) => line !== "");
  const footer = `Added by ${CALENDAR_NAME} because you saved it. Unsave it on the site to remove it.`;
  return {
    id: googleEventId(event.id),
    summary: event.title,
    ...(privateLocation || event.location.trim() === "" ? {} : { location: event.location }),
    description: `${details.join("\n")}\n\n${footer}`,
    start: { dateTime: event.start },
    end: { dateTime: event.end },
    // Brings back an event that was removed earlier (see addCalendarEvent).
    status: "confirmed",
    ...(event.url === "" ? {} : { source: { title: "Event page", url: event.url } }),
  };
}

async function callApi(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Already gone counts as done when deleting: the student may have removed it in Google Calendar themselves. */
function isGone(response: Response): boolean {
  return response.status === 404 || response.status === 410;
}

/** Creates the "Free Food @ UIUC" calendar and returns its ID. */
export async function createCalendar(token: string): Promise<string> {
  const response = await callApi(token, "POST", "/calendars", {
    summary: CALENDAR_NAME,
    description: "Free-food events you saved on Free Food @ UIUC.",
    timeZone: CAMPUS_TIME_ZONE,
  });
  if (!response.ok) {
    throw await refusal(response);
  }
  const { id } = (await response.json()) as { id?: unknown };
  if (typeof id !== "string" || id === "") {
    throw new CalendarApiError(response.status, "Google didn't return the new calendar's ID");
  }
  return id;
}

export async function deleteCalendar(token: string, calendarId: string): Promise<void> {
  const response = await callApi(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}`);
  if (!response.ok && !isGone(response)) {
    throw await refusal(response);
  }
}

export async function addCalendarEvent(token: string, calendarId: string, event: FoodEvent): Promise<void> {
  const body = googleEventBody(event);
  const events = `/calendars/${encodeURIComponent(calendarId)}/events`;
  let response = await callApi(token, "POST", events, body);
  if (response.status === 409) {
    // Google keeps a deleted event's ID, so saving an event again after unsaving it updates the old one back.
    response = await callApi(token, "PUT", `${events}/${body.id}`, body);
  }
  if (!response.ok) {
    throw await refusal(response);
  }
}

export async function removeCalendarEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  const response = await callApi(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId(eventId)}`);
  if (!response.ok && !isGone(response)) {
    throw await refusal(response);
  }
}

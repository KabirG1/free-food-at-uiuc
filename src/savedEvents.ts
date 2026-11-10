// Saved events in Supabase (see supabase/002_saved_events.sql). The database only lets each student read
// and change their own rows, so nothing here has to be trusted to keep accounts apart.

import { currentUser, supabase } from "./auth.ts";
import type { SavedRecord } from "./calendarChanges.ts";
import { isEventLink, type FoodEvent } from "./events.ts";

let savedRecords: Promise<SavedRecord[] | null> | undefined;

/**
 * The signed-in student's saved events, with what's known about their Google Calendar copies, or null when
 * nobody is signed in. Loaded once per page, so the stars and the Saved page share one request.
 */
export function loadSavedRecords(): Promise<SavedRecord[] | null> {
  savedRecords ??= fetchSavedRecords().catch((error: unknown) => {
    savedRecords = undefined;
    throw error;
  });
  return savedRecords;
}

/** The signed-in student's saved events, or null when nobody is signed in. */
export async function loadSavedEvents(): Promise<FoodEvent[] | null> {
  return (await loadSavedRecords())?.map((record) => record.event) ?? null;
}

async function fetchSavedRecords(): Promise<SavedRecord[] | null> {
  if (supabase === null || (await currentUser()) === null) {
    return null;
  }
  const { data, error } = await supabase.from("saved_events").select("event, calendar_marked_cancelled");
  if (error) {
    throw error;
  }
  return data
    .filter((row) => isFoodEvent(row.event))
    .map((row) => ({ event: row.event as FoodEvent, markedCancelled: row.calendar_marked_cancelled === true }));
}

/** Stores the latest copy of a saved event once Google Calendar has it, so it isn't reported as changed again. */
export async function updateSavedCopy(event: FoodEvent, markedCancelled: boolean): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase
    .from("saved_events")
    .update({ event, ends_at: event.end, calendar_marked_cancelled: markedCancelled })
    .eq("event_id", event.id);
  if (error) {
    throw error;
  }
  // The copy loaded earlier on this page is now out of date.
  savedRecords = undefined;
}

export async function saveEvent(event: FoodEvent): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.from("saved_events").insert({ event_id: event.id, event, ends_at: event.end });
  // 23505 means it's already saved, e.g. from another tab, which is what the student wanted anyway.
  if (error && error.code !== "23505") {
    throw error;
  }
  savedRecords = undefined;
}

export async function unsaveEvent(eventId: string): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.from("saved_events").delete().eq("event_id", eventId);
  if (error) {
    throw error;
  }
  // Reloaded when next needed, so the calendar update after a tap doesn't put this event back.
  savedRecords = undefined;
}

/** Checks a saved copy still has the shape the page needs before showing it. */
function isFoodEvent(value: unknown): value is FoodEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  const textFields = ["id", "source", "club", "title", "start", "end", "location", "eventType", "url"];
  return (
    textFields.every((field) => typeof event[field] === "string") &&
    isEventLink(event.url) &&
    !Number.isNaN(Date.parse(event.start as string)) &&
    !Number.isNaN(Date.parse(event.end as string)) &&
    Array.isArray(event.foodMentions) &&
    event.foodMentions.every((mention) => typeof mention === "string")
  );
}

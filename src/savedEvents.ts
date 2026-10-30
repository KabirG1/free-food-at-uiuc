// Saved events in Supabase (see supabase/002_saved_events.sql). The database only lets each student read
// and change their own rows, so nothing here has to be trusted to keep accounts apart.

import { currentUser, supabase } from "./auth.ts";
import type { FoodEvent } from "./events.ts";

let savedEvents: Promise<FoodEvent[] | null> | undefined;

/**
 * The signed-in student's saved events, or null when nobody is signed in. Loaded once per page, so the
 * stars and the Saved page share one request.
 */
export function loadSavedEvents(): Promise<FoodEvent[] | null> {
  savedEvents ??= fetchSavedEvents().catch((error: unknown) => {
    savedEvents = undefined;
    throw error;
  });
  return savedEvents;
}

async function fetchSavedEvents(): Promise<FoodEvent[] | null> {
  if (supabase === null || (await currentUser()) === null) {
    return null;
  }
  const { data, error } = await supabase.from("saved_events").select("event");
  if (error) {
    throw error;
  }
  return data.map((row) => row.event).filter(isFoodEvent);
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
}

export async function unsaveEvent(eventId: string): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.from("saved_events").delete().eq("event_id", eventId);
  if (error) {
    throw error;
  }
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
    // The title links here, so only web addresses are allowed (never "javascript:" links).
    (event.url as string).startsWith("https://") &&
    !Number.isNaN(Date.parse(event.start as string)) &&
    !Number.isNaN(Date.parse(event.end as string)) &&
    Array.isArray(event.foodMentions) &&
    event.foodMentions.every((mention) => typeof mention === "string")
  );
}

// OneIllinois drops events from its feed once they end, so each fetch carries over today's
// finished events from the previous fetch. That lets the page still show what happened earlier today.

import { readFile } from "node:fs/promises";
import { campusDate, type EventsFile, type FoodEvent } from "../src/events.ts";

/**
 * Loads the events saved by the previous fetch: from `PREVIOUS_EVENTS_URL` when set (the live site, in GitHub Actions),
 * otherwise from the local file. Returns an empty list if there is no usable previous copy.
 */
export async function loadPreviousEvents(localPath: string): Promise<FoodEvent[]> {
  try {
    const url = process.env.PREVIOUS_EVENTS_URL;
    let text: string;
    if (url) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      text = await response.text();
    } else {
      text = await readFile(localPath, "utf8");
    }
    const file = JSON.parse(text) as Partial<EventsFile>;
    // Files saved before event types were added have no eventType; treat it as unknown.
    return Array.isArray(file.events)
      ? file.events.filter(isFoodEvent).map((event) => ({ ...event, eventType: event.eventType ?? "" }))
      : [];
  } catch (error) {
    console.log("No previous events to carry over:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Today's events from the previous fetch that have ended and are no longer in the feed.
 * An event that vanished before its end time was probably cancelled, so it isn't kept.
 */
export function endedEventsToKeep(fresh: FoodEvent[], previous: FoodEvent[], now: Date): FoodEvent[] {
  const freshIds = new Set(fresh.map((event) => event.id));
  const today = campusDate(now);
  return previous.filter(
    (event) =>
      !freshIds.has(event.id) && campusDate(new Date(event.start)) === today && Date.parse(event.end) <= now.getTime(),
  );
}

/** Checks a saved event has the expected fields, since the previous file comes from outside this run. */
function isFoodEvent(value: unknown): value is FoodEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  const textFields = ["id", "source", "club", "title", "start", "end", "location", "url"];
  return (
    textFields.every((field) => typeof event[field] === "string" && event[field] !== "") &&
    !Number.isNaN(Date.parse(event.start as string)) &&
    !Number.isNaN(Date.parse(event.end as string)) &&
    (event.url as string).startsWith("https://") &&
    (event.eventType === undefined || typeof event.eventType === "string") &&
    Array.isArray(event.foodMentions) &&
    event.foodMentions.every((word) => typeof word === "string")
  );
}

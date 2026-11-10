// Searching the saved events: every word typed must appear in the event's name, club, location, type, or food.

import { eventsNotEnded, type FoodEvent } from "./events.ts";
import { isPrivateLocation } from "./location.ts";

/** Longer searches are cut to this many characters. */
export const MAX_QUERY_LENGTH = 100;

/** The words to look for, in lowercase. Empty for a blank search. */
export function searchWords(query: string): string[] {
  return query
    .slice(0, MAX_QUERY_LENGTH)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
}

function searchableText(event: FoodEvent): string {
  // "Private location (sign in to display)" isn't a place, so searching "sign" shouldn't match every hidden location.
  const location = isPrivateLocation(event.location) ? "" : event.location;
  return [event.title, event.club, location, event.eventType, ...event.foodMentions].join("\n").toLowerCase();
}

/** The events that haven't ended by `now` and contain every word of `query`, earliest first. None for a blank search. */
export function searchEvents(events: FoodEvent[], query: string, now: Date): FoodEvent[] {
  const words = searchWords(query);
  if (words.length === 0) {
    return [];
  }
  return eventsNotEnded(events, now)
    .filter((event) => {
      const text = searchableText(event);
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

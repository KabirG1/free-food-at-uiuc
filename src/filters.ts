// Narrowing the list by kind of food, time of day, and event type. Nothing here is saved between visits.

import { CAMPUS_TIME_ZONE, type FoodEvent } from "./events.ts";

export type FoodKind = "meal" | "snack";

/** A span of the day in minutes after midnight, Champaign time. `to` is not included. */
export interface TimeRange {
  from: number;
  to: number;
}

export interface Filters {
  food: FoodKind | null;
  time: TimeRange | null;
  eventType: string | null;
}

export const NO_FILTERS: Filters = { food: null, time: null, eventType: null };

export const TIME_PRESETS = {
  morning: { label: "Morning", range: { from: 0, to: 12 * 60 } },
  afternoon: { label: "Afternoon", range: { from: 12 * 60, to: 17 * 60 } },
  evening: { label: "Evening", range: { from: 17 * 60, to: 24 * 60 } },
} as const;

// Food words from the listings, sorted into a real meal or a snack. Words like "free food" say nothing about which.
const MEAL_WORDS = new Set(["pizza", "tacos", "breakfast", "lunch", "dinner", "catered"]);
const SNACK_WORDS = new Set(["snacks", "refreshments", "cookies", "donuts", "boba"]);

/** Whether the event has a meal, snacks, or both. When the listing doesn't say, it counts as both so it isn't hidden. */
export function foodKinds(event: FoodEvent): Set<FoodKind> {
  const kinds = new Set<FoodKind>();
  for (const word of event.foodMentions) {
    if (MEAL_WORDS.has(word)) {
      kinds.add("meal");
    }
    if (SNACK_WORDS.has(word)) {
      kinds.add("snack");
    }
  }
  return kinds.size > 0 ? kinds : new Set<FoodKind>(["meal", "snack"]);
}

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Minutes after midnight in Champaign for an ISO time, e.g. 6:30 PM is 1110. */
export function campusMinutes(time: string): number {
  const parts = clockFormat.formatToParts(new Date(time));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

/** True when the event and the range share at least one minute. */
export function overlapsTimeRange(event: FoodEvent, range: TimeRange): boolean {
  const start = campusMinutes(event.start);
  // Measuring the length from the start keeps events that run past midnight from wrapping around.
  const end = start + Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000);
  return start < range.to && end > range.from;
}

export function matchesFilters(event: FoodEvent, filters: Filters): boolean {
  return (
    (filters.food === null || foodKinds(event).has(filters.food)) &&
    (filters.time === null || overlapsTimeRange(event, filters.time)) &&
    (filters.eventType === null || event.eventType === filters.eventType)
  );
}

export function activeFilterCount(filters: Filters): number {
  return [filters.food, filters.time, filters.eventType].filter((value) => value !== null).length;
}

/** "HH:MM" from a time input as minutes after midnight, or null if it isn't a valid time. */
export function parseClockTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** The distinct event types among `events`, alphabetically, for the event type menu. */
export function eventTypesIn(events: FoodEvent[]): string[] {
  return [...new Set(events.map((event) => event.eventType).filter((type) => type !== ""))].sort();
}

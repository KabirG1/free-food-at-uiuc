// The shape every source turns its data into, and the file the page reads.
// Shared by the fetch script (which writes it) and the page (which shows it).

export interface FoodEvent {
  id: string;
  source: string;
  club: string;
  title: string;
  /** ISO 8601 start time, with time zone offset. */
  start: string;
  /** ISO 8601 end time, with time zone offset. */
  end: string;
  location: string;
  /** Food words found in the listing, such as "pizza". Empty if the event is only flagged as having food. */
  foodMentions: string[];
  url: string;
}

export interface EventsFile {
  /** The day these events are for, as YYYY-MM-DD in Champaign's time zone. */
  date: string;
  /** ISO 8601 time the file was written. */
  generatedAt: string;
  events: FoodEvent[];
  /** Sources that failed during this fetch, so the page can say so. */
  failedSources: string[];
}

export const CAMPUS_TIME_ZONE = "America/Chicago";

/** Returns the calendar date of `time` in Champaign as YYYY-MM-DD. */
export function campusDate(time: Date): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAMPUS_TIME_ZONE }).format(time);
}

/** Keeps the events that start on `date` (YYYY-MM-DD in Champaign), earliest first. */
export function eventsOnDate(events: FoodEvent[], date: string): FoodEvent[] {
  return events
    .filter((event) => campusDate(new Date(event.start)) === date)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Keeps the events that have not ended by `now`, including ones already under way. */
export function eventsNotEnded(events: FoodEvent[], now: Date): FoodEvent[] {
  return events.filter((event) => Date.parse(event.end) > now.getTime());
}

/** Splits events into ones that have already started and ones starting later, keeping their order. */
export function splitByStarted(events: FoodEvent[], now: Date): { happeningNow: FoodEvent[]; laterToday: FoodEvent[] } {
  const started = (event: FoodEvent) => Date.parse(event.start) <= now.getTime();
  return { happeningNow: events.filter(started), laterToday: events.filter((event) => !started(event)) };
}

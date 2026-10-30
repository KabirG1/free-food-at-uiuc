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
  /** The first day of saved events (the day the file was written), as YYYY-MM-DD in Champaign's time zone. */
  date: string;
  /** ISO 8601 time the file was written. */
  generatedAt: string;
  events: FoodEvent[];
  /** Sources that failed during this fetch, so the page can say so. */
  failedSources: string[];
}

export const CAMPUS_TIME_ZONE = "America/Chicago";

/** How many days of events are saved and shown on the calendar, starting with today. */
export const DAYS_AHEAD = 14;

/** Returns the calendar date of `time` in Champaign as YYYY-MM-DD. */
export function campusDate(time: Date): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAMPUS_TIME_ZONE }).format(time);
}

/** Returns `count` consecutive dates starting at `start`, all as YYYY-MM-DD. */
export function datesFrom(start: string, count: number): string[] {
  // Counting in UTC from noon avoids daylight saving changes skipping or repeating a day.
  const first = Date.parse(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, day) => new Date(first + day * 86_400_000).toISOString().slice(0, 10));
}

/** Keeps the events that start on one of `dates` (YYYY-MM-DD in Champaign), earliest first. */
export function eventsOnDates(events: FoodEvent[], dates: string[]): FoodEvent[] {
  const wanted = new Set(dates);
  return events
    .filter((event) => wanted.has(campusDate(new Date(event.start))))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Keeps the events that start on `date` (YYYY-MM-DD in Champaign), earliest first. */
export function eventsOnDate(events: FoodEvent[], date: string): FoodEvent[] {
  return eventsOnDates(events, [date]);
}

/** The date asked for in the page address if it is one of `dates`, otherwise the first of `dates`. */
export function pickDate(requested: string | null, dates: string[]): string {
  return requested !== null && dates.includes(requested) ? requested : dates[0];
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

/** The first `limit` dates after `today` that have at least one event, earliest first. */
export function upcomingDates(events: FoodEvent[], today: string, limit: number): string[] {
  const dates = new Set(events.map((event) => campusDate(new Date(event.start))));
  // YYYY-MM-DD strings sort in date order.
  return [...dates].filter((date) => date > today).sort().slice(0, limit);
}

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
  /** The kind of event as the source labels it, such as "Meeting" or "Cultural". Empty if not given. */
  eventType: string;
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

/** Every date in `month` (YYYY-MM), as YYYY-MM-DD. */
export function datesInMonth(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  // Day 0 of the following month is the last day of this one.
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return datesFrom(`${month}-01`, length);
}

/** The dates whose events are saved and shown on the calendar: `today` through the end of next month. */
export function coveredDates(today: string): string[] {
  const [year, month] = today.split("-").map(Number);
  // Month numbers here start at 1 and Date.UTC's at 0, so `month` is the following month.
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  return [...datesInMonth(today.slice(0, 7)).filter((date) => date >= today), ...datesInMonth(nextMonth)];
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

export interface SavedEventToShow {
  event: FoodEvent;
  /** The event is gone from the latest list before it ended, so it may have been cancelled. */
  notListed: boolean;
}

/**
 * The saved events worth showing, earliest first. Uses the latest copy from `data` when the event is still
 * listed there (times and places can change), and leaves out events that have ended by `now`.
 * `data` is null when the saved list couldn't be loaded; the saved copies are shown as they are.
 */
export function savedEventsToShow(saved: FoodEvent[], data: EventsFile | null, now: Date): SavedEventToShow[] {
  const listed = new Map(data?.events.map((event) => [event.id, event]));
  const listedDates = new Set(data ? coveredDates(data.date) : []);
  return saved
    .map((savedCopy) => {
      const latest = listed.get(savedCopy.id);
      const notListed = latest === undefined && listedDates.has(campusDate(new Date(savedCopy.start)));
      return { event: latest ?? savedCopy, notListed };
    })
    .filter(({ event }) => Date.parse(event.end) > now.getTime())
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
}

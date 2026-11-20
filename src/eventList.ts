// Loading the saved events and showing a day's list. Shared by the Today and Calendar pages.

import { fetchApprovedSubmissions, parseApprovedSubmissions, withLiveSubmissions } from "./approvedSubmissions.ts";
import { clubPage, clubPageHref, loadClubPages } from "./clubPages.ts";
import { element } from "./dom.ts";
import {
  CAMPUS_TIME_ZONE,
  campusDate,
  describeFood,
  eventsNotEnded,
  eventsOnDate,
  splitByStarted,
  upcomingDates,
  type EventsFile,
  type FoodEvent,
} from "./events.ts";
import { renderFollowButton } from "./followButton.ts";
import { isPrivateLocation, mapLink } from "./location.ts";
import { renderSaveButton, savingAvailable } from "./saveButton.ts";

export const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

const LINK_CLASSES = "underline decoration-line decoration-1 underline-offset-3 hover:decoration-current";

const shortDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });

/** "Thursday, October 29" for a YYYY-MM-DD date. */
export function formatDay(date: string): string {
  // Noon UTC is the same calendar day in Champaign, whatever time zone the viewer is in.
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

/** "Thu 29 Oct" for a YYYY-MM-DD date. */
export function formatShortDay(date: string): string {
  const parts = shortDayFormat.formatToParts(new Date(`${date}T12:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/**
 * A day's heading, like a newspaper's front page: a small label ("Today"), the date in large dot-matrix letters,
 * and how many events have food. Screen readers hear the full date instead of the abbreviated one.
 */
export function renderDateBlock(date: string, label: string, count: number, headingTag: "h1" | "h2"): HTMLElement {
  const block = element("section", "mt-8 pb-2", "");
  const labelLine = element("p", "flex items-center gap-2 font-mono text-xs font-medium tracking-wide uppercase", "");
  labelLine.append(orangeSquare(), label);

  const heading = element(headingTag, "mt-3 font-dot text-3xl leading-none font-black uppercase sm:text-4xl", "");
  heading.id = "day-heading";
  block.setAttribute("aria-labelledby", heading.id);
  const shortDate = element("span", "", formatShortDay(date));
  shortDate.setAttribute("aria-hidden", "true");
  heading.append(shortDate, element("span", "sr-only", formatDay(date)));

  block.append(labelLine, heading);
  if (count > 0) {
    block.append(element("p", "mt-3 font-display text-xl leading-tight font-bold", `${count} ${count === 1 ? "event" : "events"} with free food`));
  }
  return block;
}

/**
 * Loads the saved events, with submitted and club-posted events read live from the database so they show as soon
 * as they're posted or taken down. Returns null if the saved events can't be reached. If the database can't be
 * reached, the saved copy of those events from the last scheduled fetch is used instead.
 */
export async function loadEventsFile(): Promise<EventsFile | null> {
  // Club pages load alongside, so club names in the lists can link to them.
  const [file, live] = await Promise.all([loadSavedEvents(), loadLiveSubmissions(), loadClubPages()]);
  return file !== null && live !== null ? withLiveSubmissions(file, live) : file;
}

async function loadSavedEvents(): Promise<EventsFile | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}events.json`, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch {
    return null;
  }
}

/** A few seconds at most, so a slow database never holds up the list for long. */
const LIVE_SUBMISSIONS_TIMEOUT_MS = 5_000;

async function loadLiveSubmissions(): Promise<FoodEvent[] | null> {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env;
  if (!url || !key) {
    return null;
  }
  try {
    return parseApprovedSubmissions(await fetchApprovedSubmissions(url, key, LIVE_SUBMISSIONS_TIMEOUT_MS));
  } catch {
    return null;
  }
}

/** The events for `date` that are still worth showing: on today's date, ones that have ended are left out. */
export function eventsStillOn(dayEvents: FoodEvent[], date: string, now: Date): FoodEvent[] {
  return date === campusDate(now) ? eventsNotEnded(dayEvents, now) : dayEvents;
}

/**
 * The list for one day. On today's date that's "Happening now" and "Later today", plus a collapsed
 * "Earlier today" list of events that have ended. Days with nothing left get a one-line note.
 * `filtered` says filters are on, so an empty day is explained as nothing matching rather than nothing listed.
 */
export function renderDay(dayEvents: FoodEvent[], date: string, now: Date, filtered = false): HTMLElement[] {
  const note = (text: string) => element("p", "mt-6 text-muted", text);
  const isToday = date === campusDate(now);
  if (dayEvents.length === 0 && filtered) {
    return [note(`No events ${isToday ? "today" : "on this day"} match your filters.`)];
  }
  if (!isToday) {
    return dayEvents.length > 0
      ? [renderSection(null, dayEvents)]
      : [note("No free food listed for this day. Clubs often post events only a few days ahead, so check back closer to the day.")];
  }
  if (dayEvents.length === 0) {
    return [note("No free food today.")];
  }
  const current = eventsNotEnded(dayEvents, now);
  const ended = dayEvents.filter((event) => !current.includes(event));
  const { happeningNow, laterToday } = splitByStarted(current, now);
  return [
    ...(happeningNow.length > 0 ? [renderSection("Happening now", happeningNow, true)] : []),
    ...(laterToday.length > 0 ? [renderSection("Later today", laterToday)] : []),
    ...(current.length === 0 ? [note("Today's free food is over.")] : []),
    ...(ended.length > 0 ? [renderEarlierToday(ended)] : []),
  ];
}

/** One heading and list per day, in date order, for the Search and Club pages. `events` is already sorted by start time. */
export function renderEventsByDay(events: FoodEvent[], today: string): HTMLElement[] {
  const days = new Map<string, FoodEvent[]>();
  for (const event of events) {
    const date = campusDate(new Date(event.start));
    days.set(date, [...(days.get(date) ?? []), event]);
  }
  return [...days].map(([date, dayEvents]) => {
    const section = element("section", "mt-8", "");
    section.append(
      element("h2", "font-display text-lg font-bold", date === today ? `Today, ${formatDay(date)}` : formatDay(date)),
      eventList(dayEvents, "mt-2"),
    );
    return section;
  });
}

/** The next few days that have events after `today`, each with its list, and a link to the calendar. */
export function renderComingUp(events: FoodEvent[], today: string): HTMLElement[] {
  const dates = upcomingDates(events, today, 3);
  if (dates.length === 0) {
    return [];
  }
  // Beside today's list on wide screens, so it lines up with that list's first heading.
  const section = element("section", "mt-10 lg:mt-8", "");
  section.append(sectionHeading("Coming up"));
  for (const date of dates) {
    section.append(element("h3", "mt-6 font-display text-lg font-bold", formatDay(date)), eventList(eventsOnDate(events, date), "mt-2"));
  }
  const calendarLink = element("a", `font-semibold ${LINK_CLASSES}`, "See more days on the calendar");
  calendarLink.href = "./calendar.html";
  const linkLine = element("p", "mt-5", "");
  linkLine.append(calendarLink);
  section.append(linkLine);
  return [section];
}

/** Ended events in a dropdown, closed at first, so they're there if wanted without crowding the list. */
function renderEarlierToday(ended: FoodEvent[]): HTMLElement {
  const dropdown = element("details", "mt-8", "");
  const summary = element("summary", "flex cursor-pointer list-none items-center gap-3 py-2", "");
  const chevron = element("span", "chevron shrink-0 text-muted", "");
  chevron.setAttribute("aria-hidden", "true");
  summary.append(sectionHeading(`Earlier today · ${ended.length} ${ended.length === 1 ? "event" : "events"}`, "span"), chevron);
  dropdown.append(summary, eventList(ended, "mt-2", { ended: true }));
  return dropdown;
}

/** A warning shown above the list when some sources couldn't be reached. */
export function renderSourceWarning(failedSources: string[]): HTMLElement[] {
  if (failedSources.length === 0) {
    return [];
  }
  return [element("p", "mt-6 text-error", `Couldn't reach ${failedSources.join(", ")}, so this list may be incomplete.`)];
}

export function renderMessage(heading: string, detail: string, kind: "empty" | "error"): HTMLElement {
  const block = element("div", "mt-10", "");
  block.append(
    element("h2", `font-display text-2xl leading-tight font-extrabold sm:text-3xl ${kind === "error" ? "text-error" : ""}`, heading),
    element("p", "mt-2 text-muted", detail),
  );
  return block;
}

export function lastCheckedText(data: EventsFile): string {
  return `Events from OneIllinois and student submissions, last checked at ${timeFormat.format(new Date(data.generatedAt))}.`;
}

function renderSection(heading: string | null, events: FoodEvent[], live = false): HTMLElement {
  const section = element("section", "mt-8", "");
  if (heading !== null) {
    section.append(sectionHeading(heading, "h2", live));
  }
  section.append(eventList(events, heading !== null ? "mt-2" : ""));
  return section;
}

/** A small label above a list. `live` adds an orange square, for events going on right now. */
function sectionHeading(text: string, tag: "h2" | "span" = "h2", live = false): HTMLElement {
  const heading = element(tag, "flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-ink uppercase", "");
  if (live) {
    heading.append(orangeSquare());
  }
  heading.append(text);
  return heading;
}

/** A small Illini Orange square used as a marker. Decorative, so screen readers skip it. */
export function orangeSquare(): HTMLElement {
  const square = element("span", "size-2 shrink-0 bg-brand-accent", "");
  square.setAttribute("aria-hidden", "true");
  return square;
}

interface ListOptions {
  /** The events are over: say "ended" instead of "to", and leave off the save star. */
  ended?: boolean;
  /** Events to mark as no longer listed, since they may be cancelled. */
  notListed?: Set<string>;
}

export function eventList(events: FoodEvent[], spacing: string, options: ListOptions = {}): HTMLUListElement {
  // A heavy rule on top, thin rules between events.
  const list = element("ul", `${spacing} divide-y divide-line border-t-2 border-b border-t-ink border-b-line`, "");
  list.append(...events.map((event) => renderEvent(event, options)));
  return list;
}

function renderEvent(event: FoodEvent, { ended = false, notListed }: ListOptions): HTMLLIElement {
  const showStar = savingAvailable && !ended;
  // On phones the times and star run across the top with the details below at full width, so long names
  // don't wrap onto many lines. Wider screens put the times in their own column, like a timetable.
  const item = element(
    "li",
    `grid gap-x-3 py-4 ${showStar ? "grid-cols-[1fr_auto] sm:grid-cols-[8rem_1fr_auto]" : "grid-cols-1 sm:grid-cols-[8rem_1fr]"}`,
    "",
  );

  const when = element("div", "col-start-1 row-start-1 flex items-baseline gap-3 sm:block", "");
  when.append(
    renderStartTime(new Date(event.start)),
    element("p", "font-mono text-xs text-muted uppercase sm:mt-2", `${ended ? "ended" : "to"} ${timeFormat.format(new Date(event.end))}`),
  );

  const food = element("p", "mt-2 flex items-baseline gap-2 font-semibold text-food", "");
  const marker = orangeSquare();
  marker.classList.add("translate-y-[-0.1em]");
  food.append(marker, describeFood(event));

  const details = element("div", "col-span-full row-start-2 mt-3 min-w-0 break-words sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mt-0", "");
  details.append(renderClub(event.club), renderTitle(event), renderLocation(event.location), food);
  if (notListed?.has(event.id)) {
    details.append(element("p", "mt-1 text-sm text-error", "No longer listed, so it may be cancelled."));
  }

  item.append(when, details);
  if (showStar) {
    const star = renderSaveButton(event);
    star.classList.add("col-start-2", "row-start-1", "sm:col-start-3");
    item.append(star);
  }
  return item;
}

/** "7:00" in large dot-matrix digits, with a small "PM" beside it. */
function renderStartTime(start: Date): HTMLElement {
  const parts = timeFormat.formatToParts(start);
  const period = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  const time = element("p", "font-dot text-2xl leading-none font-black whitespace-nowrap", hour);
  // Doto's colon looks like a small cross, so the colon comes from the monospace font.
  time.append(element("span", "font-mono font-medium", ":"), minute);
  if (period !== "") {
    // The space is in the monospace font too, since a dot-matrix space is very wide.
    time.append(element("span", "font-mono text-xs font-medium", ` ${period}`));
  }
  return time;
}

/**
 * The hosting club above the event's name, with a Follow button when accounts are set up. Clubs with a page (ones
 * that have managers) link to it.
 */
function renderClub(club: string): HTMLElement {
  const name = element("p", "mb-1 font-mono text-xs tracking-wide text-muted uppercase", "");
  if (club.trim() === "") {
    // Nothing to show, so no empty gap above the name either.
    name.hidden = true;
    return name;
  }
  if (clubPage(club)) {
    const link = element("a", `text-ink ${LINK_CLASSES}`, club);
    link.href = clubPageHref(club);
    name.append(link);
  } else {
    name.textContent = club;
  }
  if (!savingAvailable) {
    return name;
  }
  const line = element("div", "mb-1 flex flex-wrap items-center gap-x-3 gap-y-1", "");
  name.classList.remove("mb-1");
  line.append(name, renderFollowButton(club));
  return line;
}

/** The event's name, linked to its page. Submitted events may have no page, so the name is plain text. */
function renderTitle(event: FoodEvent): HTMLElement {
  if (event.url === "") {
    return element("span", "font-display text-lg leading-tight font-bold", event.title);
  }
  const link = element("a", `font-display text-lg leading-tight font-bold ${LINK_CLASSES}`, event.title);
  link.href = event.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderLocation(location: string): HTMLParagraphElement {
  const paragraph = element("p", "mt-1", "");
  const link = mapLink(location);
  if (link) {
    const anchor = element("a", LINK_CLASSES, location);
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    paragraph.append(anchor);
  } else if (isPrivateLocation(location)) {
    paragraph.className += " text-muted";
    paragraph.textContent = "Location shown after signing in to OneIllinois";
  } else {
    paragraph.textContent = location;
  }
  return paragraph;
}

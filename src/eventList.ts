// Loading the saved events and showing a day's list. Shared by the Today and Calendar pages.

import {
  CAMPUS_TIME_ZONE,
  campusDate,
  eventsNotEnded,
  eventsOnDate,
  splitByStarted,
  upcomingDates,
  type EventsFile,
  type FoodEvent,
} from "./events.ts";
import { isPrivateLocation, mapLink } from "./location.ts";

export const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

const LINK_CLASSES = "underline decoration-line decoration-1 underline-offset-3 hover:decoration-current";

/** "Thursday, October 29" for a YYYY-MM-DD date. */
export function formatDay(date: string): string {
  // Noon UTC is the same calendar day in Champaign, whatever time zone the viewer is in.
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

/** Loads the saved events, or returns null if they can't be reached. */
export async function loadEventsFile(): Promise<EventsFile | null> {
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
    ...(happeningNow.length > 0 ? [renderSection("Happening now", happeningNow)] : []),
    ...(laterToday.length > 0 ? [renderSection("Later today", laterToday)] : []),
    ...(current.length === 0 ? [note("Today's free food is over.")] : []),
    ...(ended.length > 0 ? [renderEarlierToday(ended)] : []),
  ];
}

/** The next few days that have events after `today`, each with its list, and a link to the calendar. */
export function renderComingUp(events: FoodEvent[], today: string): HTMLElement[] {
  const dates = upcomingDates(events, today, 3);
  if (dates.length === 0) {
    return [];
  }
  const section = element("section", "mt-10", "");
  section.append(sectionHeading("Coming up"));
  for (const date of dates) {
    section.append(element("h3", "mt-5 font-display font-bold", formatDay(date)), eventList(eventsOnDate(events, date), "mt-2"));
  }
  const calendarLink = element("a", `font-semibold ${LINK_CLASSES}`, "See the next two weeks on the calendar");
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
  dropdown.append(summary, eventList(ended, "mt-2", true));
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
    element("h2", `font-display text-xl leading-tight font-bold ${kind === "error" ? "text-error" : ""}`, heading),
    element("p", "mt-2 text-muted", detail),
  );
  return block;
}

export function lastCheckedText(data: EventsFile): string {
  return `Events from OneIllinois, last checked at ${timeFormat.format(new Date(data.generatedAt))}.`;
}

function renderSection(heading: string | null, events: FoodEvent[]): HTMLElement {
  const section = element("section", "mt-8", "");
  if (heading !== null) {
    section.append(sectionHeading(heading));
  }
  section.append(eventList(events, heading !== null ? "mt-2" : ""));
  return section;
}

function sectionHeading(text: string, tag: "h2" | "span" = "h2"): HTMLElement {
  return element(tag, "font-display text-sm font-bold tracking-wide text-muted uppercase", text);
}

function eventList(events: FoodEvent[], spacing: string, ended = false): HTMLUListElement {
  const list = element("ul", `${spacing} divide-y divide-line border-y border-line`, "");
  list.append(...events.map((event) => renderEvent(event, ended)));
  return list;
}

function renderEvent(event: FoodEvent, ended: boolean): HTMLLIElement {
  const item = element("li", "grid grid-cols-[6rem_1fr] gap-x-4 py-4", "");

  const when = element("div", "", "");
  when.append(
    element("p", "font-display text-lg leading-tight font-bold", timeFormat.format(new Date(event.start))),
    element("p", "mt-1 text-sm text-muted", `${ended ? "ended" : "to"} ${timeFormat.format(new Date(event.end))}`),
  );

  const details = element("div", "min-w-0", "");
  const title = element("a", `text-lg leading-tight font-semibold ${LINK_CLASSES}`, event.title);
  title.href = event.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  details.append(
    title,
    element("p", "mt-1 text-muted", event.club),
    renderLocation(event.location),
    element("p", "mt-2 font-semibold text-food", describeFood(event)),
  );

  item.append(when, details);
  return item;
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

/** "Pizza, boba" from the words found, or "Food provided" when the club only ticked the box. */
function describeFood(event: FoodEvent): string {
  if (event.foodMentions.length === 0) {
    return "Food provided";
  }
  const list = event.foodMentions.join(", ");
  return list.charAt(0).toUpperCase() + list.slice(1);
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

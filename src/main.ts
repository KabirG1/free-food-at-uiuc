// The Today page: today's free-food events, grouped into happening now and later today, then the next few days.

import { announce, eventCount } from "./announce.ts";
import { element } from "./dom.ts";
import { CAMPUS_TIME_ZONE, campusDate, eventsOnDate, type EventsFile } from "./events.ts";
import {
  eventsStillOn,
  formatDay,
  lastCheckedText,
  loadEventsFile,
  orangeSquare,
  renderComingUp,
  renderDay,
  renderMessage,
  renderSourceWarning,
} from "./eventList.ts";
import { renderFilterPanel, takeClubFromAddress } from "./filterPanel.ts";
import { followedClubKeys, onFollowedClubsChange } from "./followedClubs.ts";
import { activeFilterCount, clubsIn, eventTypesIn, matchesFilters, type Filters } from "./filters.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;
const updated = document.querySelector<HTMLElement>("#updated")!;

async function showToday(): Promise<void> {
  const data = await loadEventsFile();
  if (data === null) {
    content.replaceChildren(renderMessage("Couldn't load today's events", "Check your connection and refresh the page.", "error"));
    return;
  }

  // Today comes from the viewer's clock, so the right day shows even before the morning fetch runs.
  const now = new Date();
  const today = campusDate(now);
  const showing = eventsStillOn(eventsOnDate(data.events, today), today, now).length;
  updated.textContent = lastCheckedText(data);

  const results = element("div", "", "");
  const showResults = () => renderResults(results, data, filters, today, now);
  const { panel, filters: startingFilters } = renderFilterPanel(eventTypesIn(data.events), clubsIn(data.events), takeClubFromAddress(), (newFilters) => {
    filters = newFilters;
    const matching = showResults();
    announce(`${eventCount(matching)} today${activeFilterCount(filters) > 0 ? " match your filters" : ""}`);
  });
  let filters = startingFilters;
  content.replaceChildren(renderFrontPage(today, showing), panel, results);
  // With "Clubs I follow" on, following or unfollowing a club changes which events match.
  onFollowedClubsChange(() => {
    if (filters.followedOnly) {
      showResults();
    }
  });
  showResults();
}

const shortDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });

/** "Wed 18 Nov" for a YYYY-MM-DD date. */
function formatShortDay(date: string): string {
  // Noon UTC is the same calendar day in Champaign, whatever time zone the viewer is in.
  const parts = shortDayFormat.formatToParts(new Date(`${date}T12:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/**
 * The top of the page, like a newspaper's front page: today's date in large dot-matrix letters and how many events
 * still have food. Screen readers hear the full date instead of the abbreviated one.
 */
function renderFrontPage(today: string, showing: number): HTMLElement {
  const front = element("section", "mt-8 pb-2", "");
  front.setAttribute("aria-labelledby", "front-date");
  const label = element("p", "flex items-center gap-2 font-mono text-xs font-medium tracking-wide uppercase", "");
  label.append(orangeSquare(), "Today");

  const date = element("h2", "mt-3 font-dot text-3xl leading-none font-black uppercase sm:text-4xl", "");
  date.id = "front-date";
  const shortDate = element("span", "", formatShortDay(today));
  shortDate.setAttribute("aria-hidden", "true");
  date.append(shortDate, element("span", "sr-only", formatDay(today)));

  front.append(label, date);
  if (showing > 0) {
    front.append(element("p", "mt-3 font-display text-xl leading-tight font-bold", `${showing} ${showing === 1 ? "event" : "events"} with free food`));
  }
  return front;
}

/** Draws the events that match `filters`, and returns how many of today's are still on. */
function renderResults(results: HTMLElement, data: EventsFile, filters: Filters, today: string, now: Date): number {
  const followed = followedClubKeys();
  const events = data.events.filter((event) => matchesFilters(event, filters, followed));
  // On wide screens today's list and "Coming up" sit side by side; on phones they stack.
  const todayColumn = element("div", "", "");
  todayColumn.append(...renderDay(eventsOnDate(events, today), today, now, activeFilterCount(filters) > 0));
  const columns = element("div", "lg:grid lg:grid-cols-2 lg:items-start lg:gap-12", "");
  columns.append(todayColumn, ...renderComingUp(events, today));
  results.replaceChildren(...renderSourceWarning(data.failedSources), columns);
  return eventsStillOn(eventsOnDate(events, today), today, now).length;
}

setUpPage();
void showToday();

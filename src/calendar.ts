// The Calendar page: a month view of this month and next, where picking a day shows its free-food events.

import { element } from "./dom.ts";
import { CAMPUS_TIME_ZONE, campusDate, coveredDates, datesInMonth, eventsOnDate, pickDate, type EventsFile, type FoodEvent } from "./events.ts";
import { eventsStillOn, formatDay, lastCheckedText, loadEventsFile, renderDay, renderMessage, renderSourceWarning } from "./eventList.ts";
import { renderFilterPanel } from "./filterPanel.ts";
import { activeFilterCount, eventTypesIn, matchesFilters, NO_FILTERS, type Filters } from "./filters.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;
const updated = document.querySelector<HTMLElement>("#updated")!;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFormat = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, month: "long", year: "numeric" });

// Fixed markup, so building it from a string is safe.
const ARROW_SVG = {
  previous: `<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`,
  next: `<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`,
};

let data: EventsFile | null = null;
let filters: Filters = NO_FILTERS;
/** The month on screen, as YYYY-MM. The arrows change it without changing the chosen day. */
let shownMonth = "";
// The calendar and list below the filter panel; redrawn when the day, month, or filters change, while the panel stays put.
// Two columns on wide screens: the calendar on the left, the chosen day's list on the right.
const results = element("div", "lg:grid lg:grid-cols-[30rem_minmax(0,1fr)] lg:items-start lg:gap-12", "");

async function start(): Promise<void> {
  data = await loadEventsFile();
  if (data === null) {
    content.replaceChildren(renderMessage("Couldn't load events", "Check your connection and refresh the page.", "error"));
    return;
  }
  updated.textContent = lastCheckedText(data);
  const panel = renderFilterPanel(eventTypesIn(data.events), (newFilters) => {
    filters = newFilters;
    render();
  });
  content.replaceChildren(panel, results);
  showDayFromAddress();
  window.addEventListener("popstate", showDayFromAddress);
}

/** The chosen day: the one in the page address if it's on the calendar, otherwise today. */
function selectedDate(dates: string[]): string {
  return pickDate(new URLSearchParams(window.location.search).get("date"), dates);
}

/** Shows the day in the page address, turning the calendar to its month. */
function showDayFromAddress(): void {
  shownMonth = selectedDate(coveredDates(campusDate(new Date()))).slice(0, 7);
  render();
}

function render(): void {
  if (data === null) {
    return;
  }
  const now = new Date();
  const today = campusDate(now);
  const dates = coveredDates(today);
  const selected = selectedDate(dates);
  const events = data.events.filter((event) => matchesFilters(event, filters));

  const heading = element("h1", "mt-8 font-display text-xl leading-tight font-bold", formatDay(selected));
  const dayColumn = element("div", "", "");
  dayColumn.append(
    ...renderSourceWarning(data.failedSources),
    heading,
    ...renderDay(eventsOnDate(events, selected), selected, now, activeFilterCount(filters) > 0),
  );
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))];
  results.replaceChildren(renderMonth(months, today, selected, events, now), dayColumn);
}

/**
 * The shown month laid out like a wall calendar: weekday names across the top, each column one weekday, days
 * before today greyed out, and arrows to the other month.
 */
function renderMonth(months: string[], today: string, selected: string, events: FoodEvent[], now: Date): HTMLElement {
  const picker = element("nav", "mt-6 lg:sticky lg:top-6 lg:mt-8", "");
  picker.setAttribute("aria-label", "Choose a day");

  const index = months.indexOf(shownMonth);
  const header = element("div", "flex items-center justify-between", "");
  const title = element("h2", "font-display text-lg font-bold", monthFormat.format(noon(`${shownMonth}-15`)));
  title.setAttribute("aria-live", "polite");
  header.append(renderMonthArrow("previous", months[index - 1]), title, renderMonthArrow("next", months[index + 1]));

  // Each day's label names its full date, so screen readers skip the weekday row.
  const weekdays = element("div", "mt-2 grid grid-cols-7 text-sm text-muted", "");
  weekdays.setAttribute("aria-hidden", "true");
  weekdays.append(...WEEKDAYS.map((day) => element("span", "px-1 pb-1 sm:px-2", day)));

  const monthDates = datesInMonth(shownMonth);
  const leadingBlanks = noon(monthDates[0]).getUTCDay();
  const trailingBlanks = (7 - ((leadingBlanks + monthDates.length) % 7)) % 7;
  const blank = () => element("div", "bg-page", "");
  // The one-pixel gaps show the line color behind the squares, drawing the grid lines.
  const grid = element("div", "grid grid-cols-7 gap-px border border-line bg-line", "");
  grid.append(
    ...Array.from({ length: leadingBlanks }, blank),
    ...monthDates.map((date) =>
      date < today
        ? renderPastDay(date)
        : renderDayButton(date, eventsStillOn(eventsOnDate(events, date), date, now).length, date === selected, date === today),
    ),
    ...Array.from({ length: trailingBlanks }, blank),
  );
  picker.append(header, weekdays, grid);
  return picker;
}

/** An arrow that turns to `month`, or a disabled one when there's no month that way. */
function renderMonthArrow(direction: "previous" | "next", month: string | undefined): HTMLButtonElement {
  const arrow = element(
    "button",
    "flex size-11 cursor-pointer items-center justify-center rounded-sm hover:bg-line disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent",
    "",
  );
  arrow.type = "button";
  arrow.innerHTML = ARROW_SVG[direction];
  arrow.setAttribute("aria-label", `${direction === "previous" ? "Previous" : "Next"} month`);
  arrow.dataset.monthArrow = direction;
  arrow.disabled = month === undefined;
  arrow.addEventListener("click", () => {
    shownMonth = month!;
    render();
    // The calendar was redrawn, so put focus back on the same arrow, or on the other one if this way is now the end.
    const arrows = [...results.querySelectorAll<HTMLButtonElement>("[data-month-arrow]")].filter((other) => !other.disabled);
    (arrows.find((other) => other.dataset.monthArrow === direction) ?? arrows[0])?.focus();
  });
  return arrow;
}

/** Noon UTC on a YYYY-MM-DD date, which is that same calendar day in Champaign. */
function noon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** A day that has passed: shown so the month looks complete, but greyed out and not clickable. */
function renderPastDay(date: string): HTMLElement {
  const day = element("div", "aspect-square bg-page p-1 sm:p-2", "");
  day.append(element("span", "font-display text-base leading-tight text-muted opacity-50 sm:text-lg", String(Number(date.slice(8)))));
  day.setAttribute("aria-hidden", "true");
  return day;
}

function renderDayButton(date: string, count: number, selected: boolean, isToday: boolean): HTMLAnchorElement {
  const button = element(
    "a",
    `flex aspect-square flex-col p-1 sm:p-2 ${selected ? "bg-selected text-on-selected" : "bg-page hover:bg-line"}`,
    "",
  );
  button.href = `?date=${date}`;
  const countLabel = `${count === 0 ? "no" : count} ${count === 1 ? "event" : "events"}`;
  button.setAttribute("aria-label", `${isToday ? "Today, " : ""}${formatDay(date)}, ${countLabel}`);
  if (selected) {
    button.setAttribute("aria-current", "date");
  }
  // Today's date is underlined so it's still easy to find after picking another day.
  const todayMark = isToday ? "underline decoration-food decoration-2 underline-offset-4" : "";
  button.append(element("span", `font-display text-base leading-tight font-bold sm:text-lg ${todayMark}`, String(Number(date.slice(8)))));
  if (count > 0) {
    const countText = element("span", `mt-auto text-sm leading-tight font-semibold ${selected ? "" : "text-food"}`, String(count));
    // "2 events" where the squares are wide enough; just "2" on phones.
    countText.append(element("span", "hidden lg:inline", count === 1 ? " event" : " events"));
    button.append(countText);
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    window.history.pushState(null, "", button.href);
    showDayFromAddress();
  });
  return button;
}

setUpPage();
void start();

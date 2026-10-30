// The Calendar page: pick one of the next two weeks and see that day's free-food events.

import { CAMPUS_TIME_ZONE, DAYS_AHEAD, campusDate, datesFrom, eventsOnDate, pickDate, type EventsFile } from "./events.ts";
import { element, eventsStillOn, formatDay, lastCheckedText, loadEventsFile, renderDay, renderMessage, renderSourceWarning } from "./eventList.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;
const updated = document.querySelector<HTMLElement>("#updated")!;

const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, weekday: "short" });

let data: EventsFile | null = null;

async function start(): Promise<void> {
  data = await loadEventsFile();
  if (data === null) {
    content.replaceChildren(renderMessage("Couldn't load events", "Check your connection and refresh the page.", "error"));
    return;
  }
  updated.textContent = lastCheckedText(data);
  showSelectedDay();
  window.addEventListener("popstate", showSelectedDay);
}

function showSelectedDay(): void {
  if (data === null) {
    return;
  }
  const now = new Date();
  const dates = datesFrom(campusDate(now), DAYS_AHEAD);
  const selected = pickDate(new URLSearchParams(window.location.search).get("date"), dates);
  const events = data.events;

  const picker = element("nav", "mt-6 grid grid-cols-7 gap-1", "");
  picker.setAttribute("aria-label", "Choose a day");
  picker.append(...dates.map((date) => renderDayButton(date, eventsStillOn(eventsOnDate(events, date), date, now).length, date === selected)));

  const heading = element("h1", "mt-8 font-display text-xl leading-tight font-bold", formatDay(selected));
  content.replaceChildren(
    picker,
    ...renderSourceWarning(data.failedSources),
    heading,
    ...renderDay(eventsOnDate(events, selected), selected, now),
  );
}

function renderDayButton(date: string, count: number, selected: boolean): HTMLAnchorElement {
  const button = element(
    "a",
    `flex flex-col items-center rounded-sm py-2 ${selected ? "bg-selected text-on-selected" : "hover:bg-line"}`,
    "",
  );
  button.href = `?date=${date}`;
  button.setAttribute("aria-label", `${formatDay(date)}, ${count === 0 ? "no" : count} ${count === 1 ? "event" : "events"}`);
  if (selected) {
    button.setAttribute("aria-current", "date");
  }
  const weekday = weekdayFormat.format(new Date(`${date}T12:00:00Z`));
  button.append(
    element("span", `text-sm ${selected ? "" : "text-muted"}`, weekday),
    element("span", "font-display text-lg leading-tight font-bold", String(Number(date.slice(8)))),
    // A non-breaking space keeps days with no events the same height as the rest.
    element("span", `text-sm font-semibold ${selected ? "" : "text-food"}`, count > 0 ? String(count) : " "),
  );
  button.addEventListener("click", (event) => {
    event.preventDefault();
    window.history.pushState(null, "", button.href);
    showSelectedDay();
  });
  return button;
}

setUpPage();
void start();

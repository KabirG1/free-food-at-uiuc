// The Today page: today's free-food events, grouped into happening now and later today, then the next few days.

import { element } from "./dom.ts";
import { campusDate, eventsOnDate, type EventsFile } from "./events.ts";
import {
  eventsStillOn,
  formatDay,
  lastCheckedText,
  loadEventsFile,
  renderComingUp,
  renderDay,
  renderMessage,
  renderSourceWarning,
} from "./eventList.ts";
import { renderFilterPanel } from "./filterPanel.ts";
import { activeFilterCount, eventTypesIn, matchesFilters, NO_FILTERS, type Filters } from "./filters.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;
const subtitle = document.querySelector<HTMLElement>("#subtitle")!;
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
  subtitle.textContent =
    showing > 0 ? `${formatDay(today)} · ${showing} ${showing === 1 ? "event" : "events"} with free food` : formatDay(today);
  updated.textContent = lastCheckedText(data);

  const results = element("div", "", "");
  const showResults = (filters: Filters) => renderResults(results, data, filters, today, now);
  content.replaceChildren(renderFilterPanel(eventTypesIn(data.events), showResults), results);
  showResults(NO_FILTERS);
}

function renderResults(results: HTMLElement, data: EventsFile, filters: Filters, today: string, now: Date): void {
  const events = data.events.filter((event) => matchesFilters(event, filters));
  results.replaceChildren(
    ...renderSourceWarning(data.failedSources),
    ...renderDay(eventsOnDate(events, today), today, now, activeFilterCount(filters) > 0),
    ...renderComingUp(events, today),
  );
}

setUpPage();
void showToday();

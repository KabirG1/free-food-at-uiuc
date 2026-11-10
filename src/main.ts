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
import { renderFilterPanel, takeClubFromAddress } from "./filterPanel.ts";
import { followedClubKeys, onFollowedClubsChange } from "./followedClubs.ts";
import { activeFilterCount, clubsIn, eventTypesIn, matchesFilters, type Filters } from "./filters.ts";
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
  const showResults = () => renderResults(results, data, filters, today, now);
  const { panel, filters: startingFilters } = renderFilterPanel(eventTypesIn(data.events), clubsIn(data.events), takeClubFromAddress(), (newFilters) => {
    filters = newFilters;
    showResults();
  });
  let filters = startingFilters;
  content.replaceChildren(panel, results);
  // With "Clubs I follow" on, following or unfollowing a club changes which events match.
  onFollowedClubsChange(() => {
    if (filters.followedOnly) {
      showResults();
    }
  });
  showResults();
}

function renderResults(results: HTMLElement, data: EventsFile, filters: Filters, today: string, now: Date): void {
  const followed = followedClubKeys();
  const events = data.events.filter((event) => matchesFilters(event, filters, followed));
  // On wide screens today's list and "Coming up" sit side by side; on phones they stack.
  const todayColumn = element("div", "", "");
  todayColumn.append(...renderDay(eventsOnDate(events, today), today, now, activeFilterCount(filters) > 0));
  const columns = element("div", "lg:grid lg:grid-cols-2 lg:items-start lg:gap-12", "");
  columns.append(todayColumn, ...renderComingUp(events, today));
  results.replaceChildren(...renderSourceWarning(data.failedSources), columns);
}

setUpPage();
void showToday();

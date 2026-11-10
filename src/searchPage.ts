// The Search page: upcoming events matching the words in the address (search.html?q=pizza), grouped by day.

import { element } from "./dom.ts";
import { campusDate, type FoodEvent } from "./events.ts";
import { eventList, formatDay, lastCheckedText, loadEventsFile, renderMessage, renderSourceWarning } from "./eventList.ts";
import { renderSearchForm, setUpPage } from "./layout.ts";
import { MAX_QUERY_LENGTH, searchEvents } from "./search.ts";

const content = document.querySelector<HTMLElement>("#content")!;
const updated = document.querySelector<HTMLElement>("#updated")!;

async function showSearch(): Promise<void> {
  const query = (new URLSearchParams(window.location.search).get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  // The page has its own box, since on phones the header's is tucked inside the menu.
  const form = renderSearchForm("page-search", "");
  form.querySelector("input")!.value = query;
  document.querySelector("#search-box")!.replaceChildren(form);

  if (query === "") {
    content.replaceChildren(renderMessage("Search for a food, club, or place", "For example: pizza, chess, or Grainger.", "empty"));
    return;
  }
  document.title = `${query} · Search · Free Food @ UIUC`;

  const data = await loadEventsFile();
  if (data === null) {
    content.replaceChildren(renderMessage("Couldn't load events to search", "Check your connection and refresh the page.", "error"));
    return;
  }
  updated.textContent = lastCheckedText(data);

  const now = new Date();
  const matches = searchEvents(data.events, query, now);
  if (matches.length === 0) {
    content.replaceChildren(
      ...renderSourceWarning(data.failedSources),
      renderMessage(
        `No upcoming events match “${query}”`,
        "Try a shorter word, part of a club's name, or a building. Search covers events from today through the end of next month.",
        "empty",
      ),
    );
    return;
  }

  const count = element("p", "mt-6 text-muted", `${matches.length} upcoming ${matches.length === 1 ? "event matches" : "events match"} “${query}”`);
  content.replaceChildren(...renderSourceWarning(data.failedSources), count, ...renderByDay(matches, campusDate(now)));
}

/** One heading and list per day, in date order. `matches` is already sorted by start time. */
function renderByDay(matches: FoodEvent[], today: string): HTMLElement[] {
  const days = new Map<string, FoodEvent[]>();
  for (const event of matches) {
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

setUpPage();
void showSearch();

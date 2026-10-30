// The Today page: today's free-food events, grouped into happening now and later today, then the next few days.

import { campusDate, eventsOnDate } from "./events.ts";
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
  const todaysEvents = eventsOnDate(data.events, today);
  const showing = eventsStillOn(todaysEvents, today, now).length;
  subtitle.textContent =
    showing > 0 ? `${formatDay(today)} · ${showing} ${showing === 1 ? "event" : "events"} with free food` : formatDay(today);
  updated.textContent = lastCheckedText(data);
  content.replaceChildren(
    ...renderSourceWarning(data.failedSources),
    ...renderDay(todaysEvents, today, now),
    ...renderComingUp(data.events, today),
  );
}

setUpPage();
void showToday();

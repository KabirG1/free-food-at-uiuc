// The Saved events page: the events a signed-in student starred that haven't ended yet, grouped by day.

import { supabase } from "./auth.ts";
import { element } from "./dom.ts";
import { campusDate, savedEventsToShow, type FoodEvent } from "./events.ts";
import { eventList, formatDay, loadEventsFile, renderMessage } from "./eventList.ts";
import { calendarChanges, type CalendarChange } from "./calendarChanges.ts";
import {
  calendarAccessForTap,
  calendarErrorMessage,
  loadCalendarConnection,
  prepareCalendarAccess,
  updateCalendarChanges,
} from "./googleCalendar.ts";
import { setUpPage } from "./layout.ts";
import { loadSavedRecords } from "./savedEvents.ts";

const content = document.querySelector<HTMLElement>("#content")!;

async function showSaved(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(renderMessage("Accounts aren't set up", "This copy of the site has no sign-in settings.", "empty"));
    return;
  }

  let records;
  try {
    records = await loadSavedRecords();
  } catch {
    content.replaceChildren(renderMessage("Couldn't load your saved events", "Check your connection and refresh the page.", "error"));
    return;
  }
  if (records === null) {
    const link = element("a", "mt-6 inline-block rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected", "Sign in");
    link.href = "./account.html";
    content.replaceChildren(
      renderMessage("Sign in to save events", "Tap the star next to any event to save it. Your saved events show up here on any device.", "empty"),
      link,
    );
    return;
  }

  // The latest list fills in changes to saved events; if it can't load, the saved copies are shown as they are.
  const data = await loadEventsFile();
  const shown = savedEventsToShow(
    records.map((record) => record.event),
    data,
    new Date(),
  );
  if (shown.length === 0) {
    const link = element("a", "mt-6 inline-block font-semibold underline underline-offset-3", "See today's free food");
    link.href = "./";
    content.replaceChildren(
      renderMessage("No saved events coming up", "Tap the star next to any event to save it here. Events drop off this list once they end.", "empty"),
      link,
    );
    return;
  }

  const notListed = new Set(shown.filter((item) => item.notListed).map((item) => item.event.id));
  const days = new Map<string, FoodEvent[]>();
  for (const { event } of shown) {
    const date = campusDate(new Date(event.start));
    days.set(date, [...(days.get(date) ?? []), event]);
  }
  const heading = element("h1", "mt-8 font-display text-xl leading-tight font-bold", "Saved events");
  content.replaceChildren(
    heading,
    ...[...days].map(([date, events]) => {
      const section = element("section", "mt-6", "");
      section.append(element("h2", "font-display font-bold", formatDay(date)), eventList(events, "mt-2", { notListed }));
      return section;
    }),
  );

  // With Google Calendar connected, offer to update calendar copies of events that changed since being saved.
  const changes = calendarChanges(records, data, new Date());
  if (changes.length > 0 && (await loadCalendarConnection().catch(() => null)) !== null) {
    prepareCalendarAccess().catch(() => undefined);
    heading.after(renderCalendarUpdate(changes));
  }
}

function renderCalendarUpdate(changes: CalendarChange[]): HTMLElement {
  const box = element("div", "mt-6 border-y border-line py-4", "");
  const count = changes.length;
  const button = element(
    "button",
    "mt-3 cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60",
    "Update Google Calendar",
  );
  button.type = "button";
  const status = element("p", "mt-3 text-error", "");
  status.setAttribute("role", "status");
  button.addEventListener("click", async () => {
    // First, while the tap still counts, so Google's window is allowed to open.
    const access = calendarAccessForTap();
    button.disabled = true;
    button.textContent = "Updating…";
    status.textContent = "";
    try {
      const calendar = await access;
      if (calendar === null) {
        throw new Error("Google Calendar isn't connected");
      }
      await updateCalendarChanges(calendar, changes);
      const done = element("p", "font-semibold", "Google Calendar is up to date.");
      done.setAttribute("role", "status");
      box.replaceChildren(done);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Update Google Calendar";
      status.textContent = calendarErrorMessage(error, "Couldn't update Google Calendar.");
    }
  });
  box.append(
    element(
      "p",
      "",
      `${count} saved ${count === 1 ? "event has" : "events have"} changed since ${count === 1 ? "it was" : "they were"} added to your Google Calendar.`,
    ),
    button,
    status,
  );
  return box;
}

setUpPage();
void showSaved();

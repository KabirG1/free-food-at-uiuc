// The Saved events page: the events a signed-in student starred that haven't ended yet, grouped by day.
// With Google Calendar connected, it also says when the calendar is out of date and offers to update it.

import { supabase } from "./auth.ts";
import { describePlan, planSize, type CalendarPlan } from "./calendarPlan.ts";
import { element } from "./dom.ts";
import { campusDate, savedEventsToShow, type FoodEvent } from "./events.ts";
import { eventList, formatDay, loadEventsFile, renderMessage } from "./eventList.ts";
import { calendarAccessForTap, calendarErrorMessage, currentCalendarPlan, prepareIfConnected, syncCalendar } from "./googleCalendar.ts";
import { setUpPage } from "./layout.ts";
import { loadSavedEvents } from "./savedEvents.ts";

const content = document.querySelector<HTMLElement>("#content")!;

async function showSaved(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(renderMessage("Accounts aren't set up", "This copy of the site has no sign-in settings.", "empty"));
    return;
  }

  let saved;
  try {
    saved = await loadSavedEvents();
  } catch {
    content.replaceChildren(renderMessage("Couldn't load your saved events", "Check your connection and refresh the page.", "error"));
    return;
  }
  if (saved === null) {
    const link = element("a", "mt-6 inline-block rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected", "Sign in");
    link.href = "./account.html";
    content.replaceChildren(
      renderMessage("Sign in to save events", "Tap the star next to any event to save it. Your saved events show up here on any device.", "empty"),
      link,
    );
    return;
  }

  // The latest list fills in changes to saved events; if it can't load, the saved copies are shown as they are.
  content.replaceChildren(...renderSavedList(savedEventsToShow(saved, await loadEventsFile(), new Date())));

  // Also when nothing is saved: with followed clubs included, the calendar can hold events without any stars.
  const plan = await currentCalendarPlan().catch(() => null);
  if (plan !== null && planSize(plan) > 0) {
    prepareIfConnected();
    content.prepend(renderCalendarUpdate(plan));
  }
}

function renderSavedList(shown: ReturnType<typeof savedEventsToShow>): HTMLElement[] {
  if (shown.length === 0) {
    const link = element("a", "mt-6 inline-block font-semibold underline underline-offset-3", "See today's free food");
    link.href = "./";
    return [
      renderMessage("No saved events coming up", "Tap the star next to any event to save it here. Events drop off this list once they end.", "empty"),
      link,
    ];
  }
  const notListed = new Set(shown.filter((item) => item.notListed).map((item) => item.event.id));
  const days = new Map<string, FoodEvent[]>();
  for (const { event } of shown) {
    const date = campusDate(new Date(event.start));
    days.set(date, [...(days.get(date) ?? []), event]);
  }
  return [
    element("h1", "mt-8 font-display text-xl leading-tight font-bold", "Saved events"),
    ...[...days].map(([date, events]) => {
      const section = element("section", "mt-6", "");
      section.append(element("h2", "font-display font-bold", formatDay(date)), eventList(events, "mt-2", { notListed }));
      return section;
    }),
  ];
}

function renderCalendarUpdate(plan: CalendarPlan): HTMLElement {
  const box = element("div", "mt-8 border-y border-line py-4", "");
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
      if ((await syncCalendar(access)) === null) {
        throw new Error("Google Calendar isn't connected");
      }
      const done = element("p", "font-semibold", "Google Calendar is up to date.");
      done.setAttribute("role", "status");
      box.replaceChildren(done);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Update Google Calendar";
      status.textContent = calendarErrorMessage(error, "Couldn't update Google Calendar.");
    }
  });
  box.append(element("p", "", `Your Google Calendar is out of date: ${describePlan(plan)}.`), button, status);
  return box;
}

setUpPage();
void showSaved();

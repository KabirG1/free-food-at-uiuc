// How a submitted event is shown on the Submit, Manage a club, and Review pages: its time, and its Edit and
// Take off the site buttons.

import { takeDownClubEvent } from "./clubManagers.ts";
import { element } from "./dom.ts";
import { campusDate } from "./events.ts";
import { formatDay, timeFormat } from "./eventList.ts";

/** "Friday, November 6, 6:00 PM to 8:00 PM", noting when an event runs into the next day. */
export function describeWhen(start: string, end: string): string {
  const startTime = new Date(start);
  const endTime = new Date(end);
  const nextDayNote = campusDate(startTime) === campusDate(endTime) ? "" : " the next day";
  return `${formatDay(campusDate(startTime))}, ${timeFormat.format(startTime)} to ${timeFormat.format(endTime)}${nextDayNote}`;
}

/** The edit form for a submitted event (on the Submit page), which goes back to `from` after saving or cancelling. */
export function editHref(id: string, from: "submit" | "manage" | "review"): string {
  return `./submit.html?edit=${encodeURIComponent(id)}&from=${from}`;
}

const SMALL_BUTTON = "inline-flex min-h-11 cursor-pointer items-center rounded-sm border px-3 text-sm font-semibold disabled:opacity-60";

export function renderEditLink(submission: { id: string; title: string }, from: "submit" | "manage" | "review"): HTMLAnchorElement {
  const link = element("a", `${SMALL_BUTTON} border-selected`, "Edit");
  link.href = editHref(submission.id, from);
  link.setAttribute("aria-label", `Edit "${submission.title}"`);
  return link;
}

/**
 * Takes a club's event off the site, e.g. one that was cancelled; for the club's managers. Returns the button and a
 * line for problems, to go in a wrapping row. `onDone` redraws the list.
 */
export function renderTakeDownButton(submission: { id: string; title: string }, onDone: () => Promise<void>): HTMLElement[] {
  const button = element("button", `${SMALL_BUTTON} border-error text-error`, "Take off the site");
  button.type = "button";
  button.setAttribute("aria-label", `Take "${submission.title}" off the site`);
  const problem = element("p", "basis-full text-sm text-error", "");
  problem.setAttribute("role", "status");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Taking it off…";
    problem.textContent = "";
    try {
      await takeDownClubEvent(submission.id);
      await onDone();
    } catch {
      button.disabled = false;
      button.textContent = "Take off the site";
      problem.textContent = "That didn't go through. Check your connection and try again. If you're no longer a manager of this club, ask an admin.";
    }
  });
  return [button, problem];
}

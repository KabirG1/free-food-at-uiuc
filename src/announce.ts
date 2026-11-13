// A hidden line that screen readers read aloud, for changes a sighted student sees at a glance, like the list
// redrawing after a filter is picked. One short sentence is read instead of the whole new list.

import { element } from "./dom.ts";

let announcer: HTMLElement | undefined;
let announceTimer: number | undefined;

/** Adds the hidden line to the page. Screen readers only watch a line that was already there before it changed. */
export function setUpAnnouncer(): void {
  if (announcer === undefined) {
    announcer = element("p", "sr-only", "");
    announcer.setAttribute("role", "status");
    document.body.append(announcer);
  }
}

export function announce(text: string): void {
  setUpAnnouncer();
  // Emptied first and filled a moment later, so the same sentence twice in a row is still read.
  announcer!.textContent = "";
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    announcer!.textContent = text;
  }, 100);
}

/** "No events", "1 event", "3 events". */
export function eventCount(count: number): string {
  return `${count === 0 ? "No" : count} ${count === 1 ? "event" : "events"}`;
}

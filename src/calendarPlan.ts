// What the student's "Free Food @ UIUC" calendar should hold, compared with what the site has put there.
// An event belongs in it while there's a reason: the student saved it, or (with that switch on) its club is
// one they follow. Ended events are left alone, so the calendar keeps past events.

import { campusDate, clubKey, coveredDates, savedEventsToShow, type EventsFile, type FoodEvent } from "./events.ts";
import { googleEventBody } from "./googleCalendarApi.ts";

/** An event the site put in the calendar: the copy it sent. */
export interface CalendarRecord {
  event: FoodEvent;
  /** The calendar copy is marked "May be cancelled". */
  markedCancelled: boolean;
}

/** What an event's calendar copy should be. */
export interface CalendarEntry {
  event: FoodEvent;
  maybeCancelled: boolean;
}

export interface CalendarPlan {
  add: CalendarEntry[];
  /** Already in the calendar, but the details changed or it's now (or no longer) possibly cancelled. */
  update: CalendarEntry[];
  /** In the calendar with no reason left to be there. */
  remove: FoodEvent[];
}

export interface CalendarState {
  inCalendar: CalendarRecord[];
  saved: FoodEvent[];
  /** The followed clubs' `clubKey`s when "Also add events from clubs I follow" is on, and empty when it's off. */
  followedClubs: ReadonlySet<string>;
  /** The latest listing, or null when it couldn't load. Then nothing is updated, since there's nothing to compare. */
  data: EventsFile | null;
  now: Date;
}

export function planCalendar({ inCalendar, saved, followedClubs, data, now }: CalendarState): CalendarPlan {
  const notEnded = (event: FoodEvent) => Date.parse(event.end) > now.getTime();
  const listed = new Map((data?.events ?? []).map((event) => [event.id, event]));
  const listedDates = new Set(data ? coveredDates(data.date) : []);
  const wanted = new Map<string, CalendarEntry>();

  for (const { event, notListed } of savedEventsToShow(saved, data, now)) {
    wanted.set(event.id, { event, maybeCancelled: notListed });
  }
  for (const event of listed.values()) {
    if (!wanted.has(event.id) && notEnded(event) && followedClubs.has(clubKey(event.club))) {
      wanted.set(event.id, { event, maybeCancelled: false });
    }
  }
  // A followed club's event that disappeared from the listings before it ended stays, marked as possibly cancelled.
  for (const { event, markedCancelled } of inCalendar) {
    if (!wanted.has(event.id) && !listed.has(event.id) && notEnded(event) && followedClubs.has(clubKey(event.club))) {
      const vanished = listedDates.has(campusDate(new Date(event.start)));
      wanted.set(event.id, { event, maybeCancelled: vanished || markedCancelled });
    }
  }

  const records = new Map(inCalendar.map((record) => [record.event.id, record]));
  const plan: CalendarPlan = { add: [], update: [], remove: [] };
  for (const entry of wanted.values()) {
    const record = records.get(entry.event.id);
    if (record === undefined) {
      plan.add.push(entry);
    } else if (data !== null && needsUpdate(record, entry)) {
      plan.update.push(entry);
    }
  }
  for (const { event } of inCalendar) {
    if (notEnded(event) && !wanted.has(event.id)) {
      plan.remove.push(event);
    }
  }
  return plan;
}

function needsUpdate(record: CalendarRecord, entry: CalendarEntry): boolean {
  // Compared as Google would show them, so only differences a student could see count.
  return (
    record.markedCancelled !== entry.maybeCancelled ||
    JSON.stringify(googleEventBody(record.event)) !== JSON.stringify(googleEventBody(entry.event))
  );
}

export function planSize(plan: CalendarPlan): number {
  return plan.add.length + plan.update.length + plan.remove.length;
}

/** "3 events to add, 1 changed event, and 2 events to remove", for telling the student what's out of date. */
export function describePlan(plan: CalendarPlan): string {
  const events = (count: number) => `${count} ${count === 1 ? "event" : "events"}`;
  const parts = [
    plan.add.length > 0 ? `${events(plan.add.length)} to add` : "",
    plan.update.length > 0 ? `${plan.update.length} changed ${plan.update.length === 1 ? "event" : "events"}` : "",
    plan.remove.length > 0 ? `${events(plan.remove.length)} to remove` : "",
  ].filter((part) => part !== "");
  return parts.length <= 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

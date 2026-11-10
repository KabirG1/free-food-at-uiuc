// Which saved events are out of date in the student's Google Calendar: the club changed the details since the
// event was added, or it disappeared from the listings before it ended (or came back after that).

import { savedEventsToShow, type EventsFile, type FoodEvent } from "./events.ts";
import { googleEventBody } from "./googleCalendarApi.ts";

/** A saved event as stored with the account: the copy that went into Google Calendar. */
export interface SavedRecord {
  event: FoodEvent;
  /** The calendar copy is already marked "May be cancelled". */
  markedCancelled: boolean;
}

/** What the calendar copy should become: `event` holds the latest details. */
export interface CalendarChange {
  event: FoodEvent;
  maybeCancelled: boolean;
}

/**
 * The saved events whose calendar copy needs updating, earliest first. Ended events are left alone. With no
 * latest list (`data` is null), nothing can be compared, so nothing is reported.
 */
export function calendarChanges(saved: SavedRecord[], data: EventsFile | null, now: Date): CalendarChange[] {
  if (data === null) {
    return [];
  }
  const records = new Map(saved.map((record) => [record.event.id, record]));
  return savedEventsToShow(
    saved.map((record) => record.event),
    data,
    now,
  ).flatMap(({ event, notListed }) => {
    const record = records.get(event.id);
    if (record === undefined) {
      return [];
    }
    // Compared as Google would show them, so only differences a student could see count.
    const detailsChanged = JSON.stringify(googleEventBody(record.event)) !== JSON.stringify(googleEventBody(event));
    return detailsChanged || notListed !== record.markedCancelled ? [{ event, maybeCancelled: notListed }] : [];
  });
}

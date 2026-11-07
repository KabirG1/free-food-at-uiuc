// How a submitted event's time is written on the Submit and Review pages.

import { campusDate } from "./events.ts";
import { formatDay, timeFormat } from "./eventList.ts";

/** "Friday, November 6, 6:00 PM to 8:00 PM", noting when an event runs into the next day. */
export function describeWhen(start: string, end: string): string {
  const startTime = new Date(start);
  const endTime = new Date(end);
  const nextDayNote = campusDate(startTime) === campusDate(endTime) ? "" : " the next day";
  return `${formatDay(campusDate(startTime))}, ${timeFormat.format(startTime)} to ${timeFormat.format(endTime)}${nextDayNote}`;
}

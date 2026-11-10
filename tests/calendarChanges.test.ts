import { describe, expect, it } from "vitest";
import { calendarChanges, type SavedRecord } from "../src/calendarChanges.ts";
import type { EventsFile, FoodEvent } from "../src/events.ts";
import { googleEventBody } from "../src/googleCalendarApi.ts";

const NOW = new Date("2026-11-10T12:00:00-06:00");

const pizzaNight: FoodEvent = {
  id: "oneillinois-1",
  source: "OneIllinois",
  club: "ACM",
  title: "Pizza Night",
  start: "2026-11-12T18:00:00-06:00",
  end: "2026-11-12T19:00:00-06:00",
  location: "Siebel Center 1404",
  eventType: "Social",
  foodMentions: ["pizza"],
  url: "",
};

function listing(...events: FoodEvent[]): EventsFile {
  return { date: "2026-11-10", generatedAt: NOW.toISOString(), events, failedSources: [] };
}

const saved = (event: FoodEvent, markedCancelled = false): SavedRecord => ({ event, markedCancelled });

describe("calendarChanges", () => {
  it("reports a saved event whose time changed, with the new time", () => {
    const moved = { ...pizzaNight, start: "2026-11-12T19:00:00-06:00", end: "2026-11-12T20:00:00-06:00" };
    expect(calendarChanges([saved(pizzaNight)], listing(moved), NOW)).toEqual([{ event: moved, maybeCancelled: false }]);
  });

  it("reports nothing when the saved copy matches the latest listing", () => {
    expect(calendarChanges([saved(pizzaNight)], listing(pizzaNight), NOW)).toEqual([]);
  });

  it("marks an event that vanished before it ended, but only once", () => {
    expect(calendarChanges([saved(pizzaNight)], listing(), NOW)).toEqual([{ event: pizzaNight, maybeCancelled: true }]);
    expect(calendarChanges([saved(pizzaNight, true)], listing(), NOW)).toEqual([]);
  });

  it("clears the mark when a possibly cancelled event is listed again", () => {
    expect(calendarChanges([saved(pizzaNight, true)], listing(pizzaNight), NOW)).toEqual([{ event: pizzaNight, maybeCancelled: false }]);
  });

  it("leaves ended events alone, and reports nothing without a latest listing", () => {
    const ended = { ...pizzaNight, start: "2026-11-09T18:00:00-06:00", end: "2026-11-09T19:00:00-06:00" };
    expect(calendarChanges([saved(ended)], listing({ ...ended, title: "Renamed" }), NOW)).toEqual([]);
    expect(calendarChanges([saved(pizzaNight)], null, NOW)).toEqual([]);
  });
});

describe("googleEventBody for a possibly cancelled event", () => {
  it("says so in the title and the description", () => {
    const body = googleEventBody(pizzaNight, true);
    expect(body.summary).toBe("May be cancelled: Pizza Night");
    expect(body.description).toContain("No longer listed, so it may be cancelled.");
  });
});

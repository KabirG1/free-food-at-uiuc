import { describe, expect, it } from "vitest";
import type { FoodEvent } from "../src/events.ts";
import { endedEventsToKeep } from "../scripts/previousEvents.ts";

function event(id: string, start: string, end: string): FoodEvent {
  return { id, source: "test", club: "Club", title: id, start, end, location: "Union", foodMentions: [], url: "https://one.illinois.edu/" };
}

describe("endedEventsToKeep", () => {
  const now = new Date("2026-10-29T22:00:00-05:00");

  it("keeps today's events that ended and dropped out of the feed", () => {
    const previous = [event("queer-o-ween", "2026-10-29T19:00:00-05:00", "2026-10-29T21:00:00-05:00")];
    expect(endedEventsToKeep([], previous, now).map((kept) => kept.id)).toEqual(["queer-o-ween"]);
  });

  it("drops an event that vanished before its end time, since it was probably cancelled", () => {
    const previous = [event("cancelled", "2026-10-29T21:00:00-05:00", "2026-10-29T23:00:00-05:00")];
    expect(endedEventsToKeep([], previous, now)).toEqual([]);
  });

  it("drops yesterday's events and ones the feed still has", () => {
    const previous = [
      event("yesterday", "2026-10-28T12:00:00-05:00", "2026-10-28T13:00:00-05:00"),
      event("still-listed", "2026-10-29T12:00:00-05:00", "2026-10-29T13:00:00-05:00"),
    ];
    const fresh = [event("still-listed", "2026-10-29T12:00:00-05:00", "2026-10-29T13:00:00-05:00")];
    expect(endedEventsToKeep(fresh, previous, now)).toEqual([]);
  });
});

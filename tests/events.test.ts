import { describe, expect, it } from "vitest";
import { campusDate, eventsOnDate, type FoodEvent } from "../src/events.ts";
import { findFoodMentions } from "../scripts/freeFood.ts";

function eventStarting(id: string, start: string): FoodEvent {
  return { id, source: "test", club: "Club", title: id, start, end: start, location: "Union", foodMentions: [], url: "" };
}

describe("findFoodMentions", () => {
  it("finds each food word once, lowercased", () => {
    expect(findFoodMentions("Free PIZZA and boba! More pizza after.")).toEqual(["pizza", "boba"]);
  });

  it("ignores food that is being collected rather than given out", () => {
    expect(findFoodMentions("Bring donations to our food drive for the food pantry")).toEqual([]);
  });

  it("does not match food words inside other words", () => {
    expect(findFoodMentions("Snackshack trivia")).toEqual([]);
  });
});

describe("eventsOnDate", () => {
  it("uses Champaign's date, so a 10pm event stays on its own day", () => {
    // 10pm in Champaign is already the next day in UTC.
    expect(campusDate(new Date("2026-10-29T22:00:00-05:00"))).toBe("2026-10-29");
  });

  it("keeps only today's events, earliest first", () => {
    const events = [
      eventStarting("evening", "2026-10-29T19:00:00-05:00"),
      eventStarting("yesterday", "2026-10-28T12:00:00-05:00"),
      eventStarting("noon", "2026-10-29T12:00:00-05:00"),
      eventStarting("tomorrow", "2026-10-30T12:00:00-05:00"),
    ];
    expect(eventsOnDate(events, "2026-10-29").map((event) => event.id)).toEqual(["noon", "evening"]);
  });
});

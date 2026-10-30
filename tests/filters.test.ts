import { describe, expect, it } from "vitest";
import type { FoodEvent } from "../src/events.ts";
import { campusMinutes, foodKinds, matchesFilters, NO_FILTERS, overlapsTimeRange, parseClockTime, TIME_PRESETS } from "../src/filters.ts";

function event(start: string, end: string, foodMentions: string[] = [], eventType = "Meeting"): FoodEvent {
  return { id: start, source: "test", club: "Club", title: "Event", start, end, location: "Union", eventType, foodMentions, url: "" };
}

const at = (time: string) => parseClockTime(time)!;

describe("time of day filter", () => {
  const pizza = event("2026-10-29T16:30:00-05:00", "2026-10-29T17:15:00-05:00", ["pizza"]);

  it("shows an event that overlaps the chosen hours by part of its time", () => {
    expect(overlapsTimeRange(pizza, { from: at("17:00"), to: at("18:00") })).toBe(true);
  });

  it("shows an event that overlaps by just one minute", () => {
    expect(overlapsTimeRange(pizza, { from: at("17:14"), to: at("18:00") })).toBe(true);
  });

  it("hides an event that ends exactly when the chosen hours start", () => {
    expect(overlapsTimeRange(pizza, { from: at("17:15"), to: at("18:00") })).toBe(false);
  });

  it("hides an event that starts exactly when the chosen hours end", () => {
    expect(overlapsTimeRange(pizza, { from: at("15:00"), to: at("16:30") })).toBe(false);
  });

  it("counts an event running past midnight as evening, not morning", () => {
    const lateNight = event("2026-10-29T23:00:00-05:00", "2026-10-30T01:00:00-05:00");
    expect(overlapsTimeRange(lateNight, TIME_PRESETS.evening.range)).toBe(true);
    expect(overlapsTimeRange(lateNight, TIME_PRESETS.morning.range)).toBe(false);
  });

  it("reads times in Champaign's time zone", () => {
    expect(campusMinutes("2026-10-29T23:30:00Z")).toBe(18 * 60 + 30);
  });
});

describe("food filter", () => {
  it("sorts pizza as a meal and boba as a snack", () => {
    expect(foodKinds(event("2026-10-29T12:00:00-05:00", "2026-10-29T13:00:00-05:00", ["pizza", "boba"]))).toEqual(
      new Set(["meal", "snack"]),
    );
  });

  it("counts 'food provided' with no details as both, so it isn't hidden", () => {
    expect(foodKinds(event("2026-10-29T12:00:00-05:00", "2026-10-29T13:00:00-05:00", []))).toEqual(new Set(["meal", "snack"]));
  });
});

describe("matchesFilters", () => {
  const pizzaMeeting = event("2026-10-29T16:30:00-05:00", "2026-10-29T17:15:00-05:00", ["pizza"], "Meeting");
  const lateSnacks = event("2026-10-29T18:30:00-05:00", "2026-10-29T20:00:00-05:00", ["snacks"], "Social");
  const mealsAtFive = { ...NO_FILTERS, food: "meal" as const, time: { from: at("17:00"), to: at("18:00") } };

  it("keeps the 4:30 pizza event and drops the 6:30 snacks event for meals around 5", () => {
    expect(matchesFilters(pizzaMeeting, mealsAtFive)).toBe(true);
    expect(matchesFilters(lateSnacks, mealsAtFive)).toBe(false);
  });

  it("filters by event type", () => {
    expect(matchesFilters(lateSnacks, { ...NO_FILTERS, eventType: "Social" })).toBe(true);
    expect(matchesFilters(pizzaMeeting, { ...NO_FILTERS, eventType: "Social" })).toBe(false);
  });

  it("keeps everything when no filters are on", () => {
    expect(matchesFilters(lateSnacks, NO_FILTERS)).toBe(true);
  });
});

describe("parseClockTime", () => {
  it("reads a time input's value and rejects anything else", () => {
    expect(parseClockTime("17:30")).toBe(17 * 60 + 30);
    expect(parseClockTime("")).toBeNull();
    expect(parseClockTime("25:00")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { describePlan, planCalendar, type CalendarRecord, type CalendarState } from "../src/calendarPlan.ts";
import { clubKey, type EventsFile, type FoodEvent } from "../src/events.ts";
import { googleEventBody } from "../src/googleCalendarApi.ts";

const NOW = new Date("2026-11-10T12:00:00-06:00");

function event(id: string, overrides: Partial<FoodEvent> = {}): FoodEvent {
  return {
    id,
    source: "OneIllinois",
    club: "Chess Club",
    title: `Event ${id}`,
    start: "2026-11-12T18:00:00-06:00",
    end: "2026-11-12T19:00:00-06:00",
    location: "Illini Union",
    eventType: "Meeting",
    foodMentions: ["pizza"],
    url: "",
    ...overrides,
  };
}

function listing(...events: FoodEvent[]): EventsFile {
  return { date: "2026-11-10", generatedAt: NOW.toISOString(), events, failedSources: [] };
}

const recorded = (recordedEvent: FoodEvent, markedCancelled = false): CalendarRecord => ({ event: recordedEvent, markedCancelled });

function plan(state: Partial<CalendarState>) {
  return planCalendar({ inCalendar: [], saved: [], followedClubs: new Set(), data: listing(), now: NOW, ...state });
}

const ids = (events: { id: string }[]) => events.map((found) => found.id);
const entryIds = (entries: { event: FoodEvent }[]) => entries.map((entry) => entry.event.id);

describe("planCalendar: saved events", () => {
  it("adds a saved event that isn't in the calendar yet", () => {
    const saved = event("a");
    expect(entryIds(plan({ saved: [saved], data: listing(saved) }).add)).toEqual(["a"]);
  });

  it("removes an unsaved event from a club the student doesn't follow", () => {
    const unsaved = event("a");
    expect(ids(plan({ inCalendar: [recorded(unsaved)], data: listing(unsaved) }).remove)).toEqual(["a"]);
  });

  it("updates an event whose time changed, and leaves an unchanged one alone", () => {
    const original = event("a");
    const moved = event("a", { start: "2026-11-12T19:00:00-06:00", end: "2026-11-12T20:00:00-06:00" });
    const result = plan({ inCalendar: [recorded(original)], saved: [original], data: listing(moved) });
    expect(result.update).toEqual([{ event: moved, maybeCancelled: false }]);
    expect(plan({ inCalendar: [recorded(original)], saved: [original], data: listing(original) }).update).toEqual([]);
  });

  it("marks a saved event that vanished before it ended, but only once", () => {
    const vanished = event("a");
    expect(plan({ inCalendar: [recorded(vanished)], saved: [vanished] }).update).toEqual([{ event: vanished, maybeCancelled: true }]);
    expect(plan({ inCalendar: [recorded(vanished, true)], saved: [vanished] }).update).toEqual([]);
  });
});

describe("planCalendar: followed clubs", () => {
  const chess = new Set([clubKey("Chess Club")]);

  it("adds a followed club's upcoming events, but not other clubs' or ended ones", () => {
    const followedEvent = event("a");
    const otherClub = event("b", { club: "Debate Society" });
    const ended = event("c", { start: "2026-11-10T08:00:00-06:00", end: "2026-11-10T09:00:00-06:00" });
    expect(entryIds(plan({ followedClubs: chess, data: listing(followedEvent, otherClub, ended) }).add)).toEqual(["a"]);
  });

  it("keeps a followed club's event when it's unsaved", () => {
    const followedEvent = event("a");
    expect(plan({ inCalendar: [recorded(followedEvent)], followedClubs: chess, data: listing(followedEvent) }).remove).toEqual([]);
  });

  it("removes the club's events when unfollowed, except saved ones", () => {
    const savedOne = event("a");
    const notSaved = event("b");
    const result = plan({ inCalendar: [recorded(savedOne), recorded(notSaved)], saved: [savedOne], data: listing(savedOne, notSaved) });
    expect(ids(result.remove)).toEqual(["b"]);
  });

  it("marks a followed club's event that vanished, instead of removing it", () => {
    const vanished = event("a");
    const result = plan({ inCalendar: [recorded(vanished)], followedClubs: chess });
    expect(result.remove).toEqual([]);
    expect(result.update).toEqual([{ event: vanished, maybeCancelled: true }]);
  });
});

describe("planCalendar: edge cases", () => {
  it("never removes ended events, so the calendar keeps past ones", () => {
    const ended = event("a", { start: "2026-11-09T18:00:00-06:00", end: "2026-11-09T19:00:00-06:00" });
    expect(plan({ inCalendar: [recorded(ended)] }).remove).toEqual([]);
  });

  it("adds saved events but updates nothing when the latest listing couldn't load", () => {
    const inCalendar = event("a");
    const notYet = event("b");
    const result = plan({ inCalendar: [recorded(inCalendar)], saved: [inCalendar, notYet], data: null });
    expect(entryIds(result.add)).toEqual(["b"]);
    expect(result.update).toEqual([]);
    expect(result.remove).toEqual([]);
  });
});

describe("describePlan", () => {
  it("lists what will change in plain words", () => {
    const one = { event: event("a"), maybeCancelled: false };
    expect(describePlan({ add: [one, one, one], update: [one], remove: [] })).toBe("3 events to add and 1 changed event");
    expect(describePlan({ add: [one], update: [one, one], remove: [event("b")] })).toBe("1 event to add, 2 changed events, and 1 event to remove");
  });
});

describe("googleEventBody for a possibly cancelled event", () => {
  it("says so in the title and the description", () => {
    const body = googleEventBody(event("a", { title: "Pizza Night" }), true);
    expect(body.summary).toBe("May be cancelled: Pizza Night");
    expect(body.description).toContain("No longer listed, so it may be cancelled.");
  });
});

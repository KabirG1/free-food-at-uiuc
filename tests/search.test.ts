import { describe, expect, it } from "vitest";
import type { FoodEvent } from "../src/events.ts";
import { searchEvents, searchWords } from "../src/search.ts";

function event(overrides: Partial<FoodEvent>): FoodEvent {
  return {
    id: overrides.title ?? "event",
    source: "OneIllinois",
    club: "Illini Chess Club",
    title: "Weekly Meeting",
    start: "2026-11-12T18:00:00-06:00",
    end: "2026-11-12T19:00:00-06:00",
    location: "Siebel Center 1404",
    eventType: "Meeting",
    foodMentions: [],
    url: "",
    ...overrides,
  };
}

const NOW = new Date("2026-11-10T12:00:00-06:00");
const titles = (events: FoodEvent[]) => events.map((found) => found.title);

describe("searchEvents", () => {
  const pizzaNight = event({ title: "Pizza Night", club: "ACM", location: "Grainger Library" });
  const boba = event({ title: "Study Break", club: "Taiwanese Student Association", foodMentions: ["boba"], eventType: "Cultural" });
  const chessPizza = event({ title: "Chess Social", foodMentions: ["pizza"], start: "2026-11-11T18:00:00-06:00", end: "2026-11-11T20:00:00-06:00" });
  const events = [pizzaNight, boba, chessPizza];

  it("finds a food word in the title or the food found in the listing, earliest first", () => {
    expect(titles(searchEvents(events, "pizza", NOW))).toEqual(["Chess Social", "Pizza Night"]);
  });

  it("finds part of a club's name, a building, and an event type, ignoring capitals", () => {
    expect(titles(searchEvents(events, "taiwanese", NOW))).toEqual(["Study Break"]);
    expect(titles(searchEvents(events, "GRAINGER", NOW))).toEqual(["Pizza Night"]);
    expect(titles(searchEvents(events, "cultural", NOW))).toEqual(["Study Break"]);
  });

  it("needs every word to match, so more words narrow the results", () => {
    expect(titles(searchEvents(events, "pizza  chess", NOW))).toEqual(["Chess Social"]);
  });

  it("finds nothing for a blank search or a word no event has", () => {
    expect(searchEvents(events, "   ", NOW)).toEqual([]);
    expect(searchEvents(events, "sushi", NOW)).toEqual([]);
  });

  it("leaves out events that have ended but keeps ones under way", () => {
    const ended = event({ title: "Morning Donuts", foodMentions: ["donuts"], start: "2026-11-10T08:00:00-06:00", end: "2026-11-10T10:00:00-06:00" });
    const underWay = event({ title: "Lunch Donuts", foodMentions: ["donuts"], start: "2026-11-10T11:00:00-06:00", end: "2026-11-10T13:00:00-06:00" });
    expect(titles(searchEvents([ended, underWay], "donuts", NOW))).toEqual(["Lunch Donuts"]);
  });

  it("doesn't match OneIllinois' hidden-location text as a place", () => {
    const hidden = event({ title: "Mystery Meeting", location: "Private Location (sign in to display)" });
    expect(searchEvents([hidden], "sign", NOW)).toEqual([]);
  });
});

describe("searchWords", () => {
  it("cuts very long searches to 100 characters", () => {
    expect(searchWords("a".repeat(500))).toEqual(["a".repeat(100)]);
  });
});

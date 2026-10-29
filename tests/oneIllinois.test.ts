import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOneIllinoisFeed } from "../scripts/sources/oneIllinois.ts";

const sampleFeed = readFileSync(new URL("./fixtures/one-illinois-sample.xml", import.meta.url), "utf8");
const events = parseOneIllinoisFeed(sampleFeed);
const eventIds = events.map((event) => event.id);

describe("parseOneIllinoisFeed", () => {
  it("keeps a real event whose description mentions snacks", () => {
    expect(events[0]).toEqual({
      id: "OneIllinois-500183",
      source: "OneIllinois",
      club: "Gender & Sexuality Resource Center (GSRC)",
      title: "Queer-O-Ween",
      start: "2026-10-29T19:00:00.0000000-05:00",
      end: "2026-10-29T21:00:00.0000000-05:00",
      location: "Private Location (sign in to display)",
      foodMentions: ["snacks"],
      url: "https://one.illinois.edu/GSRC/rsvp?id=500183",
    });
  });

  it("keeps an event the club flagged as providing food, even without food words", () => {
    const chessNight = events.find((event) => event.id === "OneIllinois-900001");
    expect(chessNight?.foodMentions).toEqual([]);
  });

  it("finds food words inside the HTML description", () => {
    const meeting = events.find((event) => event.id === "OneIllinois-900002");
    expect(meeting?.foodMentions).toEqual(["pizza"]);
    expect(meeting?.location).toBe("ECEB 1002");
  });

  it("replaces links that are not HTTPS OneIllinois pages", () => {
    const meeting = events.find((event) => event.id === "OneIllinois-900002");
    expect(meeting?.url).toBe("https://one.illinois.edu/events");
  });

  it("leaves out food drives, events without food, and events missing times", () => {
    expect(eventIds).not.toContain("OneIllinois-900003");
    expect(eventIds).not.toContain("OneIllinois-900004");
    expect(eventIds).not.toContain("OneIllinois-900005");
    expect(events).toHaveLength(3);
  });

  it("returns no events for an empty feed", () => {
    expect(parseOneIllinoisFeed("<rss><channel></channel></rss>")).toEqual([]);
  });
});

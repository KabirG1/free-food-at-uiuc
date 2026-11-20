import { describe, expect, it } from "vitest";
import { withLiveSubmissions } from "../src/approvedSubmissions.ts";
import type { EventsFile, FoodEvent } from "../src/events.ts";
import { SUBMISSION_SOURCE } from "../src/submissionRules.ts";

function event(id: string, source: string, start: string): FoodEvent {
  return { id, source, club: "Chess Club", title: id, start, end: start.replace("T18", "T20"), location: "Illini Union", eventType: "", foodMentions: ["pizza"], url: "" };
}

const oneIllinoisEvent = event("oneillinois-1", "OneIllinois", "2026-11-20T18:00:00-06:00");
const savedSubmission = event("submission-old", SUBMISSION_SOURCE, "2026-11-20T18:30:00-06:00");

const file: EventsFile = {
  date: "2026-11-20",
  generatedAt: "2026-11-20T13:00:00Z",
  events: [oneIllinoisEvent, savedSubmission],
  failedSources: [],
};

describe("withLiveSubmissions", () => {
  it("shows an event a club manager just posted, without waiting for the next fetch", () => {
    const posted = event("submission-new", SUBMISSION_SOURCE, "2026-11-20T17:00:00-06:00");
    const ids = withLiveSubmissions(file, [savedSubmission, posted]).events.map((each) => each.id);
    expect(ids).toEqual(["submission-new", "oneillinois-1", "submission-old"]);
  });

  it("drops a submitted event that was taken off the site since the last fetch", () => {
    expect(withLiveSubmissions(file, []).events).toEqual([oneIllinoisEvent]);
  });

  it("leaves out live events past the dates the saved list covers", () => {
    const farAway = event("submission-far", SUBMISSION_SOURCE, "2027-02-01T18:00:00-06:00");
    expect(withLiveSubmissions(file, [farAway]).events).toEqual([oneIllinoisEvent]);
  });
});

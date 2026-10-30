import { describe, expect, it } from "vitest";
import {
  campusDate,
  datesFrom,
  eventsNotEnded,
  eventsOnDate,
  eventsOnDates,
  pickDate,
  savedEventsToShow,
  splitByStarted,
  upcomingDates,
  type EventsFile,
  type FoodEvent,
} from "../src/events.ts";
import { findFoodMentions } from "../scripts/freeFood.ts";

function eventStarting(id: string, start: string, end = start): FoodEvent {
  return { id, source: "test", club: "Club", title: id, start, end, location: "Union", eventType: "", foodMentions: [], url: "" };
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

describe("eventsNotEnded", () => {
  const events = [
    eventStarting("lunch", "2026-10-29T12:00:00-05:00", "2026-10-29T13:00:00-05:00"),
    eventStarting("afternoon", "2026-10-29T14:00:00-05:00", "2026-10-29T16:00:00-05:00"),
    eventStarting("evening", "2026-10-29T19:00:00-05:00", "2026-10-29T21:00:00-05:00"),
  ];

  it("hides finished events but keeps ones already under way", () => {
    const now = new Date("2026-10-29T15:00:00-05:00");
    expect(eventsNotEnded(events, now).map((event) => event.id)).toEqual(["afternoon", "evening"]);
  });

  it("hides an event at the moment it ends", () => {
    const now = new Date("2026-10-29T21:00:00-05:00");
    expect(eventsNotEnded(events, now)).toEqual([]);
  });
});

describe("splitByStarted", () => {
  it("puts events that have started under now and the rest under later", () => {
    const events = [
      eventStarting("started", "2026-10-29T14:00:00-05:00", "2026-10-29T16:00:00-05:00"),
      eventStarting("starts-now", "2026-10-29T15:00:00-05:00", "2026-10-29T16:00:00-05:00"),
      eventStarting("later", "2026-10-29T19:00:00-05:00", "2026-10-29T21:00:00-05:00"),
    ];
    const { happeningNow, laterToday } = splitByStarted(events, new Date("2026-10-29T15:00:00-05:00"));
    expect(happeningNow.map((event) => event.id)).toEqual(["started", "starts-now"]);
    expect(laterToday.map((event) => event.id)).toEqual(["later"]);
  });
});

describe("datesFrom", () => {
  it("counts across the end of a month", () => {
    expect(datesFrom("2026-10-30", 3)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("doesn't skip or repeat a day when daylight saving time ends", () => {
    expect(datesFrom("2026-10-31", 3)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("eventsOnDates", () => {
  it("keeps events in the two-week window and drops ones before or after it", () => {
    const events = [
      eventStarting("yesterday", "2026-10-28T12:00:00-05:00"),
      eventStarting("today", "2026-10-29T12:00:00-05:00"),
      eventStarting("last-day", "2026-11-11T12:00:00-06:00"),
      eventStarting("too-far", "2026-11-12T12:00:00-06:00"),
    ];
    const window = datesFrom("2026-10-29", 14);
    expect(eventsOnDates(events, window).map((event) => event.id)).toEqual(["today", "last-day"]);
  });
});

describe("pickDate", () => {
  const dates = ["2026-10-29", "2026-10-30"];

  it("uses the day in the page address when it's in range", () => {
    expect(pickDate("2026-10-30", dates)).toBe("2026-10-30");
  });

  it("falls back to today for a missing, past, or made-up date", () => {
    expect(pickDate(null, dates)).toBe("2026-10-29");
    expect(pickDate("2026-10-01", dates)).toBe("2026-10-29");
    expect(pickDate("<script>", dates)).toBe("2026-10-29");
  });
});

describe("upcomingDates", () => {
  it("lists the next days that have events, skipping today and empty days", () => {
    const events = [
      eventStarting("today", "2026-10-29T12:00:00-05:00"),
      eventStarting("sat", "2026-10-31T12:00:00-05:00"),
      eventStarting("sat-again", "2026-10-31T18:00:00-05:00"),
      eventStarting("mon", "2026-11-02T12:00:00-06:00"),
      eventStarting("thu", "2026-11-05T12:00:00-06:00"),
      eventStarting("fri", "2026-11-06T12:00:00-06:00"),
    ];
    expect(upcomingDates(events, "2026-10-29", 3)).toEqual(["2026-10-31", "2026-11-02", "2026-11-05"]);
  });
});

describe("savedEventsToShow", () => {
  const now = new Date("2026-10-30T13:00:00-05:00");
  const listing = (events: FoodEvent[]): EventsFile => ({ date: "2026-10-30", generatedAt: "", events, failedSources: [] });

  it("hides saved events that have ended and lists the rest earliest first", () => {
    const saved = [
      eventStarting("tomorrow", "2026-10-31T12:00:00-05:00", "2026-10-31T13:00:00-05:00"),
      eventStarting("this morning", "2026-10-30T09:00:00-05:00", "2026-10-30T10:00:00-05:00"),
      eventStarting("this afternoon", "2026-10-30T15:00:00-05:00", "2026-10-30T16:00:00-05:00"),
    ];
    const shown = savedEventsToShow(saved, listing(saved), now);
    expect(shown.map(({ event }) => event.id)).toEqual(["this afternoon", "tomorrow"]);
  });

  it("shows the latest listing when the club changed the event after it was saved", () => {
    const savedCopy = eventStarting("moved", "2026-10-31T12:00:00-05:00", "2026-10-31T13:00:00-05:00");
    const latest = { ...savedCopy, location: "Siebel Center" };
    expect(savedEventsToShow([savedCopy], listing([latest]), now)[0].event.location).toBe("Siebel Center");
  });

  it("flags an event that vanished from the list before it ended, since it may be cancelled", () => {
    const saved = [eventStarting("gone", "2026-10-31T12:00:00-05:00", "2026-10-31T13:00:00-05:00")];
    expect(savedEventsToShow(saved, listing([]), now)[0].notListed).toBe(true);
  });

  it("doesn't flag events beyond the two weeks the list covers, or when the list couldn't load", () => {
    const farOff = [eventStarting("far off", "2026-12-01T12:00:00-06:00", "2026-12-01T13:00:00-06:00")];
    expect(savedEventsToShow(farOff, listing([]), now)[0].notListed).toBe(false);
    expect(savedEventsToShow(farOff, null, now)[0].notListed).toBe(false);
  });
});

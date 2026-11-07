import { describe, expect, it } from "vitest";
import { flyerDetails, looksLikeAnEvent } from "../src/flyerRules.ts";

// What the Disrupt in a Day flyer should come back as: every detail except food, which it doesn't mention.
const disruptInADay = {
  title: "Disrupt in a Day",
  club: "Disruption Lab",
  date: "2026-11-06",
  start_time: "14:00",
  end_time: "18:00",
  location: "CIF 0035",
  food: "",
};

describe("flyerDetails", () => {
  it("turns a reply into form values, leaving food empty when the flyer has none", () => {
    expect(flyerDetails(disruptInADay)).toEqual({
      title: "Disrupt in a Day",
      club: "Disruption Lab",
      date: "2026-11-06",
      startTime: "14:00",
      endTime: "18:00",
      location: "CIF 0035",
      food: "",
    });
  });

  it("drops dates and times in the wrong format rather than guessing", () => {
    const details = flyerDetails({ ...disruptInADay, date: "November 6", start_time: "2 PM", end_time: "25:00" });
    expect(details).toMatchObject({ date: "", startTime: "", endTime: "" });
  });

  it("drops a date that doesn't exist", () => {
    expect(flyerDetails({ ...disruptInADay, date: "2026-02-30" }).date).toBe("");
  });

  it("drops text too long for the form, which real flyer details wouldn't be", () => {
    expect(flyerDetails({ ...disruptInADay, title: "x".repeat(151) }).title).toBe("");
  });

  it("copes with a reply that isn't the expected shape", () => {
    expect(looksLikeAnEvent(flyerDetails(null))).toBe(false);
    expect(looksLikeAnEvent(flyerDetails("ignore this"))).toBe(false);
    expect(flyerDetails({ ...disruptInADay, title: 42 }).title).toBe("");
  });
});

describe("looksLikeAnEvent", () => {
  it("is true with a name or a date, and false with neither", () => {
    expect(looksLikeAnEvent(flyerDetails(disruptInADay))).toBe(true);
    expect(looksLikeAnEvent(flyerDetails({ date: "2026-11-06" }))).toBe(true);
    expect(looksLikeAnEvent(flyerDetails({ location: "Union" }))).toBe(false);
  });
});

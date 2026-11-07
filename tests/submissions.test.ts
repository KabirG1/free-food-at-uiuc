import { describe, expect, it } from "vitest";
import { parseApprovedSubmissions } from "../scripts/sources/submissions.ts";
import { foodKinds } from "../src/filters.ts";
import { campusTime, checkSubmission, parseFoodList, type SubmissionForm } from "../src/submissionRules.ts";

const now = new Date("2026-11-06T12:00:00-06:00");

const form: SubmissionForm = {
  title: " Pizza Night ",
  club: "Chess Club",
  date: "2026-11-06",
  startTime: "18:00",
  endTime: "20:00",
  location: "Illini Union 314A",
  food: "Pizza, cookies",
  eventType: "Social",
  url: "",
};

const row = {
  id: "abc",
  title: "Pizza Night",
  club: "Chess Club",
  starts_at: "2026-11-07T00:00:00+00:00",
  ends_at: "2026-11-07T02:00:00+00:00",
  location: "Illini Union",
  food: "Pizza, cookies",
  event_type: "Social",
  url: null,
};

function problems(changes: Partial<SubmissionForm>) {
  const result = checkSubmission({ ...form, ...changes }, now);
  return result.ok ? {} : result.problems;
}

describe("campusTime", () => {
  it("uses Champaign's offset for the date, winter or summer", () => {
    expect(campusTime("2026-11-06", "18:00")).toBe("2026-11-06T18:00:00-06:00");
    expect(campusTime("2026-07-06", "18:00")).toBe("2026-07-06T18:00:00-05:00");
  });
});

describe("checkSubmission", () => {
  it("accepts a complete event, trimming spaces and turning an empty link into none", () => {
    const result = checkSubmission(form, now);
    expect(result).toEqual({
      ok: true,
      submission: {
        title: "Pizza Night",
        club: "Chess Club",
        starts_at: "2026-11-06T18:00:00-06:00",
        ends_at: "2026-11-06T20:00:00-06:00",
        location: "Illini Union 314A",
        food: "Pizza, cookies",
        event_type: "Social",
        url: null,
      },
    });
  });

  it("treats an end time earlier than the start as the next day", () => {
    const result = checkSubmission({ ...form, startTime: "22:00", endTime: "01:00" }, now);
    expect(result.ok && result.submission.ends_at).toBe("2026-11-07T01:00:00-06:00");
  });

  it("asks for each required field", () => {
    expect(Object.keys(problems({ title: " ", club: "", location: "", food: "", startTime: "", endTime: "" }))).toEqual(
      expect.arrayContaining(["title", "club", "location", "food", "startTime", "endTime"]),
    );
  });

  it("refuses an event that has already ended or is too far ahead", () => {
    expect(problems({ date: "2026-11-05" }).date).toContain("already ended");
    expect(problems({ date: "2027-03-01" }).date).toContain("within the next");
  });

  it("still accepts an event that's under way", () => {
    expect(checkSubmission({ ...form, startTime: "11:00", endTime: "13:00" }, now).ok).toBe(true);
  });

  it("only accepts https links, never ones that could run code", () => {
    expect(problems({ url: "javascript:alert(1)" }).url).toBeDefined();
    expect(problems({ url: "http://example.com" }).url).toBeDefined();
    expect(problems({ url: "https://www.instagram.com/p/abc/" }).url).toBeUndefined();
  });
});

describe("parseFoodList", () => {
  it("splits items and removes repeats", () => {
    expect(parseFoodList("Pizza, Soda and cookies & pizza")).toEqual(["pizza", "soda", "cookies"]);
  });
});

describe("parseApprovedSubmissions", () => {
  it("turns an approved row into a listing the Meals and Snacks filters understand", () => {
    const [event] = parseApprovedSubmissions([row]);
    expect(event).toMatchObject({ id: "submission-abc", club: "Chess Club", foodMentions: ["pizza", "cookies"], url: "" });
    expect(foodKinds(event)).toEqual(new Set(["meal", "snack"]));
  });

  it("drops a link that isn't https", () => {
    expect(parseApprovedSubmissions([{ ...row, url: "javascript:alert(1)" }])[0].url).toBe("");
  });

  it("skips incomplete rows and fails on a response that isn't a list", () => {
    expect(parseApprovedSubmissions([{ ...row, title: "" }, { ...row, starts_at: "soon" }, null])).toEqual([]);
    expect(() => parseApprovedSubmissions({ message: "error" })).toThrow();
  });
});

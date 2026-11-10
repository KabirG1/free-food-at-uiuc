import { afterEach, describe, expect, it, vi } from "vitest";
import type { FoodEvent } from "../src/events.ts";
import { addCalendarEvent, CalendarApiError, googleEventBody, googleEventId, removeCalendarEvent } from "../src/googleCalendarApi.ts";

const pizzaNight: FoodEvent = {
  id: "oneillinois-12345",
  source: "OneIllinois",
  club: "ACM @ UIUC",
  title: "Pizza Night",
  start: "2026-11-12T18:00:00-06:00",
  end: "2026-11-12T19:30:00-06:00",
  location: "Siebel Center 1404",
  eventType: "Social",
  foodMentions: ["pizza"],
  url: "https://one.illinois.edu/event/12345",
};

describe("googleEventId", () => {
  it("uses only the characters Google allows, and always gives the same event the same ID", () => {
    const id = googleEventId(pizzaNight.id);
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(googleEventId(pizzaNight.id)).toBe(id);
  });

  it("gives different events different IDs", () => {
    expect(googleEventId("oneillinois-12345")).not.toBe(googleEventId("oneillinois-12346"));
  });
});

describe("googleEventBody", () => {
  it("fills in the title, times, place, club, food, and link", () => {
    const body = googleEventBody(pizzaNight);
    expect(body).toMatchObject({
      summary: "Pizza Night",
      location: "Siebel Center 1404",
      start: { dateTime: pizzaNight.start },
      end: { dateTime: pizzaNight.end },
    });
    expect(body.description).toContain("Hosted by ACM @ UIUC");
    expect(body.description).toContain("Food: Pizza");
    expect(body.description).toContain(pizzaNight.url);
  });

  it("leaves OneIllinois' hidden location out of the place field and explains it instead", () => {
    const body = googleEventBody({ ...pizzaNight, location: "Private Location (sign in to display)" });
    expect(body).not.toHaveProperty("location");
    expect(body.description).toContain("Location: shown after signing in to OneIllinois");
  });
});

describe("adding and removing calendar events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubGoogle(...statuses: number[]) {
    const fetchMock = vi.fn(async () => new Response(null, { status: statuses.shift() ?? 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("brings an event back when it's saved again after being unsaved", async () => {
    // Google answers 409 because it still remembers the deleted event's ID.
    const fetchMock = stubGoogle(409, 200);
    await addCalendarEvent("token", "calendar@group", pizzaNight);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, request] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(request.method).toBe("PUT");
    expect(url).toContain(`/events/${googleEventId(pizzaNight.id)}`);
    expect(JSON.parse(request.body as string).status).toBe("confirmed");
  });

  it("treats an event already deleted in Google Calendar as removed", async () => {
    stubGoogle(410);
    await expect(removeCalendarEvent("token", "calendar@group", pizzaNight.id)).resolves.toBeUndefined();
  });

  it("reports when Google stops accepting the site's access", async () => {
    stubGoogle(401);
    const failure = addCalendarEvent("token", "calendar@group", pizzaNight);
    await expect(failure).rejects.toBeInstanceOf(CalendarApiError);
    await expect(failure).rejects.toMatchObject({ status: 401 });
  });
});

// Checks what came back from reading a flyer. It started as text on an image anyone could upload, so
// only values in the expected format reach the form. The student still checks the form before submitting.

import type { SubmissionForm } from "./submissionRules.ts";

export type FlyerDetails = Pick<SubmissionForm, "title" | "club" | "date" | "startTime" | "endTime" | "location" | "food">;

const NO_DETAILS: FlyerDetails = { title: "", club: "", date: "", startTime: "", endTime: "", location: "", food: "" };

function text(value: unknown, limit: number): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : "";
}

function validDate(value: unknown): string {
  const date = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    return "";
  }
  // Rejects dates like February 30, which roll over to another day instead of failing.
  return new Date(`${date}T12:00:00Z`).toISOString().startsWith(date) ? date : "";
}

function validTime(value: unknown): string {
  const time = text(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

/** The form values found in a flyer reply. Anything missing or in the wrong format comes back empty. */
export function flyerDetails(reply: unknown): FlyerDetails {
  if (typeof reply !== "object" || reply === null) {
    return NO_DETAILS;
  }
  const flyer = reply as Record<string, unknown>;
  return {
    title: text(flyer.title, 150),
    club: text(flyer.club, 120),
    date: validDate(flyer.date),
    startTime: validTime(flyer.start_time),
    endTime: validTime(flyer.end_time),
    location: text(flyer.location, 150),
    food: text(flyer.food, 100),
  };
}

/** False when the image doesn't seem to be a flyer at all: no name and no date. */
export function looksLikeAnEvent(details: FlyerDetails): boolean {
  return details.title !== "" || details.date !== "";
}

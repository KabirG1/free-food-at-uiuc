// The rules for a submitted event: what the form accepts, and how an approved one becomes a listing.
// Shared by the Submit page and the fetch script. The database repeats the checks that matter for safety.

import { CAMPUS_TIME_ZONE, type FoodEvent } from "./events.ts";

export const SUBMISSION_SOURCE = "Student submission";

/** The latest an event can start, counted from now. The database allows a day more, so the two can't disagree. */
const FURTHEST_AHEAD_DAYS = 90;

const LENGTH_LIMITS = { title: 150, club: 120, location: 150, food: 100 };

export interface SubmissionForm {
  title: string;
  club: string;
  /** YYYY-MM-DD, in Champaign. */
  date: string;
  /** HH:MM, in Champaign. */
  startTime: string;
  /** HH:MM, in Champaign. A time earlier than the start means the next day. */
  endTime: string;
  location: string;
  food: string;
  eventType: string;
  url: string;
}

/** A row ready to insert into the submitted_events table. */
export interface NewSubmission {
  title: string;
  club: string;
  starts_at: string;
  ends_at: string;
  location: string;
  food: string;
  event_type: string;
  url: string | null;
}

export type FormProblems = Partial<Record<keyof SubmissionForm, string>>;

export type FormResult = { ok: true; submission: NewSubmission } | { ok: false; problems: FormProblems };

function campusOffset(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, timeZoneName: "longOffset" }).formatToParts(instant);
  return (parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT").replace("GMT", "") || "+00:00";
}

/** A date and time as written in Champaign, as ISO 8601, whatever time zone the student's device is in. */
export function campusTime(date: string, time: string): string {
  // The offset depends on the moment, so find it from a first guess that's within hours of the real time.
  const guess = new Date(`${date}T${time}:00${campusOffset(new Date(`${date}T${time}:00Z`))}`);
  return `${date}T${time}:00${campusOffset(guess)}`;
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Only complete https:// addresses are accepted, since this becomes a link on the site. */
export function isHttpsUrl(text: string): boolean {
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

/** Checks the form and returns either a row to insert or a message for each field with a problem. */
export function checkSubmission(form: SubmissionForm, now: Date): FormResult {
  const problems: FormProblems = {};
  const title = form.title.trim();
  const club = form.club.trim();
  const location = form.location.trim();
  const food = form.food.trim();
  const url = form.url.trim();

  const required = { title: [title, "Enter the event's name."], club: [club, "Enter the club or group."], location: [location, "Enter where it is."], food: [food, "Enter what food there will be."] } as const;
  for (const [field, [value, message]] of Object.entries(required) as [keyof typeof required, readonly [string, string]][]) {
    if (value === "") {
      problems[field] = message;
    } else if (value.length > LENGTH_LIMITS[field]) {
      problems[field] = `Keep this under ${LENGTH_LIMITS[field]} characters.`;
    }
  }
  if (url !== "" && !(isHttpsUrl(url) && url.length <= 500)) {
    problems.url = "Enter a full web address starting with https://, or leave this empty.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(Date.parse(`${form.date}T12:00:00Z`))) {
    problems.date = "Choose the date.";
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime)) {
    problems.startTime = "Choose a start time.";
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.endTime)) {
    problems.endTime = "Choose an end time.";
  } else if (form.endTime === form.startTime) {
    problems.endTime = "The end time has to be different from the start time.";
  }

  let startsAt = "";
  let endsAt = "";
  if (!problems.date && !problems.startTime && !problems.endTime) {
    startsAt = campusTime(form.date, form.startTime);
    // An end earlier than the start means it runs past midnight.
    endsAt = campusTime(form.endTime < form.startTime ? nextDay(form.date) : form.date, form.endTime);
    if (Date.parse(endsAt) <= now.getTime()) {
      problems.date = "This event has already ended. Check the date and times.";
    } else if (Date.parse(startsAt) > now.getTime() + FURTHEST_AHEAD_DAYS * 86_400_000) {
      problems.date = `Choose a date within the next ${FURTHEST_AHEAD_DAYS} days.`;
    }
  }

  if (Object.keys(problems).length > 0) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    submission: { title, club, starts_at: startsAt, ends_at: endsAt, location, food, event_type: form.eventType, url: url === "" ? null : url },
  };
}

/** "Pizza, soda and cookies" as separate lowercase words, which the Meals and Snacks filters look for. */
export function parseFoodList(food: string): string[] {
  const words = food
    .toLowerCase()
    .split(/,|&|\band\b/)
    .map((word) => word.trim())
    .filter((word) => word !== "");
  return [...new Set(words)];
}

export interface ApprovedSubmission {
  id: string;
  title: string;
  club: string;
  starts_at: string;
  ends_at: string;
  location: string;
  food: string;
  event_type: string;
  url: string | null;
}

/** An approved submission in the shape every source uses. Without a link, `url` is empty. */
export function submissionToEvent(row: ApprovedSubmission): FoodEvent {
  return {
    id: `submission-${row.id}`,
    source: SUBMISSION_SOURCE,
    club: row.club,
    title: row.title,
    start: row.starts_at,
    end: row.ends_at,
    location: row.location,
    eventType: row.event_type,
    foodMentions: parseFoodList(row.food),
    url: row.url !== null && isHttpsUrl(row.url) ? row.url : "",
  };
}

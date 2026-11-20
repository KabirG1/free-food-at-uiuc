// Events students submitted and an admin approved, plus events club managers posted, stored in Supabase
// (see supabase/003_submissions.sql and 009_club_managers.sql). The scheduled fetch saves them into events.json,
// and every page also reads them live so new and removed ones show right away.

import { coveredDates, eventsOnDates, type EventsFile, type FoodEvent } from "./events.ts";
import { SUBMISSION_SOURCE, submissionToEvent, type ApprovedSubmission } from "./submissionRules.ts";

export const SUBMISSIONS_SOURCE_NAME = "student submissions";

export async function fetchApprovedSubmissions(supabaseUrl: string, publishableKey: string, timeoutMs = 30_000): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/approved_submissions`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Supabase returned HTTP ${response.status}`);
  }
  return response.json();
}

/** Turns the database's rows into events, skipping any row that isn't complete. */
export function parseApprovedSubmissions(rows: unknown): FoodEvent[] {
  if (!Array.isArray(rows)) {
    throw new Error("Supabase did not return a list of submissions");
  }
  return rows.filter(isApprovedSubmission).map(submissionToEvent);
}

function isApprovedSubmission(value: unknown): value is ApprovedSubmission {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  const required = ["id", "title", "club", "starts_at", "ends_at", "location", "food"];
  return (
    required.every((field) => typeof row[field] === "string" && row[field] !== "") &&
    typeof row.event_type === "string" &&
    (row.url === null || typeof row.url === "string") &&
    !Number.isNaN(Date.parse(row.starts_at as string)) &&
    !Number.isNaN(Date.parse(row.ends_at as string))
  );
}

/**
 * The saved list with its submitted events swapped for the live ones, so an event posted or taken down since the
 * last scheduled fetch shows correctly. Live events outside the saved list's dates are left out, as the fetch would.
 */
export function withLiveSubmissions(file: EventsFile, live: FoodEvent[]): EventsFile {
  const fromOtherSources = file.events.filter((event) => event.source !== SUBMISSION_SOURCE);
  return { ...file, events: eventsOnDates([...fromOtherSources, ...live], coveredDates(file.date)) };
}

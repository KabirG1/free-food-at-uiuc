// Events students submitted and an admin approved, stored in Supabase (see supabase/003_submissions.sql).

import type { FoodEvent } from "../../src/events.ts";
import { submissionToEvent, type ApprovedSubmission } from "../../src/submissionRules.ts";

export const SUBMISSIONS_SOURCE_NAME = "student submissions";

export async function fetchApprovedSubmissions(supabaseUrl: string, publishableKey: string): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/approved_submissions`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
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

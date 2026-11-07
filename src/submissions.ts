// Submitted events in Supabase (see supabase/003_submissions.sql). The database decides who can see and
// review what, so nothing here has to be trusted to keep students out of the admin actions.

import { supabase } from "./auth.ts";
import type { NewSubmission } from "./submissionRules.ts";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface SubmittedEvent extends NewSubmission {
  id: string;
  status: SubmissionStatus;
}

const COLUMNS = "id, title, club, starts_at, ends_at, location, food, event_type, url, status";

/** Thrown when the database refuses a submission, which means the student has too many waiting. */
export class TooManyPendingError extends Error {}

export async function submitEvent(submission: NewSubmission): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.from("submitted_events").insert(submission);
  // 42501: the database's rules refused the row. The form has already checked everything else they cover.
  if (error?.code === "42501") {
    throw new TooManyPendingError();
  }
  if (error) {
    throw error;
  }
}

/** The signed-in student's own submissions that haven't ended, soonest first. */
export async function loadMySubmissions(userId: string): Promise<SubmittedEvent[]> {
  return loadSubmissions((query) => query.eq("submitted_by", userId));
}

/** For admins: events waiting for a decision and approved ones, soonest first. */
export async function loadSubmissionsToReview(): Promise<SubmittedEvent[]> {
  return loadSubmissions((query) => query.in("status", ["pending", "approved"]));
}

async function loadSubmissions(narrow: <Q extends SubmissionQuery>(query: Q) => Q): Promise<SubmittedEvent[]> {
  if (supabase === null) {
    return [];
  }
  const { data, error } = await narrow(baseQuery());
  if (error) {
    throw error;
  }
  return (data ?? []) as unknown as SubmittedEvent[];
}

type SubmissionQuery = ReturnType<typeof baseQuery>;

function baseQuery() {
  return supabase!.from("submitted_events").select(COLUMNS).gt("ends_at", new Date().toISOString()).order("starts_at");
}

/** Records an admin's decision. Returns false if the event's state already changed, e.g. another admin got there first. */
export async function reviewSubmission(id: string, decision: "approved" | "rejected"): Promise<boolean> {
  if (supabase === null) {
    return false;
  }
  const { data, error } = await supabase.rpc("review_submission", { submission_id: id, decision });
  if (error) {
    throw error;
  }
  return data === true;
}

/** How many events are waiting for review, or null for anyone who isn't an admin. */
export async function pendingSubmissionCount(): Promise<number | null> {
  if (supabase === null) {
    return null;
  }
  const { data, error } = await supabase.rpc("pending_submission_count");
  if (error) {
    throw error;
  }
  return typeof data === "number" ? data : null;
}

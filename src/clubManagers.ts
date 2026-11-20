// Club managers in Supabase (see supabase/009_club_managers.sql). The database decides who manages what, who can
// post without review, and who can approve managers, so nothing here has to be trusted to enforce it.

import { supabase } from "./auth.ts";
import { clubKey } from "./events.ts";
import type { NewSubmission } from "./submissionRules.ts";

export type ManagerStatus = "pending" | "approved" | "rejected" | "removed";

export interface ManagerRequest {
  id: string;
  email: string;
  club: string;
  role: string;
  status: ManagerStatus;
  requested_at: string;
}

const COLUMNS = "id, email, club, role, status, requested_at";

/** Thrown when the student already has a request waiting for this club or already manages it. */
export class AlreadyRequestedError extends Error {}

/** Thrown when the student has 3 requests waiting, which is the limit. */
export class TooManyRequestsError extends Error {}

export async function requestToManage(club: string, role: string): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.from("club_managers").insert({ club, role });
  // 23505: the one-request-per-club rule. 42501: the limit on waiting requests.
  if (error?.code === "23505") {
    throw new AlreadyRequestedError();
  }
  if (error?.code === "42501") {
    throw new TooManyRequestsError();
  }
  if (error) {
    throw error;
  }
}

/** The signed-in student's requests, newest first. For admins, the database returns everyone's, so narrow by user. */
export async function loadMyRequests(userId: string): Promise<ManagerRequest[]> {
  return loadRequests((query) => query.eq("user_id", userId));
}

/** For admins: requests waiting for a decision and current managers, by club. */
export async function loadRequestsToReview(): Promise<ManagerRequest[]> {
  const requests = await loadRequests((query) => query.in("status", ["pending", "approved"]));
  return requests.sort((a, b) => clubKey(a.club).localeCompare(clubKey(b.club)));
}

async function loadRequests(narrow: <Q extends RequestQuery>(query: Q) => Q): Promise<ManagerRequest[]> {
  if (supabase === null) {
    return [];
  }
  const { data, error } = await narrow(baseQuery());
  if (error) {
    throw error;
  }
  return (data ?? []) as unknown as ManagerRequest[];
}

type RequestQuery = ReturnType<typeof baseQuery>;

function baseQuery() {
  return supabase!.from("club_managers").select(COLUMNS).order("requested_at", { ascending: false });
}

/** The clubs the student manages right now, by name as approved. */
export function managedClubs(requests: ManagerRequest[]): string[] {
  return requests.filter((request) => request.status === "approved").map((request) => request.club);
}

/** Records an admin's decision. Returns false if the request already changed, e.g. another admin got there first. */
export async function decideManagerRequest(id: string, decision: "approved" | "rejected" | "removed"): Promise<boolean> {
  if (supabase === null) {
    return false;
  }
  const { data, error } = await supabase.rpc("decide_manager_request", { request_id: id, decision });
  if (error) {
    throw error;
  }
  return data === true;
}

/** Puts an event on the site right away. The database refuses it unless the student manages the club or is an admin. */
export async function postClubEvent(event: NewSubmission): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.rpc("post_club_event", { ...event });
  if (error) {
    throw error;
  }
}

/** Takes a club's event off the site. Returns false if it was already off. */
export async function takeDownClubEvent(id: string): Promise<boolean> {
  if (supabase === null) {
    return false;
  }
  const { data, error } = await supabase.rpc("take_down_club_event", { event_id: id });
  if (error) {
    throw error;
  }
  return data === true;
}

/** How many events and manager requests are waiting for an admin, or null for anyone who isn't an admin. */
export async function pendingReviewCount(): Promise<number | null> {
  if (supabase === null) {
    return null;
  }
  const { data, error } = await supabase.rpc("pending_review_count");
  if (error) {
    throw error;
  }
  return typeof data === "number" ? data : null;
}

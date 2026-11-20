// Club managers in Supabase (see supabase/009_club_managers.sql). The database decides who manages what, who can
// post without review, and who can approve managers, so nothing here has to be trusted to enforce it.

import { supabase } from "./auth.ts";
import { clubKey } from "./events.ts";
import type { NewSubmission } from "./submissionRules.ts";

export type ManagerStatus = "pending" | "approved" | "rejected" | "removed" | "invited" | "declined" | "cancelled";

export interface ManagerRequest {
  id: string;
  email: string;
  club: string;
  role: string;
  status: ManagerStatus;
  requested_at: string;
  /** For someone a manager invited: the inviter's email. Null for someone who asked an admin. */
  added_by_email: string | null;
}

const COLUMNS = "id, email, club, role, status, requested_at, added_by_email";

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

/** For admins: requests waiting for a decision, current managers, and open invitations, by club. */
export async function loadRequestsToReview(): Promise<ManagerRequest[]> {
  return sortedByClub(await loadRequests((query) => query.in("status", ["pending", "approved", "invited"])));
}

/**
 * Current managers and open invitations the student can see: everyone on the clubs they manage, plus invitations
 * sent to them. (The database decides what's visible; for admins that's every club.)
 */
export async function loadClubTeams(): Promise<ManagerRequest[]> {
  return sortedByClub(await loadRequests((query) => query.in("status", ["approved", "invited"])));
}

function sortedByClub(requests: ManagerRequest[]): ManagerRequest[] {
  return requests.sort((a, b) => clubKey(a.club).localeCompare(clubKey(b.club)));
}

/** "President", or "Manager" for someone who joined by invitation and has no role on file. */
export function roleText(request: ManagerRequest): string {
  return request.role.trim() === "" ? "Manager" : request.role;
}

/** Thrown when the person already manages the club, is already invited, or has asked an admin. */
export class AlreadyOnTeamError extends Error {}

/** Thrown when the club has 10 managers and invitations, which is the limit. */
export class TeamFullError extends Error {}

/** Invites someone to manage `club` with the student. The database checks the student manages it. */
export async function inviteManager(club: string, email: string): Promise<void> {
  if (supabase === null) {
    return;
  }
  const { error } = await supabase.rpc("invite_club_manager", { club, email });
  // 23505: the one-active-row-per-person rule. 54000: the per-club limit.
  if (error?.code === "23505") {
    throw new AlreadyOnTeamError();
  }
  if (error?.code === "54000") {
    throw new TeamFullError();
  }
  if (error) {
    throw error;
  }
}

/** Accepts or declines an invitation. Returns false if it was cancelled or already answered. */
export async function respondToInvitation(id: string, accept: boolean): Promise<boolean> {
  if (supabase === null) {
    return false;
  }
  const { data, error } = await supabase.rpc("respond_to_invitation", { invitation_id: id, accept });
  if (error) {
    throw error;
  }
  return data === true;
}

/** Removes a manager or cancels an invitation, including the student leaving. Returns false if it already changed. */
export async function removeManager(id: string): Promise<boolean> {
  if (supabase === null) {
    return false;
  }
  const { data, error } = await supabase.rpc("remove_club_manager", { manager_id: id });
  if (error) {
    throw error;
  }
  return data === true;
}

/** The email check the database also makes, so the form can explain it first. */
export function isIllinoisEmail(text: string): boolean {
  return /^[^@\s]+@illinois\.edu$/i.test(text.trim());
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

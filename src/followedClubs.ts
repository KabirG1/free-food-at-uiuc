// Followed clubs in Supabase (see supabase/005_followed_clubs.sql). The database only lets each student read
// and change their own rows. The list is loaded once per page and shared by every Follow button, the
// "Clubs I follow" filter, and the Account page, which all hear about changes through `onFollowedClubsChange`.

import { clubKey } from "./events.ts";

/** clubKey -> the name as stored, which is needed to delete the right row. */
const followed = new Map<string, string>();
const listeners = new Set<() => void>();
let loading: Promise<boolean> | undefined;

/**
 * Loads the followed clubs. Resolves to false when nobody is signed in (or sign-in isn't set up).
 * The sign-in code is imported only here, so the event list can be drawn before it arrives.
 */
export function loadFollowedClubs(): Promise<boolean> {
  loading ??= fetchFollowedClubs().catch((error: unknown) => {
    // Try again next time something asks.
    loading = undefined;
    throw error;
  });
  return loading;
}

async function fetchFollowedClubs(): Promise<boolean> {
  const { currentUser, supabase } = await import("./auth.ts");
  if (supabase === null || (await currentUser()) === null) {
    return false;
  }
  const { data, error } = await supabase.from("followed_clubs").select("club");
  if (error) {
    throw error;
  }
  for (const { club } of data) {
    if (typeof club === "string" && club.trim() !== "") {
      followed.set(clubKey(club), club);
    }
  }
  notify();
  return true;
}

export function isFollowing(club: string): boolean {
  return followed.has(clubKey(club));
}

/** The followed clubs as `clubKey`s, for the filter. */
export function followedClubKeys(): ReadonlySet<string> {
  return new Set(followed.keys());
}

/** The followed clubs' names, alphabetically, for the Account page. */
export function followedClubNames(): string[] {
  return [...followed.values()].sort((a, b) => a.localeCompare(b));
}

/** Runs `listener` whenever the list loads or changes. */
export function onFollowedClubsChange(listener: () => void): void {
  listeners.add(listener);
}

/** Follows or unfollows `club`. Updates the page right away, and undoes that if the database says no. */
export async function setFollowing(club: string, follow: boolean): Promise<void> {
  const key = clubKey(club);
  const stored = followed.get(key);
  if (follow === (stored !== undefined)) {
    return;
  }
  const name = club.trim();
  if (follow) {
    followed.set(key, name);
  } else {
    followed.delete(key);
  }
  notify();
  try {
    const { supabase } = await import("./auth.ts");
    if (supabase === null) {
      return;
    }
    if (follow) {
      const { error } = await supabase.from("followed_clubs").insert({ club: name });
      // 23505 means it's already followed, e.g. from another tab, which is what the student wanted anyway.
      if (error && error.code !== "23505") {
        throw error;
      }
    } else {
      const { error } = await supabase.from("followed_clubs").delete().eq("club", stored!);
      if (error) {
        throw error;
      }
    }
  } catch (error) {
    if (follow) {
      followed.delete(key);
    } else {
      followed.set(key, stored!);
    }
    notify();
    throw error;
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

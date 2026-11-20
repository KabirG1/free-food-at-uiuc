// Club pages (see supabase/012_club_profiles.sql): every club with at least one manager has one, and its name links
// there wherever events are listed. Read with a plain request, without the sign-in library, so lists stay quick.

import { clubKey } from "./events.ts";
import { isHttpsUrl } from "./submissionRules.ts";

export interface ClubPage {
  club: string;
  description: string;
  /** A handle without the @, or empty. */
  instagram: string;
  /** An https:// address, or empty. */
  website: string;
}

const pagesByKey = new Map<string, ClubPage>();
let loading: Promise<void> | null = null;

/**
 * Loads which clubs have pages, once per page view. If the database can't be reached, club names just aren't links.
 * Lists drawn before this finishes don't link names, so pages wait for it alongside the events.
 */
export function loadClubPages(): Promise<void> {
  loading ??= fetchClubPages()
    .then((pages) => {
      for (const page of pages) {
        pagesByKey.set(clubKey(page.club), page);
      }
    })
    .catch(() => undefined);
  return loading;
}

async function fetchClubPages(): Promise<ClubPage[]> {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env;
  if (!url || !key) {
    return [];
  }
  const response = await fetch(`${url}/rest/v1/rpc/club_pages`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Supabase returned HTTP ${response.status}`);
  }
  return parseClubPages(await response.json());
}

/** Keeps only complete rows, and drops any link that isn't safe to show. */
export function parseClubPages(rows: unknown): ClubPage[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null && typeof row.club === "string" && row.club.trim() !== "")
    .map((row) => ({
      club: row.club as string,
      description: typeof row.description === "string" ? row.description : "",
      instagram: typeof row.instagram === "string" ? (instagramHandle(row.instagram) ?? "") : "",
      website: typeof row.website === "string" && isHttpsUrl(row.website) ? row.website : "",
    }));
}

/** The club's page, or undefined if it has none (no managers). Call after loadClubPages. */
export function clubPage(club: string): ClubPage | undefined {
  return pagesByKey.get(clubKey(club));
}

export function clubPageHref(club: string): string {
  return `./club.html?${new URLSearchParams({ name: club })}`;
}

/**
 * The Instagram handle in what a manager typed: "chessclub", "@chessclub", or a link to the profile. Empty for
 * nothing typed, and null if it isn't a handle Instagram allows (letters, numbers, dots, underscores, up to 30).
 */
export function instagramHandle(text: string): string | null {
  let handle = text.trim();
  const link = handle.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i);
  if (link) {
    handle = link[1];
  }
  handle = handle.replace(/^@/, "");
  if (handle === "") {
    return "";
  }
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

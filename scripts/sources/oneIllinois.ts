// OneIllinois (UIUC's CampusGroups club platform) publishes every upcoming event in a public RSS feed.

import { XMLParser } from "fast-xml-parser";
import type { FoodEvent } from "../../src/events.ts";
import { findFoodMentions, isFoodCollection } from "../freeFood.ts";

export const ONE_ILLINOIS_FEED_URL = "https://one.illinois.edu/rss_events";
export const ONE_ILLINOIS_SOURCE = "OneIllinois";

interface FeedItem {
  eventId?: string;
  group?: string;
  eventType?: string;
  title?: string;
  fullDescription?: string;
  description?: string;
  eventStartDateTime?: string;
  eventEndDateTime?: string;
  eventLocation?: string;
  eventLink?: string;
  link?: string;
  foodProvided?: string;
}

/** Parses the feed's XML and returns the events that offer food, whatever their date. */
export function parseOneIllinoisFeed(xml: string): FoodEvent[] {
  const parser = new XMLParser({
    // Keep values as strings so IDs and flags like "1" are not turned into numbers.
    parseTagValue: false,
    isArray: (tagName) => tagName === "item",
  });
  const items: FeedItem[] = parser.parse(xml)?.rss?.channel?.item ?? [];

  const events: FoodEvent[] = [];
  for (const item of items) {
    if (!item.eventId || !item.title || !item.eventStartDateTime || !item.eventEndDateTime || isFoodCollection(item.title)) {
      continue;
    }
    const description = stripHtml(item.fullDescription || item.description || "");
    const foodMentions = findFoodMentions(`${item.title} ${description}`);
    if (item.foodProvided !== "1" && foodMentions.length === 0) {
      continue;
    }
    events.push({
      id: `${ONE_ILLINOIS_SOURCE}-${item.eventId}`,
      source: ONE_ILLINOIS_SOURCE,
      club: item.group?.trim() || "Unknown club",
      title: item.title.trim(),
      start: item.eventStartDateTime,
      end: item.eventEndDateTime,
      location: item.eventLocation?.trim() || "Location not listed",
      eventType: item.eventType?.trim() ?? "",
      foodMentions,
      url: safeHttpsUrl(item.eventLink || item.link),
    });
  }
  return events;
}

export async function fetchOneIllinoisFeed(): Promise<string> {
  const response = await fetch(ONE_ILLINOIS_FEED_URL, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`OneIllinois feed returned HTTP ${response.status}`);
  }
  return response.text();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Only links to OneIllinois over HTTPS are kept, so a bad feed entry cannot point the page elsewhere. */
function safeHttpsUrl(url: string | undefined): string {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol === "https:" && parsed.hostname === "one.illinois.edu") {
      return parsed.href;
    }
  } catch {
    // Not a valid URL; fall through to the events page.
  }
  return "https://one.illinois.edu/events";
}

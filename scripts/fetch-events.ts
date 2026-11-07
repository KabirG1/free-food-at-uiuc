// Fetches every source, keeps free-food events from today through the end of next month, and writes them to public/events.json for the page.

import { mkdir, writeFile } from "node:fs/promises";
import { campusDate, coveredDates, eventsOnDates, type EventsFile, type FoodEvent } from "../src/events.ts";
import { endedEventsToKeep, loadPreviousEvents } from "./previousEvents.ts";
import { fetchOneIllinoisFeed, ONE_ILLINOIS_SOURCE, parseOneIllinoisFeed } from "./sources/oneIllinois.ts";
import { fetchApprovedSubmissions, parseApprovedSubmissions, SUBMISSIONS_SOURCE_NAME } from "./sources/submissions.ts";

const OUTPUT_PATH = "public/events.json";

interface Source {
  name: string;
  /** Without this source the list would be nearly empty, so its failure keeps the last published list instead. */
  essential: boolean;
  load: () => Promise<FoodEvent[]>;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const sources: Source[] = [
  { name: ONE_ILLINOIS_SOURCE, essential: true, load: async () => parseOneIllinoisFeed(await fetchOneIllinoisFeed()) },
  // A fresh clone without Supabase settings simply has no submissions; that isn't a failure.
  ...(supabaseUrl && supabaseKey
    ? [{ name: SUBMISSIONS_SOURCE_NAME, essential: false, load: async () => parseApprovedSubmissions(await fetchApprovedSubmissions(supabaseUrl, supabaseKey)) }]
    : []),
];

async function main(): Promise<void> {
  const now = new Date();
  const today = campusDate(now);
  const allEvents: FoodEvent[] = [];
  const failedSources: string[] = [];

  // One failing source should not stop the others from showing.
  for (const source of sources) {
    try {
      const events = await source.load();
      console.log(`${source.name}: ${events.length} free-food events found`);
      allEvents.push(...events);
    } catch (error) {
      console.error(`${source.name} failed:`, error instanceof Error ? error.message : error);
      failedSources.push(source.name);
    }
  }

  const carriedOver = endedEventsToKeep(allEvents, await loadPreviousEvents(OUTPUT_PATH), now);
  console.log(`Kept ${carriedOver.length} of today's events that have ended since the last fetch`);
  allEvents.push(...carriedOver);

  const output: EventsFile = {
    date: today,
    generatedAt: now.toISOString(),
    events: eventsOnDates(allEvents, coveredDates(today)),
    failedSources,
  };
  await mkdir("public", { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${output.events.length} events from ${today} through the end of next month to ${OUTPUT_PATH}`);

  if (sources.some((source) => source.essential && failedSources.includes(source.name))) {
    process.exitCode = 1;
  }
}

await main();

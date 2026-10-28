// Fetches every source, keeps today's free-food events, and writes them to public/events.json for the page.

import { mkdir, writeFile } from "node:fs/promises";
import { campusDate, eventsOnDate, type EventsFile, type FoodEvent } from "../src/events.ts";
import { fetchOneIllinoisFeed, ONE_ILLINOIS_SOURCE, parseOneIllinoisFeed } from "./sources/oneIllinois.ts";

const OUTPUT_PATH = "public/events.json";

interface Source {
  name: string;
  load: () => Promise<FoodEvent[]>;
}

const sources: Source[] = [
  { name: ONE_ILLINOIS_SOURCE, load: async () => parseOneIllinoisFeed(await fetchOneIllinoisFeed()) },
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

  const output: EventsFile = {
    date: today,
    generatedAt: now.toISOString(),
    events: eventsOnDate(allEvents, today),
    failedSources,
  };
  await mkdir("public", { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${output.events.length} events for ${today} to ${OUTPUT_PATH}`);

  if (failedSources.length === sources.length) {
    process.exitCode = 1;
  }
}

await main();

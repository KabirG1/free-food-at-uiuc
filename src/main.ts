import { CAMPUS_TIME_ZONE, eventsNotEnded, splitByStarted, type EventsFile, type FoodEvent } from "./events.ts";
import { isPrivateLocation, mapLink } from "./location.ts";

const content = document.querySelector<HTMLElement>("#content")!;
const subtitle = document.querySelector<HTMLElement>("#subtitle")!;
const updated = document.querySelector<HTMLElement>("#updated")!;

const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

const LINK_CLASSES = "underline decoration-line decoration-1 underline-offset-3 hover:decoration-current";

async function loadEvents(): Promise<void> {
  let data: EventsFile;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}events.json`, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    data = await response.json();
  } catch {
    showMessage("Couldn't load today's events", "Check your connection and refresh the page.", "error");
    return;
  }

  // The file stores a plain date; noon avoids it shifting to the previous day in any time zone.
  const dayName = dayFormat.format(new Date(`${data.date}T12:00:00`));
  subtitle.textContent = dayName;
  updated.textContent = `Events from OneIllinois, last checked at ${timeFormat.format(new Date(data.generatedAt))}.`;

  if (data.events.length === 0) {
    if (data.failedSources.length > 0) {
      showMessage(`Couldn't reach ${data.failedSources.join(", ")}`, "Today's events may be missing. Try again later.", "error");
    } else {
      showMessage("No free food today", "Events are checked four times a day, so check back tomorrow.", "empty");
    }
    return;
  }

  // The saved file only refreshes a few times a day, so finished events are hidden here using the viewer's clock.
  const now = new Date();
  const currentEvents = eventsNotEnded(data.events, now);
  if (currentEvents.length === 0) {
    showMessage("Today's free food is over", "Check back tomorrow.", "empty");
    return;
  }

  subtitle.textContent = `${dayName} · ${currentEvents.length} ${currentEvents.length === 1 ? "event" : "events"} with free food`;
  const { happeningNow, laterToday } = splitByStarted(currentEvents, now);
  const sections = [renderSection("Happening now", happeningNow), renderSection("Later today", laterToday)];
  content.replaceChildren(...sections.filter((section) => section !== null));
  if (data.failedSources.length > 0) {
    content.prepend(
      element("p", "mt-6 text-error", `Couldn't reach ${data.failedSources.join(", ")}, so this list may be incomplete.`),
    );
  }
}

function renderSection(heading: string, events: FoodEvent[]): HTMLElement | null {
  if (events.length === 0) {
    return null;
  }
  const section = element("section", "mt-8", "");
  const title = element("h2", "font-display text-sm font-bold tracking-wide text-muted uppercase", heading);
  const list = element("ul", "mt-2 divide-y divide-line border-y border-line", "");
  list.append(...events.map(renderEvent));
  section.append(title, list);
  return section;
}

function renderEvent(event: FoodEvent): HTMLLIElement {
  const item = element("li", "grid grid-cols-[6rem_1fr] gap-x-4 py-4", "");

  const when = element("div", "", "");
  when.append(
    element("p", "font-display text-lg leading-tight font-bold", timeFormat.format(new Date(event.start))),
    element("p", "mt-1 text-sm text-muted", `to ${timeFormat.format(new Date(event.end))}`),
  );

  const details = element("div", "min-w-0", "");
  const title = element("a", `text-lg leading-tight font-semibold ${LINK_CLASSES}`, event.title);
  title.href = event.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  details.append(
    title,
    element("p", "mt-1 text-muted", event.club),
    renderLocation(event.location),
    element("p", "mt-2 font-semibold text-food", describeFood(event)),
  );

  item.append(when, details);
  return item;
}

function renderLocation(location: string): HTMLParagraphElement {
  const paragraph = element("p", "mt-1", "");
  const link = mapLink(location);
  if (link) {
    const anchor = element("a", LINK_CLASSES, location);
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    paragraph.append(anchor);
  } else if (isPrivateLocation(location)) {
    paragraph.className += " text-muted";
    paragraph.textContent = "Location shown after signing in to OneIllinois";
  } else {
    paragraph.textContent = location;
  }
  return paragraph;
}

/** "Pizza, boba" from the words found, or "Food provided" when the club only ticked the box. */
function describeFood(event: FoodEvent): string {
  if (event.foodMentions.length === 0) {
    return "Food provided";
  }
  const list = event.foodMentions.join(", ");
  return list.charAt(0).toUpperCase() + list.slice(1);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function showMessage(heading: string, detail: string, kind: "empty" | "error"): void {
  const block = element("div", "mt-10", "");
  block.append(
    element("h2", `font-display text-xl leading-tight font-bold ${kind === "error" ? "text-error" : ""}`, heading),
    element("p", "mt-2 text-muted", detail),
  );
  content.replaceChildren(block);
}

void loadEvents();

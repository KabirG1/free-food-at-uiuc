import { CAMPUS_TIME_ZONE, type EventsFile, type FoodEvent } from "./events.ts";

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

async function loadEvents(): Promise<void> {
  let data: EventsFile;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}events.json`, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    data = await response.json();
  } catch {
    showMessage("Couldn't load today's events. Check your connection and refresh the page.", "error");
    return;
  }

  // The file stores a plain date; noon avoids it shifting to the previous day in any time zone.
  subtitle.textContent = `Club events with free food on ${dayFormat.format(new Date(`${data.date}T12:00:00`))}`;
  updated.textContent = `Last checked at ${timeFormat.format(new Date(data.generatedAt))}`;

  if (data.events.length === 0) {
    if (data.failedSources.length > 0) {
      showMessage(`Couldn't reach ${data.failedSources.join(", ")}, so today's events may be missing. Try again later.`, "error");
    } else {
      showMessage("No free food today. Check back tomorrow!", "empty");
    }
    return;
  }

  const list = document.createElement("ul");
  list.className = "events";
  list.append(...data.events.map(renderEvent));
  content.replaceChildren(list);
  if (data.failedSources.length > 0) {
    content.prepend(statusParagraph(`Some sources couldn't be reached (${data.failedSources.join(", ")}), so this list may be incomplete.`, "error"));
  }
}

function renderEvent(event: FoodEvent): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "event";

  const title = document.createElement("a");
  title.className = "event-title";
  title.href = event.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  title.textContent = event.title;

  const club = document.createElement("p");
  club.className = "event-club";
  club.textContent = event.club;

  const details = document.createElement("p");
  details.className = "event-details";
  details.textContent = `${timeFormat.format(new Date(event.start))} – ${timeFormat.format(new Date(event.end))} · ${event.location}`;

  const food = document.createElement("p");
  food.className = "event-food";
  food.textContent = event.foodMentions.length > 0 ? `🍕 Mentions ${event.foodMentions.join(", ")}` : "🍕 Club says food is provided";

  item.append(title, club, details, food);
  return item;
}

function showMessage(text: string, kind: "empty" | "error"): void {
  content.replaceChildren(statusParagraph(text, kind));
}

function statusParagraph(text: string, kind: "empty" | "error"): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = `status status-${kind}`;
  paragraph.textContent = text;
  return paragraph;
}

void loadEvents();

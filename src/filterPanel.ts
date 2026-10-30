// The "Filters" dropdown shown above the event list on the Today and Calendar pages.

import { activeFilterCount, NO_FILTERS, parseClockTime, TIME_PRESETS, type Filters, type FoodKind } from "./filters.ts";

const PILL =
  "cursor-pointer rounded-sm border border-line px-3 py-1.5 has-checked:border-selected has-checked:bg-selected has-checked:text-on-selected has-focus-visible:outline-2 has-focus-visible:outline-food";
const FIELD = "rounded-sm border border-line bg-page px-3 py-2 text-ink";
const LEGEND = "font-display text-sm font-bold tracking-wide text-muted uppercase";

/** Builds the panel. `onChange` runs with the new filters whenever a choice changes. */
export function renderFilterPanel(eventTypes: string[], onChange: (filters: Filters) => void): HTMLElement {
  const panel = document.createElement("details");
  panel.className = "mt-6 border-y border-line";
  // The fixed markup is written here; event types come from the listings, so they're added as text below.
  panel.innerHTML = `
    <summary class="flex cursor-pointer list-none items-center justify-between gap-4 py-3">
      <span class="font-display font-bold">Filters<span data-count class="text-food"></span></span>
      <span aria-hidden="true" class="chevron shrink-0 text-muted"></span>
    </summary>
    <form class="pb-5">
      <fieldset>
        <legend class="${LEGEND}">Food</legend>
        <div class="mt-2 flex flex-wrap gap-2">
          ${pill("food", "", "Any", true)}${pill("food", "meal", "Meals")}${pill("food", "snack", "Snacks")}
        </div>
      </fieldset>
      <fieldset class="mt-5">
        <legend class="${LEGEND}">Time</legend>
        <div class="mt-2 flex flex-wrap gap-2">
          ${pill("time", "", "Any time", true)}
          ${Object.entries(TIME_PRESETS).map(([key, preset]) => pill("time", key, preset.label)).join("")}
          ${pill("time", "custom", "Custom")}
        </div>
        <div data-custom hidden class="mt-3">
          <div class="flex flex-wrap items-center gap-2">
            <label class="sr-only" for="time-from">From</label>
            <input id="time-from" name="from" type="time" class="${FIELD}" />
            <span>to</span>
            <label class="sr-only" for="time-to">To</label>
            <input id="time-to" name="to" type="time" class="${FIELD}" />
          </div>
          <p data-hint class="mt-2 text-sm text-muted">Shows events that overlap these times by at least a minute.</p>
        </div>
      </fieldset>
      <div class="mt-5">
        <label for="event-type" class="${LEGEND}">Event type</label>
        <select id="event-type" name="eventType" class="mt-2 block w-full ${FIELD}">
          <option value="">All event types</option>
        </select>
      </div>
      <button type="reset" class="mt-5 font-semibold underline decoration-line underline-offset-3 hover:decoration-current">Clear filters</button>
    </form>`;

  const form = panel.querySelector("form")!;
  const select = panel.querySelector<HTMLSelectElement>("select")!;
  for (const type of eventTypes) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    select.append(option);
  }

  const update = () => {
    const { filters, customChosen, customProblem } = readFilters(form);
    panel.querySelector<HTMLElement>("[data-custom]")!.hidden = !customChosen;
    const hint = panel.querySelector<HTMLElement>("[data-hint]")!;
    hint.textContent = customProblem ?? "Shows events that overlap these times by at least a minute.";
    hint.className = `mt-2 text-sm ${customProblem ? "text-error" : "text-muted"}`;
    const count = activeFilterCount(filters);
    panel.querySelector<HTMLElement>("[data-count]")!.textContent = count > 0 ? ` · ${count}` : "";
    onChange(filters);
  };
  form.addEventListener("input", update);
  // A reset clears the fields after this event runs, so read them on the next tick.
  form.addEventListener("reset", () => setTimeout(update));
  return panel;
}

function pill(name: string, value: string, label: string, checked = false): string {
  return `<label class="${PILL}"><input class="sr-only" type="radio" name="${name}" value="${value}"${checked ? " checked" : ""} />${label}</label>`;
}

function readFilters(form: HTMLFormElement): { filters: Filters; customChosen: boolean; customProblem: string | null } {
  const data = new FormData(form);
  const food = (data.get("food") || null) as FoodKind | null;
  const eventType = (data.get("eventType") as string) || null;
  const timeChoice = data.get("time") as string;

  let time: Filters["time"] = null;
  let customProblem: string | null = null;
  if (timeChoice === "custom") {
    const from = parseClockTime(data.get("from") as string);
    const to = parseClockTime(data.get("to") as string);
    if (from !== null && to !== null) {
      if (to > from) {
        time = { from, to };
      } else {
        customProblem = "Pick an end time after the start time.";
      }
    }
  } else if (timeChoice in TIME_PRESETS) {
    time = TIME_PRESETS[timeChoice as keyof typeof TIME_PRESETS].range;
  }
  return { filters: { ...NO_FILTERS, food, time, eventType }, customChosen: timeChoice === "custom", customProblem };
}

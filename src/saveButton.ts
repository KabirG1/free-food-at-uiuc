// The star on each event. Signed-in students tap it to save the event to their account; anyone else is
// asked to sign in. The account code loads after the list is drawn, so the list never waits on it.

import { element } from "./dom.ts";
import type { FoodEvent } from "./events.ts";
import { calendarAccessForTap, loadCalendarConnection, prepareCalendarAccess, syncSavedEvent } from "./googleCalendar.ts";
import { showNotice } from "./notice.ts";

const savedIds = new Set<string>();
let signedIn: Promise<boolean> | undefined;

// Fixed markup, so building it from a string is safe. The star fills in when saved (see aria-pressed below).
const STAR_SVG = `<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8l2.85 5.95 6.55.8-4.83 4.5 1.24 6.5L12 17.38l-5.81 3.17 1.24-6.5-4.83-4.5 6.55-.8z"/></svg>`;

/** Whether saving is set up on this copy of the site (a fresh clone without sign-in settings has no stars). */
export const savingAvailable = Boolean(import.meta.env.VITE_SUPABASE_URL);

export function renderSaveButton(event: FoodEvent): HTMLButtonElement {
  const button = element(
    "button",
    "-mt-2 -mr-2 flex size-11 cursor-pointer items-center justify-center rounded-sm text-muted hover:text-ink aria-pressed:text-food [&[aria-pressed=true]_svg]:fill-current",
    "",
  );
  button.type = "button";
  button.dataset.saveEvent = event.id;
  // The label stays the same; aria-pressed tells screen readers whether it's saved.
  button.setAttribute("aria-label", `Save ${event.title}`);
  button.setAttribute("aria-pressed", String(savedIds.has(event.id)));
  button.innerHTML = STAR_SVG;
  button.addEventListener("click", () => void toggleSaved(event));
  // A failure here is reported when the star is tapped, not on page load.
  (signedIn ??= loadSavedIds()).catch(() => undefined);
  return button;
}

async function loadSavedIds(): Promise<boolean> {
  try {
    const { loadSavedEvents } = await import("./savedEvents.ts");
    const saved = await loadSavedEvents();
    for (const event of saved ?? []) {
      savedIds.add(event.id);
    }
    updateButtons();
    if (saved !== null) {
      // With Google Calendar connected, get Google's script ready so a tap can open its window if needed.
      void loadCalendarConnection()
        .then((calendarId) => (calendarId === null ? undefined : prepareCalendarAccess()))
        .catch(() => undefined);
    }
    return saved !== null;
  } catch {
    // Try again on the next tap.
    signedIn = undefined;
    throw new Error("Couldn't load saved events");
  }
}

async function toggleSaved(event: FoodEvent): Promise<void> {
  // First, while the tap still counts: browsers only let Google's window open during one.
  const calendar = calendarAccessForTap();
  let isSignedIn: boolean;
  try {
    isSignedIn = await (signedIn ??= loadSavedIds());
  } catch {
    showNotice("Couldn't reach your account. Check your connection and try again.");
    return;
  }
  if (!isSignedIn) {
    showNotice("Sign in with your Illinois account to save events.", { label: "Sign in", href: "./account.html" });
    return;
  }

  const saving = !savedIds.has(event.id);
  // Fill or empty the star right away, then undo it if the database says no.
  setSaved(event.id, saving);
  try {
    const { saveEvent, unsaveEvent } = await import("./savedEvents.ts");
    await (saving ? saveEvent(event) : unsaveEvent(event.id));
    if (saving) {
      showNotice("Saved.", { label: "See saved events", href: "./saved.html" });
    }
  } catch {
    setSaved(event.id, !saving);
    showNotice(saving ? "Couldn't save that event. Try again." : "Couldn't remove that event. Try again.");
    return;
  }

  try {
    if ((await syncSavedEvent(calendar, event, saving)) && saving) {
      showNotice("Saved and added to Google Calendar.", { label: "See saved events", href: "./saved.html" });
    }
  } catch {
    // The save itself worked, so the star stays as it is. The Account page can add missing events again.
    if (saving) {
      showNotice("Saved, but couldn't add it to Google Calendar.", { label: "Try again on Account page", href: "./account.html" });
    } else {
      showNotice("Unsaved, but couldn't remove it from Google Calendar. You can delete it there.");
    }
  }
}

function setSaved(eventId: string, saved: boolean): void {
  if (saved) {
    savedIds.add(eventId);
  } else {
    savedIds.delete(eventId);
  }
  updateButtons();
}

function updateButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-save-event]")) {
    button.setAttribute("aria-pressed", String(savedIds.has(button.dataset.saveEvent ?? "")));
  }
}

// The star on each event. Signed-in students tap it to save the event to their account; anyone else is
// asked to sign in. The account code loads after the list is drawn, so the list never waits on it.

import { element } from "./dom.ts";
import type { FoodEvent } from "./events.ts";

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
    return saved !== null;
  } catch {
    // Try again on the next tap.
    signedIn = undefined;
    throw new Error("Couldn't load saved events");
  }
}

async function toggleSaved(event: FoodEvent): Promise<void> {
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

let notice: HTMLElement | undefined;
let noticeTimer: number | undefined;

/** A short message along the bottom of the screen, with an optional link. Replaces any message already showing. */
function showNotice(text: string, link?: { label: string; href: string }): void {
  if (notice === undefined) {
    notice = element("div", "fixed inset-x-4 bottom-4 z-30 mx-auto max-w-content rounded-sm bg-brand px-4 py-3 text-on-brand", "");
    notice.setAttribute("role", "status");
    document.body.append(notice);
  }
  notice.replaceChildren(text);
  if (link) {
    const anchor = element("a", "ml-2 font-semibold underline underline-offset-3", link.label);
    anchor.href = link.href;
    notice.append(anchor);
  }
  notice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    if (notice) {
      notice.hidden = true;
    }
  }, 6000);
}

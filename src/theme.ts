// Light and dark mode. "system" follows the device's setting; "light" and "dark" override it on this device.
// The choice is kept in the browser, so it works without an account.

import { element } from "./dom.ts";

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "theme";

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Runs in each page's <head>, before anything is drawn, so a saved choice never flashes the other colors first.
 * Vite adds it to every page (see vite.config.ts). Kept tiny and free of imports since it is copied in as text.
 */
export const EARLY_THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** The saved choice, or "system" when nothing (or something unexpected) is stored. */
export function parseThemeChoice(stored: string | null): ThemeChoice {
  return stored === "light" || stored === "dark" ? stored : "system";
}

function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be blocked (some private windows); the site then just follows the device.
    return "system";
  }
}

function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch {
    // Still applies to this page, just isn't remembered.
  }
}

function applyTheme(choice: ThemeChoice): void {
  if (choice === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = choice;
  }
}

/**
 * Re-applies the saved choice when the browser shows a page from its back/forward cache, which skips the
 * <head> script, so going back after changing the setting doesn't show the old colors.
 */
export function keepThemeCurrent(): void {
  window.addEventListener("pageshow", () => applyTheme(readThemeChoice()));
}

/** The "Appearance" setting: three options in a row that change the colors as soon as one is picked. */
export function renderThemePicker(): HTMLElement {
  const fieldset = element("fieldset", "mt-10 border-t-2 border-ink pt-4", "");
  const legend = element("legend", "float-left mb-4 w-full font-display text-xl leading-tight font-bold", "Appearance");
  // The gap sits on the legend: a margin on the row below a float is swallowed when it clears the float.
  const options = element("div", "clear-left flex border border-ink font-mono text-sm font-medium tracking-wide uppercase", "");
  const current = readThemeChoice();
  for (const choice of CHOICES) {
    const label = element(
      "label",
      "flex min-h-11 flex-1 cursor-pointer items-center justify-center border-ink px-3 not-first:border-l has-checked:bg-selected has-checked:text-on-selected has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-food",
      "",
    );
    const input = element("input", "sr-only", "");
    input.type = "radio";
    input.name = "theme";
    input.value = choice.value;
    input.checked = choice.value === current;
    input.addEventListener("change", () => {
      saveThemeChoice(choice.value);
      applyTheme(choice.value);
    });
    label.append(input, choice.label);
    options.append(label);
  }
  const note = element("p", "mt-2 text-sm text-muted", "System matches your phone or computer's setting. Your choice is saved on this device.");
  fieldset.append(legend, options, note);
  return fieldset;
}

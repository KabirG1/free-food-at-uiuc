// Suggestions under the Club box in Filters, drawn by the site so they match its look (the browser's own
// suggestion list can't be styled). Follows the ARIA combobox pattern: arrow keys move through the
// suggestions, Enter picks one, Escape closes the list, and screen readers hear which one is highlighted.

import { element } from "./dom.ts";
import { matchingClubs } from "./filters.ts";

const OPTION = "cursor-pointer px-3 py-2.5 hover:bg-line aria-selected:bg-line";

/** Adds the suggestion list below `input`, which must sit in a `relative` box. */
export function attachClubSuggestions(input: HTMLInputElement, clubs: string[]): void {
  const list = element("ul", "absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-sm border border-line bg-page", "");
  list.id = `${input.id}-suggestions`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Clubs");
  list.hidden = true;
  input.after(list);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");

  let shown: string[] = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const highlight = (index: number) => {
    active = index;
    for (const [position, option] of [...list.children].entries()) {
      option.setAttribute("aria-selected", String(position === index));
    }
    if (index >= 0) {
      const option = list.children[index];
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const choose = (club: string) => {
    input.value = club;
    close();
    // Lets the Filters panel see the new value, as if it had been typed.
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const open = () => {
    shown = matchingClubs(clubs, input.value);
    // Nothing to suggest, or the box already holds exactly the one match.
    if (shown.length === 0 || (shown.length === 1 && shown[0] === input.value)) {
      close();
      return;
    }
    list.replaceChildren(
      ...shown.map((club, index) => {
        // Club names come from the listings, so they go in as text.
        const option = element("li", OPTION, club);
        option.id = `${list.id}-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        // Picking on mousedown keeps focus in the box, which would otherwise close the list before the click lands.
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(club);
        });
        return option;
      }),
    );
    active = -1;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("input", (event) => {
    // Skip the event `choose` sends, so the list doesn't reopen.
    if (event.isTrusted) {
      open();
    }
  });
  input.addEventListener("focus", open);
  input.addEventListener("blur", close);
  input.form?.addEventListener("reset", close);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) {
        open();
      }
      if (shown.length > 0 && !list.hidden) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        highlight((active + step + shown.length) % shown.length);
      }
    } else if (event.key === "Enter" && !list.hidden && active >= 0) {
      event.preventDefault();
      choose(shown[active]);
    } else if (event.key === "Escape" && !list.hidden) {
      // Closes only the list; without this, the browser would also empty a search box.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
}

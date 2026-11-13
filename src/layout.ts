// The parts shared by every page: the menu in the header, the account menu, the footer, and the contact email links.

import { setUpAnnouncer } from "./announce.ts";
import { element } from "./dom.ts";
import { MAX_QUERY_LENGTH } from "./search.ts";

const PAGES = [
  { label: "Today", key: "" },
  { label: "Calendar", key: "calendar" },
  { label: "Submit", key: "submit" },
  { label: "FAQ", key: "faq" },
  { label: "Contact", key: "contact" },
];

// Stored reversed so bots that scan the site's files for addresses don't find it written out.
// (A plain split-and-join gets folded back into one string by the minifier.)
const CONTACT_EMAIL = [..."moc.liamg@91nagribak"].reverse().join("");

function pageHref(key: string): string {
  return key === "" ? "./" : `./${key}.html`;
}

export interface NavItem {
  label: string;
  href: string;
  current: boolean;
}

/** The page key for `pathname`: "" for the home page, "faq" for ".../faq.html" or ".../faq". */
function pageKey(pathname: string): string {
  const fileName = pathname.slice(pathname.lastIndexOf("/") + 1).replace(/\.html$/, "");
  return fileName === "index" ? "" : fileName;
}

/** The menu links, marking the one for the page at `pathname` (e.g. "/free-food-at-uiuc/faq.html"). */
export function navItems(pathname: string): NavItem[] {
  const currentKey = pageKey(pathname);
  return PAGES.map((page) => ({
    label: page.label,
    href: pageHref(page.key),
    current: page.key === currentKey,
  }));
}

// The footer is the same on every page. It is fixed text, so building it from a string is safe.
const FOOTER_HTML = `
  <div class="mx-auto max-w-page px-4 lg:px-8 pt-8 pb-12">
    <p class="font-display text-lg font-bold text-on-brand">Free Food <span class="text-brand-accent">@ UIUC</span></p>
    <p class="mt-3">Missing an event, or found something wrong?</p>
    <p class="mt-1"><a data-contact-email class="font-semibold text-on-brand underline decoration-on-brand-muted underline-offset-3 hover:decoration-current" href="./contact.html">Contact us</a></p>
    <nav aria-label="Footer" class="mt-6 flex flex-wrap gap-x-6 font-display text-sm font-semibold">
      ${[...PAGES, { label: "Privacy", key: "privacy" }].map((page) => `<a class="py-2 hover:text-on-brand" href="${pageHref(page.key)}">${page.label}</a>`).join("")}
    </nav>
    <p class="mt-4 text-sm">A student project, not affiliated with the University of Illinois.</p>
  </div>`;

/** Fills in the header menu, the footer, and any `[data-contact-email]` links on the page. */
export function setUpPage(): void {
  setUpAnnouncer();
  const nav = document.querySelector<HTMLElement>("#site-nav");
  if (nav) {
    renderNav(nav, window.location.pathname);
  }

  const footer = document.querySelector<HTMLElement>("#site-footer");
  if (footer) {
    footer.className = "mt-12 border-t-4 border-brand-accent bg-brand text-on-brand-muted";
    footer.innerHTML = FOOTER_HTML;
  }

  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-contact-email]")) {
    link.href = `mailto:${CONTACT_EMAIL}`;
    link.textContent = CONTACT_EMAIL;
  }
}

// Fixed markup, so building it from a string is safe.
const SEARCH_ICON_SVG = `<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`;

/** A search box that opens the Search page with what was typed. `inputId` must be unique on the page. */
export function renderSearchForm(inputId: string, className: string): HTMLFormElement {
  const form = element("form", `relative font-body text-base font-normal ${className}`, "");
  form.action = "./search.html";
  form.method = "get";
  form.setAttribute("role", "search");
  const input = element("input", "block w-full rounded-sm border border-line bg-page py-2 pr-11 pl-3 text-ink placeholder:text-muted", "");
  input.id = inputId;
  input.type = "search";
  input.name = "q";
  input.placeholder = "Search events";
  input.maxLength = MAX_QUERY_LENGTH;
  input.autocomplete = "off";
  input.enterKeyHint = "search";
  // The browser asks for something to be typed instead of opening an empty search.
  input.required = true;
  input.setAttribute("aria-label", "Search events");
  const button = element("button", "absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-muted hover:text-ink", "");
  button.type = "submit";
  button.setAttribute("aria-label", "Search");
  button.innerHTML = SEARCH_ICON_SVG;
  form.append(input, button);
  return form;
}

/**
 * The header menu. Wider screens show the links in a row, then the search box. Phones get a "Menu" button with
 * three lines that opens the search box and links as a list, so the row never wraps. The account control sits
 * at the right on every screen. The Search page has its own box, so the header leaves it out there.
 */
function renderNav(nav: HTMLElement, pathname: string): void {
  const items = navItems(pathname);
  const showSearch = pageKey(pathname) !== "search";
  nav.className = "mt-3 flex flex-wrap items-center gap-x-5 font-display text-sm font-semibold";

  const menuList = element("ul", "basis-full border-t border-on-brand-muted/30 py-2 sm:hidden", "");
  menuList.id = "menu-list";
  menuList.hidden = true;
  if (showSearch) {
    const entry = element("li", "py-3", "");
    entry.append(renderSearchForm("menu-search", ""));
    menuList.append(entry);
  }
  for (const item of items) {
    const entry = element("li", "", "");
    const link = renderNavLink(item);
    link.className = `block py-3 text-base ${item.current ? "text-on-brand" : "text-on-brand-muted hover:text-on-brand"}`;
    entry.append(link);
    menuList.append(entry);
  }
  const menuButton = renderToggle(menuList, "flex items-center gap-2 py-2 text-on-brand sm:hidden");
  menuButton.innerHTML = MENU_ICON_SVG;
  menuButton.append("Menu");

  const rowLinks = items.map((item) => {
    const link = renderNavLink(item);
    link.classList.add("hidden", "sm:block");
    return link;
  });

  nav.replaceChildren(menuButton, ...rowLinks);
  if (showSearch) {
    // Pushed to the right, with the account control right after it.
    nav.append(renderSearchForm("header-search", "ml-auto hidden w-48 sm:block"));
  }
  if (import.meta.env.VITE_SUPABASE_URL) {
    const account = renderAccountControl(["account", "saved", "following", "review"].includes(pageKey(pathname)));
    if (showSearch) {
      // On wider screens the search box already takes up the space on the right.
      account.classList.add("sm:ml-0");
    }
    nav.append(account);
  }
  nav.append(menuList);
}

// Fixed markup, so building it from a string is safe.
const MENU_ICON_SVG = `<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

/**
 * A button that shows and hides `panel` (the disclosure pattern). Escape closes it and puts focus back on the
 * button; for panels that float over the page, so does tapping anywhere else.
 */
function renderToggle(panel: HTMLElement, className: string, closeOnOutsideClick = false): HTMLButtonElement {
  const button = element("button", `cursor-pointer ${className}`, "");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", panel.id);
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  if (closeOnOutsideClick) {
    document.addEventListener("click", (event) => {
      const target = event.target as Node;
      if (!panel.hidden && !panel.contains(target) && !button.contains(target)) {
        setOpen(false);
      }
    });
  }
  return button;
}

/**
 * "Sign in" at the right of the menu. Once signed in, it becomes a round button with the student's initial
 * that opens their account menu: saved events, followed clubs, account settings, and sign out.
 */
function renderAccountControl(current: boolean): HTMLElement {
  const wrapper = element("div", "relative ml-auto", "");
  const signInLink = renderNavLink({ label: "Sign in", href: pageHref("account"), current });
  wrapper.append(signInLink);
  // Loaded after the page so sign-in never slows down the event list.
  void import("./auth.ts").then(async ({ currentUser, firstName, fullName, signOut }) => {
    const user = await currentUser();
    if (user === null) {
      return;
    }
    const panel = element("div", "absolute top-full right-0 z-20 mt-2 w-64 rounded-sm border border-line bg-page font-body text-base font-normal text-ink", "");
    panel.id = "account-menu";
    panel.hidden = true;
    const who = element("div", "border-b border-line px-4 py-3", "");
    who.append(element("p", "truncate font-semibold", fullName(user)), element("p", "truncate text-sm text-muted", user.email ?? ""));
    const menuItem = "block w-full cursor-pointer px-4 py-3 text-left hover:bg-line";
    const savedLink = element("a", menuItem, "Saved events");
    savedLink.href = pageHref("saved");
    const followingLink = element("a", menuItem, "Following");
    followingLink.href = pageHref("following");
    const settingsLink = element("a", menuItem, "Account settings");
    settingsLink.href = pageHref("account");
    const signOutButton = element("button", `${menuItem} border-t border-line`, "Sign out");
    signOutButton.type = "button";
    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;
      signOutButton.textContent = "Signing out…";
      await signOut();
      window.location.reload();
    });
    panel.append(who, savedLink, followingLink, settingsLink, signOutButton);

    // Only admins get this link, with how many events are waiting. If the check fails, the menu just goes without it.
    void import("./submissions.ts")
      .then(({ pendingSubmissionCount }) => pendingSubmissionCount())
      .then((pending) => {
        if (pending !== null) {
          const reviewLink = element("a", menuItem, `Review submissions (${pending})`);
          reviewLink.href = pageHref("review");
          followingLink.after(reviewLink);
        }
      })
      .catch(() => undefined);

    const button = renderToggle(panel, "flex items-center gap-2 py-1 text-on-brand", true);
    button.setAttribute("aria-label", `Account menu for ${firstName(user)}`);
    const initial = element("span", "flex size-9 items-center justify-center rounded-full bg-brand-accent font-bold text-brand", firstName(user).charAt(0).toUpperCase());
    initial.setAttribute("aria-hidden", "true");
    const name = element("span", `hidden max-w-32 truncate lg:block ${current ? "text-on-brand" : "text-on-brand-muted"}`, firstName(user));
    name.setAttribute("aria-hidden", "true");
    button.append(initial, name);
    wrapper.replaceChildren(button, panel);
  });
  return wrapper;
}

function renderNavLink(item: NavItem): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = item.href;
  link.textContent = item.label;
  link.className = item.current
    ? "border-b-2 border-brand-accent py-2 text-on-brand"
    : "border-b-2 border-transparent py-2 text-on-brand-muted hover:text-on-brand";
  if (item.current) {
    link.setAttribute("aria-current", "page");
  }
  return link;
}

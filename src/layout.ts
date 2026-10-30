// The parts shared by every page: the menu in the header, the sign-in link, the footer, and the contact email links.

const PAGES = [
  { label: "Today", key: "" },
  { label: "Calendar", key: "calendar" },
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
  <div class="mx-auto max-w-content px-4 pt-8 pb-12">
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
  const nav = document.querySelector<HTMLElement>("#site-nav");
  nav?.replaceChildren(...navItems(window.location.pathname).map(renderNavLink));
  if (nav && import.meta.env.VITE_SUPABASE_URL) {
    nav.append(renderAccountLink(pageKey(window.location.pathname) === "account"));
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

/** "Sign in" at the end of the menu, replaced by the student's first name once they're signed in. */
function renderAccountLink(current: boolean): HTMLAnchorElement {
  const link = renderNavLink({ label: "Sign in", href: pageHref("account"), current });
  link.classList.add("ml-auto", "max-w-24", "truncate");
  // Loaded after the page so sign-in never slows down the event list.
  void import("./auth.ts").then(async ({ currentUser, firstName }) => {
    const user = await currentUser();
    if (user) {
      link.textContent = firstName(user);
      link.setAttribute("aria-label", "Your account");
    }
  });
  return link;
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

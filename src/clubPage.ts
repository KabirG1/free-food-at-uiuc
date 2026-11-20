// The Club page (club.html?name=Chess%20Club), for clubs with at least one manager: what the managers wrote about
// the club, its links, a Follow button, and its upcoming free food from every source. The club's managers and admins
// can edit it right here.

import { clubPage, clubPageHref, instagramHandle, instagramUrl, type ClubPage } from "./clubPages.ts";
import { element } from "./dom.ts";
import { campusDate, clubKey, eventsNotEnded } from "./events.ts";
import { loadEventsFile, renderEventsByDay, renderMessage, renderSourceWarning } from "./eventList.ts";
import { renderFollowButton } from "./followButton.ts";
import { setUpPage } from "./layout.ts";
import { savingAvailable } from "./saveButton.ts";
import { isHttpsUrl } from "./submissionRules.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const FIELD = "mt-1 block w-full rounded-sm border border-line bg-page px-3 py-2.5 text-ink aria-invalid:border-error";
const PRIMARY_BUTTON = "cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const SECONDARY_BUTTON = "cursor-pointer rounded-sm border border-selected px-4 py-2.5 font-semibold";
const LINK = "underline decoration-line underline-offset-3 hover:decoration-current";
const DESCRIPTION_LIMIT = 500;

async function showClubPage(): Promise<void> {
  const name = (new URLSearchParams(window.location.search).get("name") ?? "").trim();
  if (name === "") {
    content.replaceChildren(renderMessage("No club chosen", "Tap a club's name on any event to see its page.", "empty"));
    return;
  }
  // Also loads which clubs have pages.
  const data = await loadEventsFile();
  const page = clubPage(name);
  if (page === undefined) {
    const link = element("a", "mt-6 inline-block rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected", "See its events");
    link.href = `./?${new URLSearchParams({ club: name })}`;
    content.replaceChildren(
      renderMessage(`${name} doesn't have a page`, "Clubs get a page once one of their officers manages the club on this site.", "empty"),
      link,
    );
    return;
  }
  document.title = `${page.club} · Free Food @ UIUC`;

  const header = element("section", "mt-8", "");
  const editArea = element("div", "", "");
  header.append(...renderProfile(page), editArea);

  const eventsSection = element("section", "", "");
  eventsSection.append(element("h2", "mt-10 border-t-2 border-ink pt-4 font-display text-xl leading-tight font-bold", "Upcoming free food"));
  if (data === null) {
    eventsSection.append(renderMessage("Couldn't load events", "Check your connection and refresh the page.", "error"));
  } else {
    const now = new Date();
    const events = eventsNotEnded(data.events, now).filter((event) => clubKey(event.club) === clubKey(page.club));
    eventsSection.append(
      ...renderSourceWarning(data.failedSources),
      ...(events.length > 0
        ? renderEventsByDay(events, campusDate(now))
        : [element("p", "mt-3 text-muted", "No upcoming events with free food listed right now. Check back closer to their next event.")]),
    );
  }
  content.replaceChildren(header, eventsSection);
  void offerEditing(page, editArea);
}

/** The club's name, Follow button, description, and links. */
function renderProfile(page: ClubPage): HTMLElement[] {
  const heading = element("div", "flex flex-wrap items-center gap-x-4 gap-y-2", "");
  heading.append(element("h1", "font-display text-2xl leading-tight font-extrabold sm:text-3xl", page.club));
  if (savingAvailable) {
    heading.append(renderFollowButton(page.club));
  }
  const parts: HTMLElement[] = [heading];
  if (page.description !== "") {
    // Line breaks the managers typed are kept. It goes in as text, so nothing they write can become markup.
    parts.push(element("p", "mt-4 whitespace-pre-line", page.description));
  }
  const links = element("ul", "mt-4 space-y-2", "");
  if (page.instagram !== "") {
    links.append(linkItem("Instagram", `@${page.instagram}`, instagramUrl(page.instagram)));
  }
  if (page.website !== "") {
    links.append(linkItem("Link", new URL(page.website).host.replace(/^www\./, ""), page.website));
  }
  if (links.childElementCount > 0) {
    parts.push(links);
  }
  return parts;
}

function linkItem(label: string, text: string, href: string): HTMLElement {
  const item = element("li", "", "");
  const link = element("a", `font-semibold break-all ${LINK}`, text);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  item.append(element("span", "mr-2 font-mono text-xs tracking-wide text-muted uppercase", label), link);
  return item;
}

/** Shows "Edit club page" to the club's managers and admins. Loaded after the page, so visitors never wait for it. */
async function offerEditing(page: ClubPage, editArea: HTMLElement): Promise<void> {
  try {
    const { currentUser } = await import("./auth.ts");
    const user = await currentUser();
    if (user === null) {
      return;
    }
    const { loadMyRequests, managedClubs, pendingReviewCount } = await import("./clubManagers.ts");
    const [requests, pending] = await Promise.all([loadMyRequests(user.id), pendingReviewCount()]);
    const manages = managedClubs(requests).some((club) => clubKey(club) === clubKey(page.club));
    if (!manages && pending === null) {
      return;
    }
  } catch {
    // Without the check, the page just goes without the button.
    return;
  }
  const button = element("button", `mt-6 ${SECONDARY_BUTTON}`, "Edit club page");
  button.type = "button";
  button.addEventListener("click", () => {
    const form = renderEditForm(page, () => editArea.replaceChildren(button));
    editArea.replaceChildren(form);
    form.querySelector("textarea")!.focus();
  });
  editArea.replaceChildren(button);
}

function renderEditForm(page: ClubPage, cancel: () => void): HTMLFormElement {
  const form = element("form", "mt-6 border-2 border-ink p-4", "");
  form.noValidate = true;
  const description = element("textarea", `${FIELD} min-h-32`, "");
  description.value = page.description;
  description.maxLength = DESCRIPTION_LIMIT;
  const instagram = element("input", FIELD, "");
  instagram.value = page.instagram === "" ? "" : `@${page.instagram}`;
  instagram.autocomplete = "off";
  instagram.placeholder = "@yourclub";
  const website = element("input", FIELD, "");
  website.type = "url";
  website.inputMode = "url";
  website.value = page.website;
  website.placeholder = "https://";

  const saveButton = element("button", PRIMARY_BUTTON, "Save");
  saveButton.type = "submit";
  const cancelButton = element("button", SECONDARY_BUTTON, "Cancel");
  cancelButton.type = "button";
  cancelButton.addEventListener("click", cancel);
  const buttons = element("div", "mt-6 flex flex-wrap gap-3", "");
  buttons.append(saveButton, cancelButton);
  const status = element("p", "mt-3", "");
  status.setAttribute("role", "status");

  form.append(
    element("h2", "font-display text-xl leading-tight font-bold", "Edit club page"),
    element("p", "mt-1 text-sm text-muted", "Anyone can see this page, signed in or not. Changes show as soon as you save."),
    field("club-description", "About the club", description, `Up to ${DESCRIPTION_LIMIT} characters.`),
    field("club-instagram", "Instagram (optional)", instagram, "Your handle, or paste a link to the profile."),
    field("club-website", "Another link (optional)", website, "Your website, Linktree, Discord, or OneIllinois page."),
    buttons,
    status,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const handle = instagramHandle(instagram.value);
    const link = website.value.trim();
    const problems = {
      instagram: handle === null ? "Enter an Instagram handle (letters, numbers, dots, and underscores), or leave it empty." : "",
      website: link !== "" && !(isHttpsUrl(link) && link.length <= 300) ? "Enter a full address starting with https://, or leave it empty." : "",
    };
    showProblem(instagram, problems.instagram);
    showProblem(website, problems.website);
    if (problems.instagram || problems.website) {
      (problems.instagram ? instagram : website).focus();
      status.className = "mt-3 text-error";
      status.textContent = "Check the highlighted fields.";
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    status.textContent = "";
    try {
      const { saveClubProfile } = await import("./clubManagers.ts");
      await saveClubProfile(page.club, { description: description.value.trim(), instagram: handle ?? "", website: link });
      // Reloading shows the page exactly as visitors will see it.
      window.location.href = clubPageHref(page.club);
    } catch {
      saveButton.disabled = false;
      saveButton.textContent = "Save";
      status.className = "mt-3 text-error";
      status.textContent = "Couldn't save the page. Your changes are still here, so check your connection and try again.";
    }
  });
  return form;
}

function field(id: string, label: string, control: HTMLInputElement | HTMLTextAreaElement, hint: string): HTMLElement {
  const wrapper = element("div", "mt-5", "");
  const labelElement = element("label", "font-semibold", label);
  labelElement.htmlFor = id;
  control.id = id;
  const hintElement = element("p", "text-sm text-muted", hint);
  hintElement.id = `${id}-hint`;
  const error = element("p", "mt-1 text-sm text-error", "");
  error.id = `${id}-error`;
  control.setAttribute("aria-describedby", `${hintElement.id} ${error.id}`);
  wrapper.append(labelElement, hintElement, control, error);
  return wrapper;
}

function showProblem(control: HTMLInputElement, problem: string): void {
  if (problem) {
    control.setAttribute("aria-invalid", "true");
  } else {
    control.removeAttribute("aria-invalid");
  }
  document.querySelector(`#${control.id}-error`)!.textContent = problem;
}

setUpPage();
void showClubPage();

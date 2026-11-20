// The Manage a club page: club leaders ask to manage their club and see where their requests stand. Once an admin
// approves, events they post for that club go on the site without review.

import type { User } from "@supabase/supabase-js";
import { currentUser, supabase } from "./auth.ts";
import { attachClubSuggestions } from "./clubSearch.ts";
import {
  AlreadyRequestedError,
  loadMyRequests,
  pendingReviewCount,
  requestToManage,
  TooManyRequestsError,
  type ManagerRequest,
  type ManagerStatus,
} from "./clubManagers.ts";
import { element } from "./dom.ts";
import { loadEventsFile, renderMessage } from "./eventList.ts";
import { clubsIn } from "./filters.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const FIELD = "mt-1 block w-full rounded-sm border border-line bg-page px-3 py-2.5 text-ink aria-invalid:border-error";
const PRIMARY_BUTTON = "cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const LINK = "underline decoration-line underline-offset-3 hover:decoration-current";

const STATUS_TEXT: Record<ManagerStatus, string> = {
  pending: "Waiting for an admin to check",
  approved: "You manage this club",
  rejected: "Not approved",
  removed: "No longer a manager",
};

async function showManagePage(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(renderMessage("Accounts aren't set up", "This copy of the site has no sign-in settings.", "empty"));
    return;
  }
  const user = await currentUser();
  if (user === null) {
    const link = element("a", "mt-6 inline-block rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected", "Sign in");
    link.href = "./account.html";
    content.replaceChildren(
      renderMessage("Sign in to manage a club", "Club officers can post their club's free food straight to the site. Sign in with your Illinois account to ask.", "empty"),
      link,
    );
    return;
  }

  let isAdmin: boolean;
  try {
    isAdmin = (await pendingReviewCount()) !== null;
  } catch {
    content.replaceChildren(renderMessage("Couldn't load this page", "Check your connection and refresh the page.", "error"));
    return;
  }

  const mine = element("section", "", "");
  content.replaceChildren(
    element("h1", "mt-8 font-display text-2xl leading-tight font-extrabold sm:text-3xl", "Manage a club"),
    element("p", "mt-3", "Are you an officer of a club? Once an admin confirms it, events you post for your club go on the site right away, without waiting for review."),
    isAdmin ? renderAdminNote() : await renderRequestForm(user, mine),
    mine,
  );
  await showMyRequests(user, mine);
}

/** Admins can already post for every club, so they get a pointer instead of the form. */
function renderAdminNote(): HTMLElement {
  const note = element("p", "mt-6 border-y border-line py-4", "You're an admin, so you can already post for any club from the ");
  const submitLink = element("a", LINK, "Submit page");
  submitLink.href = "./submit.html";
  const reviewLink = element("a", LINK, "Review page");
  reviewLink.href = "./review.html";
  note.append(submitLink, ". Requests from club officers appear on the ", reviewLink, ".");
  return note;
}

async function renderRequestForm(user: User, mine: HTMLElement): Promise<HTMLFormElement> {
  const form = element("form", "mt-6 border-t-2 border-ink pt-4", "");
  form.noValidate = true;

  const clubInput = textInput("club", 120);
  // The box sits in a `relative` wrapper so the suggestion list can float below it.
  const clubBox = element("div", "relative", "");
  clubBox.append(clubInput);
  const clubs = clubsIn((await loadEventsFile())?.events ?? []);
  attachClubSuggestions(clubInput, clubs);

  const roleInput = textInput("role", 60);
  const button = element("button", PRIMARY_BUTTON, "Send request");
  button.type = "submit";
  const status = element("p", "mt-3", "");
  status.setAttribute("role", "status");
  const buttons = element("div", "mt-6", "");
  buttons.append(button);

  form.append(
    element("h2", "font-display text-xl leading-tight font-bold", "Ask to manage a club"),
    labelled(clubInput, "Club", clubBox, "Use the club's name as it appears on OneIllinois, so an admin can find its officer list."),
    labelled(roleInput, "Your role", roleInput, "Such as President, Treasurer, or Events Chair."),
    buttons,
    status,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const club = clubInput.value.trim().replace(/\s+/g, " ");
    const role = roleInput.value.trim();
    const problems = { club: club === "" ? "Enter your club's name." : "", role: role === "" ? "Enter your role in the club." : "" };
    showProblem(clubInput, problems.club);
    showProblem(roleInput, problems.role);
    if (problems.club || problems.role) {
      (problems.club ? clubInput : roleInput).focus();
      status.className = "mt-3 text-error";
      status.textContent = "Check the highlighted fields.";
      return;
    }

    button.disabled = true;
    button.textContent = "Sending…";
    status.textContent = "";
    try {
      await requestToManage(club, role);
      form.reset();
      status.className = "mt-3 font-semibold";
      status.textContent = `Sent! An admin will check that you're an officer of ${club}.`;
      await showMyRequests(user, mine);
    } catch (error) {
      status.className = "mt-3 text-error";
      status.textContent =
        error instanceof AlreadyRequestedError
          ? `You've already asked to manage ${club}, or you already manage it. See below.`
          : error instanceof TooManyRequestsError
            ? "You have 3 requests waiting, which is the limit. Try again once an admin has checked them."
            : "Couldn't send that request. Your details are still here, so check your connection and try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Send request";
    }
  });
  return form;
}

function textInput(id: string, maxLength: number): HTMLInputElement {
  const input = element("input", FIELD, "");
  input.type = "text";
  input.id = id;
  input.name = id;
  input.maxLength = maxLength;
  input.autocomplete = "off";
  return input;
}

/** A label, hint, and error line around `control`, which is placed inside `wrapper` (or is the wrapper itself). */
function labelled(control: HTMLInputElement, label: string, wrapper: HTMLElement, hint: string): HTMLElement {
  const field = element("div", "mt-5", "");
  const labelElement = element("label", "font-semibold", label);
  labelElement.htmlFor = control.id;
  const hintElement = element("p", "text-sm text-muted", hint);
  hintElement.id = `${control.id}-hint`;
  const error = element("p", "mt-1 text-sm text-error", "");
  error.id = `${control.id}-error`;
  control.setAttribute("aria-describedby", `${hintElement.id} ${error.id}`);
  field.append(labelElement, hintElement, wrapper, error);
  return field;
}

function showProblem(control: HTMLInputElement, problem: string): void {
  if (problem) {
    control.setAttribute("aria-invalid", "true");
  } else {
    control.removeAttribute("aria-invalid");
  }
  document.querySelector(`#${control.id}-error`)!.textContent = problem;
}

async function showMyRequests(user: User, mine: HTMLElement): Promise<void> {
  let requests: ManagerRequest[];
  try {
    requests = await loadMyRequests(user.id);
  } catch {
    mine.replaceChildren(element("p", "mt-10 text-error", "Couldn't load your clubs. Refresh the page to try again."));
    return;
  }
  if (requests.length === 0) {
    mine.replaceChildren();
    return;
  }
  const list = element("ul", "mt-3 divide-y divide-line border-y border-line", "");
  for (const request of requests) {
    const item = element("li", "py-3", "");
    item.append(
      element("p", "font-semibold", request.club),
      element("p", "text-sm text-muted", request.role),
      element("p", `mt-1 text-sm font-semibold ${request.status === "approved" ? "text-food" : request.status === "pending" ? "" : "text-error"}`, STATUS_TEXT[request.status]),
    );
    if (request.status === "approved") {
      const postLink = element("a", `mt-1 inline-block text-sm font-semibold ${LINK}`, "Post an event for this club");
      postLink.href = "./submit.html";
      item.append(postLink);
    }
    list.append(item);
  }
  mine.replaceChildren(element("h2", "mt-10 border-t-2 border-ink pt-4 font-display text-xl leading-tight font-bold", "Your clubs"), list);
}

setUpPage();
void showManagePage();

// The Manage a club page: club leaders ask to manage their club and see where their requests stand. Once an admin
// approves, events they post for that club go on the site without review. Managers also see everyone who manages
// their club, invite other officers, and remove managers; invited officers accept or decline here.

import type { User } from "@supabase/supabase-js";
import { currentUser, supabase } from "./auth.ts";
import { attachClubSuggestions } from "./clubSearch.ts";
import {
  AlreadyOnTeamError,
  AlreadyRequestedError,
  inviteManager,
  isIllinoisEmail,
  loadClubTeams,
  loadMyRequests,
  managedClubs,
  pendingReviewCount,
  removeManager,
  requestToManage,
  respondToInvitation,
  roleText,
  TeamFullError,
  TooManyRequestsError,
  type ManagerRequest,
  type ManagerStatus,
} from "./clubManagers.ts";
import { element } from "./dom.ts";
import { clubKey } from "./events.ts";
import { loadEventsFile, renderMessage } from "./eventList.ts";
import { clubsIn } from "./filters.ts";
import { setUpPage } from "./layout.ts";
import { loadEventsOnSite, type SubmittedEvent } from "./submissions.ts";
import { describeWhen, renderEditLink, renderTakeDownButton } from "./submissionView.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const FIELD = "mt-1 block w-full rounded-sm border border-line bg-page px-3 py-2.5 text-ink aria-invalid:border-error";
const PRIMARY_BUTTON = "cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const SMALL_BUTTON = "min-h-11 cursor-pointer rounded-sm border px-3 text-sm font-semibold disabled:opacity-60";
const LINK = "underline decoration-line underline-offset-3 hover:decoration-current";
const SECTION_HEADING = "mt-10 border-t-2 border-ink pt-4 font-display text-xl leading-tight font-bold";

/** For the student's past requests and invitations. Current clubs are shown in their own sections instead. */
const STATUS_TEXT: Record<ManagerStatus, string> = {
  pending: "Waiting for an admin to check",
  approved: "You manage this club",
  rejected: "Not approved",
  removed: "No longer a manager",
  invited: "Invited",
  declined: "You declined the invitation",
  cancelled: "Invitation withdrawn",
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

  // Invitations and the student's clubs go above the request form, since they're what a returning manager came for.
  const clubsArea = element("div", "", "");
  const history = element("section", "", "");
  const refresh = () => showClubs(user, isAdmin, clubsArea, history);
  content.replaceChildren(
    element("h1", "mt-8 font-display text-2xl leading-tight font-extrabold sm:text-3xl", "Manage a club"),
    element("p", "mt-3", "Are you an officer of a club? Once an admin confirms it, events you post for your club go on the site right away, without waiting for review."),
    clubsArea,
    isAdmin ? renderAdminNote() : await renderRequestForm(refresh),
    history,
  );
  await refresh();
}

/** Draws the invitations, a section for each club the student manages, and their past requests. */
async function showClubs(user: User, isAdmin: boolean, clubsArea: HTMLElement, history: HTMLElement): Promise<void> {
  let mine: ManagerRequest[];
  let teams: ManagerRequest[];
  let clubEvents: SubmittedEvent[];
  try {
    // Admins see every club's team, which belongs on the Review page, not here.
    [mine, teams, clubEvents] = await Promise.all([
      loadMyRequests(user.id),
      isAdmin ? Promise.resolve([]) : loadClubTeams(),
      isAdmin ? Promise.resolve([]) : loadEventsOnSite(),
    ]);
  } catch {
    clubsArea.replaceChildren(element("p", "mt-6 text-error", "Couldn't load your clubs. Refresh the page to try again."));
    history.replaceChildren();
    return;
  }
  const refresh = () => showClubs(user, isAdmin, clubsArea, history);
  const myEmail = (user.email ?? "").toLowerCase();
  const invitations = teams.filter((row) => row.status === "invited" && row.email === myEmail);
  clubsArea.replaceChildren(
    ...invitations.map((invitation) => renderInvitation(invitation, refresh)),
    ...managedClubs(mine).map((club) =>
      renderTeam(
        club,
        teams.filter((row) => clubKey(row.club) === clubKey(club)),
        clubEvents.filter((event) => clubKey(event.club) === clubKey(club)),
        myEmail,
        refresh,
      ),
    ),
  );

  const past = mine.filter((row) => row.status !== "approved");
  if (past.length === 0) {
    history.replaceChildren();
    return;
  }
  const list = element("ul", "mt-3 divide-y divide-line border-y border-line", "");
  for (const request of past) {
    const item = element("li", "py-3", "");
    item.append(
      element("p", "font-semibold", request.club),
      element("p", "text-sm text-muted", roleText(request)),
      element("p", `mt-1 text-sm font-semibold ${request.status === "pending" ? "" : "text-error"}`, STATUS_TEXT[request.status]),
    );
    list.append(item);
  }
  history.replaceChildren(element("h2", SECTION_HEADING, "Your requests"), list);
}

/** An invitation from another manager, with Accept and Decline. */
function renderInvitation(invitation: ManagerRequest, refresh: () => Promise<void>): HTMLElement {
  const section = element("section", "mt-6 border-2 border-ink p-4", "");
  section.append(
    element("h2", "font-display text-xl leading-tight font-bold", `Invitation to manage ${invitation.club}`),
    element(
      "p",
      "mt-2",
      `${invitation.added_by_email ?? "A manager"} invited you to manage ${invitation.club}. If you accept, events you post for the club go on the site right away, and you can add or remove the club's other managers.`,
    ),
  );
  const buttons = element("div", "mt-4 flex flex-wrap gap-3", "");
  const status = element("p", "mt-2 text-sm text-error", "");
  status.setAttribute("role", "status");
  const respond = (accept: boolean) => async () => {
    for (const each of buttons.querySelectorAll("button")) {
      each.disabled = true;
    }
    status.textContent = "";
    try {
      const applied = await respondToInvitation(invitation.id, accept);
      if (!applied) {
        window.alert("This invitation was withdrawn or already answered.");
      }
      await refresh();
    } catch {
      for (const each of buttons.querySelectorAll("button")) {
        each.disabled = false;
      }
      status.textContent = "That didn't go through. Check your connection and try again.";
    }
  };
  const accept = element("button", PRIMARY_BUTTON, "Accept");
  accept.type = "button";
  accept.addEventListener("click", respond(true));
  const decline = element("button", `${SMALL_BUTTON} border-error px-4 text-base text-error`, "Decline");
  decline.type = "button";
  decline.addEventListener("click", respond(false));
  buttons.append(accept, decline);
  section.append(buttons, status);
  return section;
}

/**
 * One club the student manages: a link to post, its upcoming events on the site with Edit and Take off the site,
 * everyone who manages it or is invited, and a box to invite more.
 */
function renderTeam(club: string, team: ManagerRequest[], events: SubmittedEvent[], myEmail: string, refresh: () => Promise<void>): HTMLElement {
  const section = element("section", "", "");
  const postLink = element("a", `font-semibold ${LINK}`, "Post an event for this club");
  postLink.href = `./submit.html?club=${encodeURIComponent(club)}`;
  const postLine = element("p", "mt-2", "");
  postLine.append(postLink);
  section.append(
    element("h2", SECTION_HEADING, club),
    postLine,
    element("h3", "mt-6 font-display text-lg font-bold", "Upcoming events"),
    renderClubEvents(events, refresh),
    element("h3", "mt-8 font-display text-lg font-bold", "Managers"),
  );

  const list = element("ul", "mt-2 divide-y divide-line border-y border-line", "");
  // Accepted managers first, then open invitations.
  const ordered = [...team.filter((row) => row.status === "approved"), ...team.filter((row) => row.status === "invited")];
  for (const member of ordered) {
    list.append(renderTeamMember(member, member.email === myEmail, refresh));
  }
  section.append(list, renderInviteForm(club, refresh));
  return section;
}

/** The club's events on the site that came through this site, whoever posted them. OneIllinois events can't be edited here. */
function renderClubEvents(events: SubmittedEvent[], refresh: () => Promise<void>): HTMLElement {
  if (events.length === 0) {
    return element("p", "mt-2 text-muted", "None on the site right now. Events from OneIllinois are changed on OneIllinois.");
  }
  const list = element("ul", "mt-2 divide-y divide-line border-y border-line", "");
  for (const event of events) {
    const item = element("li", "py-3", "");
    const actions = element("div", "mt-2 flex flex-wrap gap-3", "");
    actions.append(renderEditLink(event, "manage"), ...renderTakeDownButton(event, refresh));
    item.append(
      element("p", "font-semibold", event.title),
      element("p", "text-sm text-muted", describeWhen(event.starts_at, event.ends_at)),
      element("p", "text-sm text-muted", event.location),
      actions,
    );
    list.append(item);
  }
  return list;
}

function renderTeamMember(member: ManagerRequest, isMe: boolean, refresh: () => Promise<void>): HTMLElement {
  const item = element("li", "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3", "");
  const details = element("div", "min-w-0", "");
  details.append(element("p", "font-semibold break-all", isMe ? `${member.email} (you)` : member.email));
  details.append(element("p", "text-sm text-muted", member.status === "invited" ? "Invited, hasn't accepted yet" : roleText(member)));
  if (member.added_by_email) {
    details.append(element("p", "text-sm text-muted break-all", `Added by ${member.added_by_email}`));
  }

  const label = isMe ? "Stop managing" : member.status === "invited" ? "Withdraw invitation" : "Remove";
  const button = element("button", `${SMALL_BUTTON} shrink-0 border-error text-error`, label);
  button.type = "button";
  if (!isMe) {
    button.setAttribute("aria-label", `${label}: ${member.email}`);
  }
  const problem = element("p", "basis-full text-sm text-error", "");
  problem.setAttribute("role", "status");
  button.addEventListener("click", async () => {
    // Leaving can't be undone without asking an admin or another manager again, so it asks first.
    if (isMe && !window.confirm(`Stop managing ${member.club}? To manage it again, another manager will have to invite you, or an admin approve a new request.`)) {
      return;
    }
    button.disabled = true;
    button.textContent = "Removing…";
    problem.textContent = "";
    try {
      await removeManager(member.id);
      await refresh();
    } catch {
      button.disabled = false;
      button.textContent = label;
      problem.textContent = "That didn't go through. Check your connection and try again.";
    }
  });
  item.append(details, button, problem);
  return item;
}

function renderInviteForm(club: string, refresh: () => Promise<void>): HTMLFormElement {
  const form = element("form", "mt-4", "");
  form.noValidate = true;
  const emailInput = element("input", FIELD, "");
  emailInput.type = "email";
  // Unique per club, since a manager can have several clubs on the page.
  emailInput.id = `invite-${clubKey(club).replace(/[^a-z0-9]+/g, "-")}`;
  emailInput.name = "email";
  emailInput.autocomplete = "off";
  emailInput.inputMode = "email";
  emailInput.placeholder = "netid@illinois.edu";
  const button = element("button", PRIMARY_BUTTON, "Invite");
  button.type = "submit";
  const row = element("div", "mt-1 flex gap-3", "");
  row.append(emailInput, button);
  emailInput.classList.remove("mt-1");
  const status = element("p", "mt-2 text-sm", "");
  status.setAttribute("role", "status");
  const labelElement = element("label", "font-semibold", "Add a manager");
  labelElement.htmlFor = emailInput.id;
  const hint = element("p", "text-sm text-muted", "Another officer's Illinois email. They'll see the invitation on this page once they sign in, so let them know to check.");
  hint.id = `${emailInput.id}-hint`;
  emailInput.setAttribute("aria-describedby", `${hint.id} ${emailInput.id}-status`);
  status.id = `${emailInput.id}-status`;
  form.append(labelElement, hint, row, status);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!isIllinoisEmail(email)) {
      emailInput.setAttribute("aria-invalid", "true");
      status.className = "mt-2 text-sm text-error";
      status.textContent = "Enter an email ending in @illinois.edu.";
      emailInput.focus();
      return;
    }
    emailInput.removeAttribute("aria-invalid");
    button.disabled = true;
    button.textContent = "Inviting…";
    status.textContent = "";
    try {
      await inviteManager(club, email);
      await refresh();
    } catch (error) {
      status.className = "mt-2 text-sm text-error";
      status.textContent =
        error instanceof AlreadyOnTeamError
          ? `${email} already manages ${club}, is already invited, or has asked an admin to manage it.`
          : error instanceof TeamFullError
            ? `${club} has 10 managers and invitations, which is the limit. Remove someone to add another.`
            : "Couldn't send that invitation. Check your connection and try again.";
      button.disabled = false;
      button.textContent = "Invite";
    }
  });
  return form;
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

async function renderRequestForm(onSent: () => Promise<void>): Promise<HTMLFormElement> {
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
      await onSent();
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

setUpPage();
void showManagePage();

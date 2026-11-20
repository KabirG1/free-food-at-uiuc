// The Review page, for admins: approve or reject submitted events, take approved ones back off the site, and decide
// who manages which club. Hiding this page from others is only a courtesy. The database refuses decisions from
// anyone who isn't an admin.

import { currentUser, supabase } from "./auth.ts";
import { decideManagerRequest, loadRequestsToReview, pendingReviewCount, removeManager, roleText, type ManagerRequest } from "./clubManagers.ts";
import { element } from "./dom.ts";
import { renderMessage } from "./eventList.ts";
import { setUpPage } from "./layout.ts";
import { isHttpsUrl } from "./submissionRules.ts";
import { loadSubmissionsToReview, reviewSubmission, type SubmittedEvent } from "./submissions.ts";
import { describeWhen, renderEditLink } from "./submissionView.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const LINK = "underline decoration-line underline-offset-3 hover:decoration-current";
const APPROVE_BUTTON = "cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const REJECT_BUTTON = "cursor-pointer rounded-sm border border-error px-4 py-2.5 font-semibold text-error disabled:opacity-60";
const SECTION_HEADING = "mt-10 border-t-2 border-ink pt-4 font-display text-xl leading-tight font-bold";

interface ReviewData {
  submissions: SubmittedEvent[];
  managers: ManagerRequest[];
}

async function showReviewPage(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(renderMessage("Accounts aren't set up", "This copy of the site has no sign-in settings.", "empty"));
    return;
  }
  if ((await currentUser()) === null) {
    const link = element("a", "mt-6 inline-block rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected", "Sign in");
    link.href = "./account.html";
    content.replaceChildren(renderMessage("Sign in to review events", "This page is for the site's admins.", "empty"), link);
    return;
  }

  let data: ReviewData;
  try {
    if ((await pendingReviewCount()) === null) {
      content.replaceChildren(renderMessage("This page is for admins", "Your account can't review events. You can still submit one from the Submit page.", "empty"));
      return;
    }
    data = await loadReviewData();
  } catch {
    content.replaceChildren(renderMessage("Couldn't load submissions", "Check your connection and refresh the page.", "error"));
    return;
  }
  renderPage(data);
}

async function loadReviewData(): Promise<ReviewData> {
  const [submissions, managers] = await Promise.all([loadSubmissionsToReview(), loadRequestsToReview()]);
  return { submissions, managers };
}

function renderPage({ submissions, managers }: ReviewData, notice = ""): void {
  const pending = submissions.filter((submission) => submission.status === "pending");
  const approved = submissions.filter((submission) => submission.status === "approved");
  const requests = managers.filter((request) => request.status === "pending");
  // Managers and open invitations together, grouped by club, so each club's whole team shows in one place.
  const current = managers.filter((request) => request.status === "approved" || request.status === "invited");
  const noticeLine = element("p", "mt-3 font-semibold", notice);
  noticeLine.setAttribute("role", "status");

  content.replaceChildren(
    element("h1", "mt-8 font-display text-2xl leading-tight font-extrabold sm:text-3xl", "Review"),
    noticeLine,
    element("h2", SECTION_HEADING.replace("mt-10", "mt-8"), `Events waiting for review (${pending.length})`),
    pending.length > 0 ? renderList(pending.map(renderSubmission)) : element("p", "mt-2 text-muted", "Nothing is waiting right now."),
    element("h2", SECTION_HEADING, `Club manager requests (${requests.length})`),
    requests.length > 0 ? renderList(requests.map(renderManager)) : element("p", "mt-2 text-muted", "No requests right now."),
    element("p", "mt-2 text-sm text-muted", "Before approving, check that the person is listed as an officer on the club's OneIllinois page."),
    element("h2", SECTION_HEADING, `On the site (${approved.length})`),
    element("p", "mt-2 text-sm text-muted", "Approved events and events club managers posted. Changes show on the site right away."),
    ...(approved.length > 0 ? [renderList(approved.map(renderSubmission))] : []),
    element("h2", SECTION_HEADING, `Club managers (${current.length})`),
    current.length > 0 ? renderList(current.map(renderManager)) : element("p", "mt-2 text-muted", "No clubs have managers yet."),
  );
}

function renderList(items: HTMLElement[]): HTMLElement {
  const list = element("ul", "mt-3 divide-y divide-line border-y border-line", "");
  list.append(...items);
  return list;
}

interface Action {
  label: string;
  workingText: string;
  style: string;
  /** Returns false if someone else already decided. */
  run: () => Promise<boolean>;
  doneText: string;
}

/** Buttons that each make one decision, then reload the page with a note saying what happened. */
function renderActions(name: string, actions: Action[]): HTMLElement[] {
  const buttons = element("div", "mt-3 flex flex-wrap gap-3", "");
  const problem = element("p", "mt-2 text-sm text-error", "");
  problem.setAttribute("role", "status");
  const setDisabled = (disabled: boolean) => {
    for (const each of buttons.querySelectorAll("button")) {
      each.disabled = disabled;
    }
  };
  for (const action of actions) {
    const button = element("button", action.style, action.label);
    button.type = "button";
    button.addEventListener("click", async () => {
      setDisabled(true);
      button.textContent = action.workingText;
      problem.textContent = "";
      try {
        const applied = await action.run();
        renderPage(await loadReviewData(), applied ? `${action.doneText}: ${name}` : `Another admin already decided on "${name}".`);
      } catch {
        button.textContent = action.label;
        setDisabled(false);
        problem.textContent = "That didn't go through. Check your connection and try again.";
      }
    });
    buttons.append(button);
  }
  return [buttons, problem];
}

function renderSubmission(submission: SubmittedEvent): HTMLElement {
  const item = element("li", "py-4", "");
  item.append(
    element("p", "text-lg leading-tight font-semibold", submission.title),
    element("p", "mt-1 text-muted", submission.club),
    element("p", "mt-1", describeWhen(submission.starts_at, submission.ends_at)),
    element("p", "mt-1", submission.location),
    element("p", "mt-1 font-semibold text-food", submission.food),
  );
  if (submission.club_post) {
    item.append(element("p", "mt-1 font-mono text-xs tracking-wide uppercase", "Posted by a club manager"));
  }
  if (submission.event_type !== "") {
    item.append(element("p", "mt-1 text-sm text-muted", submission.event_type));
  }
  if (submission.url !== null && isHttpsUrl(submission.url)) {
    // Showing the full address lets the admin see where it goes before tapping it.
    const link = element("a", `break-all ${LINK}`, submission.url);
    link.href = submission.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const line = element("p", "mt-1 text-sm", "");
    line.append(link);
    item.append(line);
  }

  const decide = (decision: "approved" | "rejected") => () => reviewSubmission(submission.id, decision);
  const [buttons, problem] = renderActions(
    submission.title,
    submission.status === "pending"
      ? [
          { label: "Approve", workingText: "Approving…", style: APPROVE_BUTTON, run: decide("approved"), doneText: "Approved" },
          { label: "Reject", workingText: "Rejecting…", style: REJECT_BUTTON, run: decide("rejected"), doneText: "Rejected" },
        ]
      : [{ label: "Take off the site", workingText: "Removing…", style: REJECT_BUTTON, run: decide("rejected"), doneText: "Taken off the site" }],
  );
  // Fixing a typo before approving, or a detail on the site, without rejecting and asking for it again.
  const edit = renderEditLink(submission, "review");
  edit.classList.replace("text-sm", "text-base");
  edit.classList.replace("px-3", "px-4");
  buttons.append(edit);
  item.append(buttons, problem);
  return item;
}

function renderManager(request: ManagerRequest): HTMLElement {
  const item = element("li", "py-4", "");
  item.append(
    element("p", "text-lg leading-tight font-semibold", request.club),
    element("p", "mt-1 break-all", `${request.status === "invited" ? "Invited" : roleText(request)} · ${request.email}`),
  );
  if (request.added_by_email) {
    item.append(element("p", "mt-1 text-sm text-muted break-all", `Added by ${request.added_by_email}`));
  }
  const decide = (decision: "approved" | "rejected") => () => decideManagerRequest(request.id, decision);
  const remove = () => removeManager(request.id);
  const who = `${request.email} for ${request.club}`;
  const actions: Record<"pending" | "approved" | "invited", Action[]> = {
    pending: [
      { label: "Approve", workingText: "Approving…", style: APPROVE_BUTTON, run: decide("approved"), doneText: "Approved" },
      { label: "Reject", workingText: "Rejecting…", style: REJECT_BUTTON, run: decide("rejected"), doneText: "Rejected" },
    ],
    approved: [{ label: "Remove as manager", workingText: "Removing…", style: REJECT_BUTTON, run: remove, doneText: "Removed" }],
    invited: [{ label: "Withdraw invitation", workingText: "Withdrawing…", style: REJECT_BUTTON, run: remove, doneText: "Invitation withdrawn" }],
  };
  item.append(...renderActions(who, actions[request.status as keyof typeof actions] ?? []));
  return item;
}

setUpPage();
void showReviewPage();

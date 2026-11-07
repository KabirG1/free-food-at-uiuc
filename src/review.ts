// The Review page, for admins: approve or reject submitted events, and take approved ones back off the site.
// Hiding this page from others is only a courtesy. The database refuses decisions from anyone who isn't an admin.

import { currentUser, supabase } from "./auth.ts";
import { element } from "./dom.ts";
import { renderMessage } from "./eventList.ts";
import { setUpPage } from "./layout.ts";
import { isHttpsUrl } from "./submissionRules.ts";
import { loadSubmissionsToReview, pendingSubmissionCount, reviewSubmission, type SubmittedEvent } from "./submissions.ts";
import { describeWhen } from "./submissionView.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const WORKFLOW_URL = "https://github.com/kabirg1/free-food-at-uiuc/actions/workflows/deploy.yml";
const LINK = "underline decoration-line underline-offset-3 hover:decoration-current";
const APPROVE_BUTTON = "cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const REJECT_BUTTON = "cursor-pointer rounded-sm border border-error px-4 py-2.5 font-semibold text-error disabled:opacity-60";

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

  let submissions: SubmittedEvent[];
  try {
    if ((await pendingSubmissionCount()) === null) {
      content.replaceChildren(renderMessage("This page is for admins", "Your account can't review events. You can still submit one from the Submit page.", "empty"));
      return;
    }
    submissions = await loadSubmissionsToReview();
  } catch {
    content.replaceChildren(renderMessage("Couldn't load submissions", "Check your connection and refresh the page.", "error"));
    return;
  }
  renderSubmissions(submissions);
}

function renderSubmissions(submissions: SubmittedEvent[], notice = ""): void {
  const pending = submissions.filter((submission) => submission.status === "pending");
  const approved = submissions.filter((submission) => submission.status === "approved");
  const noticeLine = element("p", "mt-3 font-semibold", notice);
  noticeLine.setAttribute("role", "status");

  content.replaceChildren(
    element("h1", "mt-8 font-display text-xl leading-tight font-bold", "Review submissions"),
    noticeLine,
    element("h2", "mt-6 font-display text-lg font-bold", `Waiting for review (${pending.length})`),
    pending.length > 0 ? renderList(pending) : element("p", "mt-2 text-muted", "Nothing is waiting right now."),
    element("h2", "mt-10 font-display text-lg font-bold", `Approved (${approved.length})`),
    updateNote(),
    ...(approved.length > 0 ? [renderList(approved)] : []),
  );
}

function updateNote(): HTMLElement {
  const note = element("p", "mt-2 text-sm text-muted", "Approved events appear at the site's next update, four times a day. If you have access to the GitHub repository, you can ");
  const link = element("a", LINK, "run the update now");
  link.href = WORKFLOW_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  note.append(link, ".");
  return note;
}

function renderList(submissions: SubmittedEvent[]): HTMLElement {
  const list = element("ul", "mt-3 divide-y divide-line border-y border-line", "");
  list.append(...submissions.map(renderSubmission));
  return list;
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

  const buttons = element("div", "mt-3 flex flex-wrap gap-3", "");
  const problem = element("p", "mt-2 text-sm text-error", "");
  problem.setAttribute("role", "status");
  const decide = (button: HTMLButtonElement, workingText: string, decision: "approved" | "rejected", doneText: string) => {
    button.addEventListener("click", async () => {
      for (const each of buttons.querySelectorAll("button")) {
        each.disabled = true;
      }
      const originalText = button.textContent;
      button.textContent = workingText;
      problem.textContent = "";
      try {
        const applied = await reviewSubmission(submission.id, decision);
        renderSubmissions(
          await loadSubmissionsToReview(),
          applied ? `${doneText}: ${submission.title}` : `Another admin already decided on "${submission.title}".`,
        );
      } catch {
        button.textContent = originalText;
        for (const each of buttons.querySelectorAll("button")) {
          each.disabled = false;
        }
        problem.textContent = "That didn't go through. Check your connection and try again.";
      }
    });
  };

  if (submission.status === "pending") {
    const approve = element("button", APPROVE_BUTTON, "Approve");
    const reject = element("button", REJECT_BUTTON, "Reject");
    approve.type = "button";
    reject.type = "button";
    decide(approve, "Approving…", "approved", "Approved");
    decide(reject, "Rejecting…", "rejected", "Rejected");
    buttons.append(approve, reject);
  } else {
    const remove = element("button", REJECT_BUTTON, "Take off the site");
    remove.type = "button";
    decide(remove, "Removing…", "rejected", "Taken off at the next update");
    buttons.append(remove);
  }
  item.append(buttons, problem);
  return item;
}

setUpPage();
void showReviewPage();

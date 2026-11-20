// The Submit page: a form for signed-in students, and the status of what they've already submitted.

import type { User } from "@supabase/supabase-js";
import { currentUser, supabase } from "./auth.ts";
import { loadMyRequests, managedClubs, pendingReviewCount, postClubEvent, takeDownClubEvent } from "./clubManagers.ts";
import { element } from "./dom.ts";
import { campusDate } from "./events.ts";
import { renderMessage } from "./eventList.ts";
import type { FlyerProblem } from "./flyer.ts";
import { looksLikeAnEvent, type FlyerDetails } from "./flyerRules.ts";
import { setUpPage } from "./layout.ts";
import { checkSubmission, type FormProblems, type SubmissionForm } from "./submissionRules.ts";
import { loadMySubmissions, submitEvent, TooManyPendingError, type SubmissionStatus, type SubmittedEvent } from "./submissions.ts";
import { describeWhen } from "./submissionView.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const FIELD = "mt-1 block w-full rounded-sm border border-line bg-page px-3 py-2.5 text-ink aria-invalid:border-error";
const PRIMARY_BUTTON = "cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";
const SECONDARY_BUTTON = "cursor-pointer rounded-sm border border-selected px-4 py-2.5 font-semibold";

const EVENT_TYPES = ["Academic", "Athletic/Sports", "Community Service", "Cultural", "Dinner/Gala", "Educational/Awareness", "Fundraiser", "Meeting", "Social", "Workshop"];

const STATUS_TEXT: Record<SubmissionStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Not approved",
};

async function showSubmitPage(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(renderMessage("Accounts aren't set up", "This copy of the site has no sign-in settings.", "empty"));
    return;
  }
  const user = await currentUser();
  if (user === null) {
    const link = element("a", "mt-6 inline-block rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected", "Sign in");
    link.href = "./account.html";
    content.replaceChildren(
      renderMessage("Sign in to submit an event", "Know about free food that isn't listed? Sign in with your Illinois account to add it. Submitting takes about a minute.", "empty"),
      link,
    );
    return;
  }
  const posting = await loadPostingRights(user);
  const mine = element("section", "", "");
  const form = renderForm(user, mine, posting);
  content.replaceChildren(
    element("h1", "mt-8 font-display text-2xl leading-tight font-extrabold sm:text-3xl", "Submit an event"),
    element("p", "mt-3", "Know about free food that isn't listed? Add it here. An admin checks each event before it goes on the site, and it appears as soon as it's approved."),
    ...(posting.clubs.length === 0 && !posting.isAdmin ? [renderManageHint()] : []),
    renderFlyerUpload(form),
    form,
    mine,
  );
  await showMySubmissions(user, mine);
}

interface PostingRights {
  /** Clubs the student manages, whose events go on the site without review. */
  clubs: string[];
  /** Admins can post for any club without review. */
  isAdmin: boolean;
}

/** If this can't be checked, the form still works, with every event going to review. */
async function loadPostingRights(user: User): Promise<PostingRights> {
  try {
    const [requests, pending] = await Promise.all([loadMyRequests(user.id), pendingReviewCount()]);
    return { clubs: managedClubs(requests), isAdmin: pending !== null };
  } catch {
    return { clubs: [], isAdmin: false };
  }
}

function renderManageHint(): HTMLElement {
  const hint = element("p", "mt-2 text-sm text-muted", "Officer of a club? ");
  const link = element("a", "underline decoration-line underline-offset-3 hover:decoration-current", "Ask to manage it");
  link.href = "./manage.html";
  hint.append(link, " and your club's events will go on the site without waiting for review.");
  return hint;
}

const OTHER_CLUB = "";

/**
 * For club managers: a choice of which club they're posting for, above the form. Choosing one of their clubs fills
 * in the Club field and locks it, and the event will skip review. "Another club" unlocks it and sends the event to
 * review as usual. The club in the page address (`?club=`, from the Manage page) is chosen first if it's theirs.
 */
function renderPostingFor(clubs: string[], clubInput: HTMLInputElement): { fieldset: HTMLFieldSetElement; chosenClub: () => string } {
  const fieldset = element("fieldset", "mt-5", "");
  fieldset.append(element("legend", "font-semibold", "Posting for"));
  const requested = new URLSearchParams(window.location.search).get("club");
  const preferred = clubs.find((club) => club === requested) ?? clubs[0];
  const options = [
    ...clubs.map((club) => ({ value: club, label: club, note: "Goes on the site right away" })),
    { value: OTHER_CLUB, label: "Another club or group", note: "An admin checks it first" },
  ];
  for (const [index, option] of options.entries()) {
    const radio = element("input", "mt-1 size-5 shrink-0 accent-food", "");
    radio.type = "radio";
    radio.name = "postingFor";
    radio.id = `posting-for-${index}`;
    radio.value = option.value;
    radio.defaultChecked = option.value === preferred;
    const label = element("label", "flex cursor-pointer gap-3 py-2", "");
    label.htmlFor = radio.id;
    const text = element("span", "", "");
    text.append(element("span", "block font-semibold", option.label), element("span", "block text-sm text-muted", option.note));
    label.append(radio, text);
    fieldset.append(label);
  }
  const chosenClub = () => fieldset.querySelector<HTMLInputElement>("input:checked")?.value ?? OTHER_CLUB;
  const sync = () => {
    const club = chosenClub();
    clubInput.readOnly = club !== OTHER_CLUB;
    clubInput.classList.toggle("text-muted", clubInput.readOnly);
    if (club !== OTHER_CLUB) {
      clubInput.value = club;
    } else if (clubs.includes(clubInput.value)) {
      clubInput.value = "";
    }
  };
  fieldset.addEventListener("change", sync);
  // The form's own reset (Clear form, or after posting) puts the choice back first; this then refills the Club field.
  clubInput.form?.addEventListener("reset", () => setTimeout(sync));
  sync();
  return { fieldset, chosenClub };
}

/** Choosing a flyer fills in the form below it, for the student to check. It never submits anything by itself. */
function renderFlyerUpload(form: HTMLFormElement): HTMLElement {
  const section = element("section", "mt-6 border-y border-line py-4", "");
  const fileInput = input("file", { accept: "image/*" });
  fileInput.className = "sr-only";
  const button = element("label", "inline-block cursor-pointer rounded-sm border border-selected px-4 py-2.5 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-food", "Upload a flyer");
  button.append(fileInput);
  const status = element("p", "mt-2", "");
  status.setAttribute("role", "status");
  section.append(
    element("h2", "font-display font-bold", "Have a flyer?"),
    element("p", "mt-1 text-sm text-muted", "Upload a photo or screenshot and we'll fill in the form for you to check. Flyers are read by Google's Gemini AI, and Google's reviewers may see them, so don't upload anything with personal information like a phone number. We don't keep them."),
    element("div", "mt-3", ""),
    status,
  );
  section.children[2].append(button);
  // Clearing the form also clears "Filled in from the flyer", which would no longer be true.
  form.addEventListener("reset", () => {
    status.textContent = "";
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    fileInput.disabled = true;
    button.firstChild!.textContent = "Reading flyer…";
    status.className = "mt-2";
    status.textContent = "";
    try {
      // Loaded only when needed, so the form itself stays quick to open.
      const { readFlyer } = await import("./flyer.ts");
      const details = await readFlyer(file);
      if (!looksLikeAnEvent(details)) {
        status.className = "mt-2 text-error";
        status.textContent = "We couldn't find event details in that image. Try a clearer one, or fill in the form yourself.";
        return;
      }
      fillForm(form, details);
      status.className = "mt-2 font-semibold";
      status.textContent = "Filled in from the flyer. Check everything below, and fix anything marked in red.";
    } catch (error) {
      status.className = "mt-2 text-error";
      status.textContent = flyerErrorMessage(error);
    } finally {
      fileInput.disabled = false;
      // Clearing it lets the student choose the same file again.
      fileInput.value = "";
      button.firstChild!.textContent = "Upload a flyer";
    }
  });
  return section;
}

function flyerErrorMessage(error: unknown): string {
  const problem = (error as { problem?: FlyerProblem }).problem;
  const fillInYourself = "You can still fill in the form yourself.";
  switch (problem) {
    case "unreadable_file":
      return `We couldn't open that file. Try a JPG or PNG, or take a screenshot of the flyer. ${fillInYourself}`;
    case "daily_limit":
      return `You've reached today's limit of 10 flyers. ${fillInYourself}`;
    case "busy":
      return `Flyer reading is busy right now, so try again later. ${fillInYourself}`;
    default:
      return `We couldn't read that flyer. ${fillInYourself}`;
  }
}

/** Puts the flyer's details in the form and marks what still needs attention, such as a date that has passed. */
function fillForm(form: HTMLFormElement, details: FlyerDetails): void {
  for (const [name, value] of Object.entries(details)) {
    const control = form.elements.namedItem(name) as HTMLInputElement;
    // The date starts as today, which would be misleading if the flyer didn't give one. A locked Club field (a manager
    // posting for their club) keeps its club.
    if ((value !== "" || name === "date") && !control.readOnly) {
      control.value = value;
    }
  }
  const values = Object.fromEntries(new FormData(form)) as unknown as SubmissionForm;
  const result = checkSubmission(values, new Date());
  if (result.ok) {
    showProblems(form, {});
    return;
  }
  showProblems(form, details.food === "" ? { ...result.problems, food: "The flyer doesn't mention food. Add what's offered if you know there's food." } : result.problems);
}

function labelled(id: keyof SubmissionForm, label: string, control: HTMLInputElement | HTMLSelectElement, hint?: string): HTMLElement {
  const wrapper = element("div", "mt-5", "");
  const labelElement = element("label", "font-semibold", label);
  labelElement.htmlFor = id;
  control.id = id;
  control.name = id;
  control.className = FIELD;
  wrapper.append(labelElement);
  const described: string[] = [];
  if (hint) {
    const hintElement = element("p", "text-sm text-muted", hint);
    hintElement.id = `${id}-hint`;
    described.push(hintElement.id);
    wrapper.append(hintElement);
  }
  const error = element("p", "mt-1 text-sm text-error", "");
  error.id = `${id}-error`;
  described.push(error.id);
  control.setAttribute("aria-describedby", described.join(" "));
  wrapper.append(control, error);
  return wrapper;
}

function input(type: string, attributes: Record<string, string> = {}): HTMLInputElement {
  const field = document.createElement("input");
  field.type = type;
  for (const [name, value] of Object.entries(attributes)) {
    field.setAttribute(name, value);
  }
  return field;
}

function eventTypeSelect(): HTMLSelectElement {
  const select = document.createElement("select");
  for (const [value, label] of [["", "Other or not sure"], ...EVENT_TYPES.map((type) => [type, type])]) {
    const option = element("option", "", label);
    option.value = value;
    select.append(option);
  }
  return select;
}

function renderForm(user: User, mine: HTMLElement, posting: PostingRights): HTMLFormElement {
  const form = element("form", "mt-2", "");
  form.noValidate = true;
  const clubInput = input("text", { maxlength: "120" });

  const times = element("div", "grid grid-cols-2 gap-x-4", "");
  times.append(
    labelled("startTime", "Starts", input("time")),
    labelled("endTime", "Ends", input("time")),
  );
  const submitButton = element("button", PRIMARY_BUTTON, "Submit event");
  submitButton.type = "submit";
  // Resetting puts every field back to how the page opened, so the date returns to today.
  const clearButton = element("button", SECONDARY_BUTTON, "Clear form");
  clearButton.type = "reset";
  const buttons = element("div", "mt-6 flex flex-wrap gap-3", "");
  buttons.append(submitButton, clearButton);
  const status = element("p", "mt-3", "");
  status.setAttribute("role", "status");

  form.append(
    labelled("title", "Event name", input("text", { maxlength: "150" })),
    labelled("club", "Club or group", clubInput),
    labelled("date", "Date", input("date", { value: campusDate(new Date()) })),
    times,
    element("p", "mt-1 text-sm text-muted", "Champaign time. An end time earlier than the start means it ends the next day."),
    labelled("location", "Location", input("text", { maxlength: "150" }), "A building and room works best, such as Illini Union 314A."),
    labelled("food", "Food", input("text", { maxlength: "100" }), "Separate items with commas, such as pizza, cookies."),
    labelled("eventType", "Event type (optional)", eventTypeSelect()),
    labelled("url", "Link (optional)", input("url", { inputmode: "url", placeholder: "https://" }), "A flyer, Instagram post, or event page helps the admin confirm it."),
    buttons,
    status,
  );

  // Whether the event skips review: a manager posting for their own club, or an admin who leaves the box ticked.
  let skipsReview = () => false;
  if (posting.clubs.length > 0 && !posting.isAdmin) {
    const { fieldset, chosenClub } = renderPostingFor(posting.clubs, clubInput);
    form.prepend(fieldset);
    skipsReview = () => chosenClub() !== OTHER_CLUB;
  }
  if (posting.isAdmin) {
    const { box, checkbox } = renderAdminPostNow();
    buttons.before(box);
    skipsReview = () => checkbox.checked;
  }
  const updateButton = () => {
    submitButton.textContent = skipsReview() ? "Post event" : "Submit event";
  };
  form.addEventListener("change", updateButton);
  form.addEventListener("reset", () => setTimeout(updateButton));
  updateButton();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSubmit(form, submitButton, status, user, mine, skipsReview());
  });
  form.addEventListener("reset", () => {
    showProblems(form, {});
  });
  // Only the Clear button empties this message; a successful submit also resets the form but keeps its "Thanks!".
  clearButton.addEventListener("click", () => {
    status.textContent = "";
  });
  return form;
}

/** For admins: a ticked box (the default) posts straight to the site; unticked sends it to review like anyone's. */
function renderAdminPostNow(): { box: HTMLElement; checkbox: HTMLInputElement } {
  const checkbox = input("checkbox", { id: "post-now" });
  checkbox.className = "mt-1 size-5 shrink-0 accent-food";
  checkbox.defaultChecked = true;
  const box = element("label", "mt-6 flex cursor-pointer gap-3", "");
  box.htmlFor = checkbox.id;
  const text = element("span", "", "");
  text.append(element("span", "block font-semibold", "Post right away, without review"), element("span", "block text-sm text-muted", "Because you're an admin. Untick to send it to the review queue."));
  box.append(checkbox, text);
  return { box, checkbox };
}

async function handleSubmit(form: HTMLFormElement, button: HTMLButtonElement, status: HTMLElement, user: User, mine: HTMLElement, postNow: boolean): Promise<void> {
  const values = Object.fromEntries(new FormData(form)) as unknown as SubmissionForm;
  const result = checkSubmission(values, new Date());
  showProblems(form, result.ok ? {} : result.problems);
  if (!result.ok) {
    status.className = "mt-3 text-error";
    status.textContent = "Check the highlighted fields.";
    return;
  }

  const buttonText = button.textContent;
  button.disabled = true;
  button.textContent = postNow ? "Posting…" : "Submitting…";
  status.textContent = "";
  try {
    if (postNow) {
      await postClubEvent(result.submission);
    } else {
      await submitEvent(result.submission);
    }
    form.reset();
    status.className = "mt-3 font-semibold";
    status.textContent = postNow ? `Posted! "${result.submission.title}" is on the site now.` : `Thanks! "${result.submission.title}" is waiting for review.`;
    await showMySubmissions(user, mine);
  } catch (error) {
    status.className = "mt-3 text-error";
    status.textContent =
      error instanceof TooManyPendingError
        ? "You have 10 events waiting for review, which is the limit. Try again once some are reviewed."
        : postNow
          ? "Couldn't post that event. Your details are still here, so check your connection and try again. If it keeps happening, an admin may have removed you as a manager; refresh the page to check."
          : "Couldn't submit that event. Your details are still here, so check your connection and try again.";
  } finally {
    button.disabled = false;
    button.textContent = buttonText;
  }
}

function showProblems(form: HTMLFormElement, problems: FormProblems): void {
  let firstProblem: HTMLElement | null = null;
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    const errorLine = form.querySelector(`#${control.id}-error`);
    // The Posting for and admin choices have nothing to check.
    if (errorLine === null) {
      continue;
    }
    const problem = problems[control.name as keyof SubmissionForm];
    if (problem) {
      control.setAttribute("aria-invalid", "true");
      firstProblem ??= control;
    } else {
      control.removeAttribute("aria-invalid");
    }
    errorLine.textContent = problem ?? "";
  }
  firstProblem?.focus();
}

async function showMySubmissions(user: User, mine: HTMLElement): Promise<void> {
  let submissions: SubmittedEvent[];
  try {
    submissions = await loadMySubmissions(user.id);
  } catch {
    mine.replaceChildren(element("p", "mt-10 text-error", "Couldn't load your submissions. Refresh the page to try again."));
    return;
  }
  if (submissions.length === 0) {
    mine.replaceChildren();
    return;
  }
  const list = element("ul", "mt-3 divide-y divide-line border-y border-line", "");
  for (const submission of submissions) {
    const item = element("li", "py-3", "");
    item.append(
      element("p", "font-semibold", submission.title),
      element("p", "text-sm text-muted", describeWhen(submission.starts_at, submission.ends_at)),
      element("p", `mt-1 text-sm font-semibold ${submission.status === "rejected" ? "text-error" : "text-food"}`, statusText(submission)),
    );
    if (submission.club_post && submission.status === "approved") {
      item.append(renderTakeDownButton(submission, user, mine));
    }
    list.append(item);
  }
  mine.replaceChildren(element("h2", "mt-10 border-t-2 border-ink pt-4 font-display text-xl leading-tight font-bold", "Your submissions"), list);
}

function statusText(submission: SubmittedEvent): string {
  if (!submission.club_post) {
    return STATUS_TEXT[submission.status];
  }
  return submission.status === "approved" ? `On the site, posted for ${submission.club}` : "Taken off the site";
}

/** Lets a manager take down an event they posted for their club, e.g. one that was cancelled. */
function renderTakeDownButton(submission: SubmittedEvent, user: User, mine: HTMLElement): HTMLElement {
  const wrapper = element("div", "mt-2", "");
  const button = element("button", "min-h-11 cursor-pointer rounded-sm border border-error px-3 text-sm font-semibold text-error disabled:opacity-60", "Take off the site");
  button.type = "button";
  button.setAttribute("aria-label", `Take "${submission.title}" off the site`);
  const problem = element("p", "mt-1 text-sm text-error", "");
  problem.setAttribute("role", "status");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Taking it off…";
    problem.textContent = "";
    try {
      await takeDownClubEvent(submission.id);
      await showMySubmissions(user, mine);
    } catch {
      button.disabled = false;
      button.textContent = "Take off the site";
      problem.textContent = "That didn't go through. Check your connection and try again. If you're no longer a manager of this club, ask an admin.";
    }
  });
  wrapper.append(button, problem);
  return wrapper;
}

setUpPage();
void showSubmitPage();

// The Submit page: a form for signed-in students, and the status of what they've already submitted.

import type { User } from "@supabase/supabase-js";
import { currentUser, supabase } from "./auth.ts";
import { element } from "./dom.ts";
import { campusDate } from "./events.ts";
import { renderMessage } from "./eventList.ts";
import { setUpPage } from "./layout.ts";
import { checkSubmission, type FormProblems, type SubmissionForm } from "./submissionRules.ts";
import { loadMySubmissions, submitEvent, TooManyPendingError, type SubmissionStatus, type SubmittedEvent } from "./submissions.ts";
import { describeWhen } from "./submissionView.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const FIELD = "mt-1 block w-full rounded-sm border border-line bg-page px-3 py-2.5 text-ink aria-invalid:border-error";
const PRIMARY_BUTTON = "mt-6 cursor-pointer rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected disabled:opacity-60";

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
  const mine = element("section", "", "");
  content.replaceChildren(
    element("h1", "mt-8 font-display text-xl leading-tight font-bold", "Submit an event"),
    element("p", "mt-3", "Know about free food that isn't listed? Add it here. An admin checks each event before it goes on the site, and it appears at the site's next update after that."),
    renderForm(user, mine),
    mine,
  );
  await showMySubmissions(user, mine);
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

function renderForm(user: User, mine: HTMLElement): HTMLFormElement {
  const form = element("form", "mt-2", "");
  form.noValidate = true;

  const times = element("div", "grid grid-cols-2 gap-x-4", "");
  times.append(
    labelled("startTime", "Starts", input("time")),
    labelled("endTime", "Ends", input("time")),
  );
  const submitButton = element("button", PRIMARY_BUTTON, "Submit event");
  submitButton.type = "submit";
  const status = element("p", "mt-3", "");
  status.setAttribute("role", "status");

  form.append(
    labelled("title", "Event name", input("text", { maxlength: "150" })),
    labelled("club", "Club or group", input("text", { maxlength: "120" })),
    labelled("date", "Date", input("date", { value: campusDate(new Date()) })),
    times,
    element("p", "mt-1 text-sm text-muted", "Champaign time. An end time earlier than the start means it ends the next day."),
    labelled("location", "Location", input("text", { maxlength: "150" }), "A building and room works best, such as Illini Union 314A."),
    labelled("food", "Food", input("text", { maxlength: "100" }), "Separate items with commas, such as pizza, cookies."),
    labelled("eventType", "Event type (optional)", eventTypeSelect()),
    labelled("url", "Link (optional)", input("url", { inputmode: "url", placeholder: "https://" }), "A flyer, Instagram post, or event page helps the admin confirm it."),
    submitButton,
    status,
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSubmit(form, submitButton, status, user, mine);
  });
  return form;
}

async function handleSubmit(form: HTMLFormElement, button: HTMLButtonElement, status: HTMLElement, user: User, mine: HTMLElement): Promise<void> {
  const values = Object.fromEntries(new FormData(form)) as unknown as SubmissionForm;
  const result = checkSubmission(values, new Date());
  showProblems(form, result.ok ? {} : result.problems);
  if (!result.ok) {
    status.className = "mt-3 text-error";
    status.textContent = "Check the highlighted fields.";
    return;
  }

  button.disabled = true;
  button.textContent = "Submitting…";
  status.textContent = "";
  try {
    await submitEvent(result.submission);
    form.reset();
    status.className = "mt-3 font-semibold";
    status.textContent = `Thanks! "${result.submission.title}" is waiting for review.`;
    await showMySubmissions(user, mine);
  } catch (error) {
    status.className = "mt-3 text-error";
    status.textContent =
      error instanceof TooManyPendingError
        ? "You have 10 events waiting for review, which is the limit. Try again once some are reviewed."
        : "Couldn't submit that event. Your details are still here, so check your connection and try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Submit event";
  }
}

function showProblems(form: HTMLFormElement, problems: FormProblems): void {
  let firstProblem: HTMLElement | null = null;
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    const problem = problems[control.name as keyof SubmissionForm];
    if (problem) {
      control.setAttribute("aria-invalid", "true");
      firstProblem ??= control;
    } else {
      control.removeAttribute("aria-invalid");
    }
    form.querySelector(`#${control.id}-error`)!.textContent = problem ?? "";
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
      element("p", `mt-1 text-sm font-semibold ${submission.status === "rejected" ? "text-error" : "text-food"}`, STATUS_TEXT[submission.status]),
    );
    list.append(item);
  }
  mine.replaceChildren(element("h2", "mt-10 font-display text-lg font-bold", "Your submissions"), list);
}

setUpPage();
void showSubmitPage();

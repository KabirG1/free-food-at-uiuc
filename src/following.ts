// The Following page: the clubs a signed-in student follows. Each name opens Today showing only that club's
// events, and each has an Unfollow button.

import { supabase } from "./auth.ts";
import { element } from "./dom.ts";
import { renderMessage } from "./eventList.ts";
import { syncAfterFollowing } from "./followButton.ts";
import { followedClubNames, loadFollowedClubs, onFollowedClubsChange, setFollowing } from "./followedClubs.ts";
import { calendarAccessForTap, prepareIfConnected } from "./googleCalendar.ts";
import { setUpPage } from "./layout.ts";

const content = document.querySelector<HTMLElement>("#content")!;

const UNFOLLOW_BUTTON = "min-h-8 shrink-0 cursor-pointer rounded-sm border border-line px-2.5 text-sm font-semibold hover:border-selected disabled:opacity-60";
const HOW_TO_FOLLOW = "Tap Follow next to a club's name on any event. To see only their events, open Filters and choose \"Clubs I follow\".";

async function showFollowing(): Promise<void> {
  if (supabase === null) {
    content.replaceChildren(renderMessage("Accounts aren't set up", "This copy of the site has no sign-in settings.", "empty"));
    return;
  }
  let signedIn: boolean;
  try {
    signedIn = await loadFollowedClubs();
  } catch {
    content.replaceChildren(renderMessage("Couldn't load the clubs you follow", "Check your connection and refresh the page.", "error"));
    return;
  }
  if (!signedIn) {
    const link = element("a", "mt-6 inline-block rounded-sm bg-selected px-4 py-2.5 font-semibold text-on-selected", "Sign in");
    link.href = "./account.html";
    content.replaceChildren(renderMessage("Sign in to follow clubs", HOW_TO_FOLLOW, "empty"), link);
    return;
  }

  const status = element("p", "mt-3 text-error", "");
  status.setAttribute("role", "status");
  const list = element("div", "", "");
  content.replaceChildren(
    element("h1", "mt-8 font-display text-xl leading-tight font-bold", "Following"),
    element("p", "mt-2 text-muted", "Tap a club to see its events."),
    list,
    status,
  );
  const showList = () => list.replaceChildren(...renderClubs(status));
  onFollowedClubsChange(showList);
  showList();
  prepareIfConnected();
}

function renderClubs(status: HTMLElement): HTMLElement[] {
  const names = followedClubNames();
  if (names.length === 0) {
    return [element("p", "mt-3", "You don't follow any clubs yet."), element("p", "mt-2 text-muted", HOW_TO_FOLLOW)];
  }
  const items = element("ul", "mt-4 divide-y divide-line border-y border-line", "");
  for (const name of names) {
    const unfollowButton = element("button", UNFOLLOW_BUTTON, "Unfollow");
    unfollowButton.type = "button";
    unfollowButton.setAttribute("aria-label", `Unfollow ${name}`);
    unfollowButton.addEventListener("click", async () => {
      // First, while the tap still counts, so Google's window is allowed to open.
      const calendar = calendarAccessForTap(true);
      unfollowButton.disabled = true;
      status.textContent = "";
      try {
        // The list redraws without this club straight away, and puts it back if the database says no.
        await setFollowing(name, false);
      } catch {
        status.textContent = `Couldn't unfollow ${name}. Check your connection and try again.`;
        return;
      }
      await syncAfterFollowing(calendar, name, false);
    });
    const item = element("li", "flex items-center justify-between gap-4 py-3", "");
    // Opens Today with the Club filter set to this club.
    const clubLink = element("a", "min-w-0 font-semibold underline decoration-line underline-offset-3 hover:decoration-current", name);
    clubLink.href = `./?${new URLSearchParams({ club: name })}`;
    item.append(clubLink, unfollowButton);
    items.append(item);
  }
  return [items];
}

setUpPage();
void showFollowing();

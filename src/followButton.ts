// The "Follow" button after a club's name. Signed-in students tap it to follow the club; anyone else is
// asked to sign in. Every button for the same club changes together.

import { element } from "./dom.ts";
import { clubKey } from "./events.ts";
import { isFollowing, loadFollowedClubs, onFollowedClubsChange, setFollowing } from "./followedClubs.ts";
import { calendarAccessForTap, prepareIfConnected, syncCalendar, type CalendarAccess } from "./googleCalendar.ts";
import { showNotice } from "./notice.ts";

let listening = false;

export function renderFollowButton(club: string): HTMLButtonElement {
  const button = element(
    "button",
    // The button looks 32px tall, but the invisible ::after reaches 6px past it above and below, a 44px tap target.
    "relative min-h-8 cursor-pointer after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] rounded-sm border border-line px-2.5 text-sm font-semibold hover:border-selected aria-pressed:border-selected aria-pressed:bg-selected aria-pressed:text-on-selected",
    "",
  );
  button.type = "button";
  button.dataset.followClub = clubKey(club);
  // The label stays the same; aria-pressed tells screen readers whether the club is followed.
  button.setAttribute("aria-label", `Follow ${club}`);
  showState(button, isFollowing(club));
  button.addEventListener("click", () => void toggleFollowing(club));

  if (!listening) {
    listening = true;
    onFollowedClubsChange(updateButtons);
    // A failure here is reported when a button is tapped, not on page load.
    loadFollowedClubs()
      .then((signedIn) => (signedIn ? prepareIfConnected() : undefined))
      .catch(() => undefined);
  }
  return button;
}

async function toggleFollowing(club: string): Promise<void> {
  // First, while the tap still counts: browsers only let Google's window open during one.
  const calendar = calendarAccessForTap(true);
  let signedIn: boolean;
  try {
    signedIn = await loadFollowedClubs();
  } catch {
    showNotice("Couldn't reach your account. Check your connection and try again.");
    return;
  }
  if (!signedIn) {
    showNotice("Sign in with your Illinois account to follow clubs.", { label: "Sign in", href: "./account.html" });
    return;
  }

  const follow = !isFollowing(club);
  try {
    await setFollowing(club, follow);
    if (follow) {
      showNotice(`Following ${club.trim()}.`, { label: "See clubs you follow", href: "./following.html" });
    }
  } catch {
    showNotice(follow ? "Couldn't follow that club. Try again." : "Couldn't unfollow that club. Try again.");
    return;
  }
  await syncAfterFollowing(calendar, club, follow);
}

/**
 * With "Also add events from clubs I follow" on, adds the club's events to Google Calendar, or removes the ones
 * that aren't saved. Shared with the Following page's Unfollow buttons.
 */
export async function syncAfterFollowing(calendar: Promise<CalendarAccess | null>, club: string, follow: boolean): Promise<void> {
  try {
    const plan = await syncCalendar(calendar);
    if (plan !== null && follow) {
      const added = plan.add.length;
      showNotice(
        added === 0
          ? `Following ${club.trim()}. It has no upcoming events to add to Google Calendar yet.`
          : `Following ${club.trim()}. Added ${added} ${added === 1 ? "event" : "events"} to Google Calendar.`,
        { label: "See clubs you follow", href: "./following.html" },
      );
    }
  } catch {
    showNotice(follow ? "Following, but couldn't add the club's events to Google Calendar." : "Unfollowed, but couldn't update Google Calendar.", {
      label: "Try again on Account page",
      href: "./account.html",
    });
  }
}

function showState(button: HTMLButtonElement, following: boolean): void {
  button.setAttribute("aria-pressed", String(following));
  button.textContent = following ? "Following" : "Follow";
}

function updateButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-follow-club]")) {
    showState(button, isFollowing(button.dataset.followClub ?? ""));
  }
}

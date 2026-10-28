# Free Food UIUC: Plan

## The app

A web app for UIUC students that shows which clubs are giving out free food at their events today. Kabir wants one place to check for free food instead of hunting through club Instagrams and websites.

## Done

(nothing yet)

## Next

1. Set up the web project (stack to be picked at the start of the first coding session).
2. Fetch the OneIllinois event feed and pick out today's free-food events.
3. Show them on a phone-friendly page, with loading, empty ("No free food today"), and error states.
4. Run the fetch on a schedule (GitHub Actions) and host the site from a link.
5. Choose and add a second source (Instagram, student submissions, or calendars.illinois.edu).

## Decisions

- **2026-10-28: Web app.** Anyone can open it from a link on their phone without installing anything; iOS was not an option on Windows anyway. Alternatives: Android, iOS, desktop.
- **2026-10-28: Scheduled fetch, not live scraping.** A scheduled job saves today's events and the site reads the saved copy, so there is no server to run or pay for and sources are not hit on every page load. Alternatives: fetch on each visit, or run locally.
- **2026-10-28: OneIllinois first, Instagram later.** OneIllinois (UIUC's club platform, run on CampusGroups) publishes a public event feed at `https://one.illinois.edu/rss_events` that its robots.txt does not block. Instagram restricts automated access, so it needs its own decision. Alternative considered: Campus Labs Engage, which UIUC turned out not to use.
- **2026-10-28: Free food = `foodProvided` flag or food words in the description.** The feed has a `foodProvided` field, but on this date only 24 of 3,174 upcoming events set it, and food words appear only about 40 times in the whole feed. Using both catches more; a second source will still be needed for the app to be useful most days.
- **2026-10-28: Private GitHub repository** (`free-food-uiuc`), can be made public later.

## Problems

(none yet)

# Free Food UIUC: Plan

## The app

A web app for UIUC students that shows which clubs are giving out free food at their events today. Kabir wants one place to check for free food instead of hunting through club Instagrams and websites.

## Done

- **2026-10-29: First milestone.** `npm run fetch-events` pulls today's free-food events from OneIllinois and the page lists them (club, name, time, location, food), with empty and error messages. Kabir checked it in the browser with one real event (GSRC's Queer-O-Ween). 11 tests run against a saved sample feed, and there's a README.

## Next

1. **Hide events that have already ended today (built 2026-10-29, Kabir still to check after an event ends).** The page hides events whose end time has passed, by the viewer's clock, and says "Today's free food is over" when all of today's have ended.
2. Run the fetch on a schedule (GitHub Actions) and host the site from a link.
3. Choose and add a second source (Instagram, student submissions, or calendars.illinois.edu).

**Future ideas (Kabir, 2026-10-29),** since Instagram can't be scraped automatically:
- **Upload a flyer to add an event.** A student uploads a photo or screenshot of a flyer or post, it gets scanned for the club, time, place, and food, and the event is added to the list. Needs somewhere to store submissions and a small server-side step to do the scanning.
- **GroupMe.** Read messages from club GroupMe chats to find food announcements. GroupMe has an official API, but it only sees chats the connected account is a member of, so it needs a decision on whose account and members' consent.

## Decisions

- **2026-10-28: Web app.** Anyone can open it from a link on their phone without installing anything; iOS was not an option on Windows anyway. Alternatives: Android, iOS, desktop.
- **2026-10-28: Scheduled fetch, not live scraping.** A scheduled job saves today's events and the site reads the saved copy, so there is no server to run or pay for and sources are not hit on every page load. Alternatives: fetch on each visit, or run locally.
- **2026-10-28: OneIllinois first, Instagram later.** OneIllinois (UIUC's club platform, run on CampusGroups) publishes a public event feed at `https://one.illinois.edu/rss_events` that its robots.txt does not block. Instagram restricts automated access, so it needs its own decision. Alternative considered: Campus Labs Engage, which UIUC turned out not to use.
- **2026-10-28: Free food = `foodProvided` flag or food words in the description.** The feed has a `foodProvided` field, but on this date only 24 of 3,174 upcoming events set it, and food words appear only about 40 times in the whole feed. Using both catches more; a second source will still be needed for the app to be useful most days.
- **2026-10-28: Vite + TypeScript, with the fetch script in TypeScript run by Node.** One language for the page and the scraper, no server. Each source is its own module that returns the shared `FoodEvent` shape (`src/events.ts`), so Instagram or student submissions can be added later without changing the page. Submissions would need somewhere to store them (a Google Form or small free database) as an add-on.
- **2026-10-28: Private GitHub repository** (`free-food-uiuc`), can be made public later.

## Problems

(none yet)

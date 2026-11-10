# Free Food @ UIUC

A mobile-friendly web page that lists UIUC club events giving out free food, today and through the end of next month. Events come from [OneIllinois](https://one.illinois.edu/events)' public feed and from student submissions that an admin has approved.

**Open the site: https://kabirg1.github.io/free-food-at-uiuc/**

The Today page groups events under "Happening now" and "Later today", lists the next few days under "Coming up", and keeps ended events in a collapsed "Earlier today" list; and the Calendar page is a month view of this month and next, with arrows to switch months. Both have a Filters dropdown for meals or snacks, time of day, and event type. Each shows its start and end time, the club, a location that opens in Google Maps, and the food mentioned. Events disappear from the list once they end.

## Setup

Requires [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
```

Sign-in is optional for running the site. To turn it on locally, copy `.env.example` to `.env.local` and fill in the Supabase project URL, publishable key, and Google client ID (see **Accounts** below). Without them the site works and simply hides "Sign in".

## Commands

| Command | What it does |
| --- | --- |
| `npm run fetch-events` | Downloads events from every source and writes free-food events from today through the end of next month to `public/events.json`. Run this before `dev` or `build`. |
| `npm run dev` | Starts a local server with the page at the address it prints (usually http://localhost:5173). |
| `npm test` | Runs the tests (they use saved sample data in `tests/fixtures`, not the live sites). |
| `npm run build` | Type-checks and builds the site into `dist/`. |
| `npm run preview` | Serves the built `dist/` folder locally. |

## How it works

- `scripts/sources/` has one module per data source. Each returns events in the shared `FoodEvent` shape from `src/events.ts`.
- `scripts/fetch-events.ts` runs every source, keeps events starting between today and the end of next month (Champaign time), and saves them. OneIllinois drops events once they end, so `scripts/previousEvents.ts` carries over today's ended events from the previous copy: the live site's `events.json` when `PREVIOUS_EVENTS_URL` is set (as in GitHub Actions), otherwise the local file. If a source fails, the others still show and the page says which one was unreachable.
- `src/main.ts` (Today) and `src/calendar.ts` (Calendar) load `events.json` and show a day's events using `src/eventList.ts`. `src/filters.ts` decides which events match the filters, and `src/filterPanel.ts` draws the Filters dropdown. `src/location.ts` turns locations into map links.
- `faq.html` and `contact.html` are static pages. `src/layout.ts` fills in the header menu, the shared footer, and the contact email links on every page.
- `src/style.css` holds the design system: Tailwind CSS with its default colors, sizes, and fonts removed, so only the Illinois colors, fonts, and spacing defined there can be used.

## Deploying

Deploys are automatic. The GitHub Actions workflow in `.github/workflows/deploy.yml` runs the tests, fetches events, builds the site, and publishes it to GitHub Pages:

- four times a day (7am, 11am, 3pm, and 7pm Champaign time in daylight time; an hour earlier in winter),
- on every push to `main`,
- and on demand from the repository's **Actions** tab (**Fetch events and deploy → Run workflow**).

GitHub Pages must be set to deploy from **GitHub Actions** (repository **Settings → Pages → Source**).

## Accounts

Sign-in uses [Supabase](https://supabase.com) with Google, limited to @illinois.edu accounts.

- `supabase/001_accounts.sql` holds the database setup: the check that refuses non-Illinois emails (a "Before User Created" auth hook), account deletion, and a small `keep_awake` query. Run it in the Supabase SQL Editor, then choose `only_illinois_emails` under **Authentication → Auth Hooks → Before User Created**.
- The page signs in with Google's own button (Google Identity Services) and passes Google's ID token to Supabase (`signInWithIdToken`), so Google's sign-in screen names this site rather than supabase.co. The Google OAuth client must list the site's addresses (`https://kabirg1.github.io` and `http://localhost:5173`) under **Authorized JavaScript origins**.
- `supabase/002_saved_events.sql` adds the `saved_events` table (each student can read and change only their own rows) and a daily `pg_cron` job that deletes saved events a week after they end. Run it in the SQL Editor too.
- `src/auth.ts` talks to Google and Supabase; `account.html` and `src/account.ts` are the Account page; `privacy.html` explains what is stored.
- `src/saveButton.ts` draws the star on each event, `src/savedEvents.ts` reads and writes saved events, and `saved.html` with `src/saved.ts` is the Saved events page.
- `supabase/005_followed_clubs.sql` adds the `followed_clubs` table (each student can read and change only their own rows). Run it in the SQL Editor too. `src/followButton.ts` draws the Follow button by each club name, `src/followedClubs.ts` reads and writes followed clubs, and `following.html` with `src/following.ts` is the Following page.
- Google Calendar sync (optional, off by default, a switch on the Account page): `src/googleCalendar.ts` gets short-lived access from Google in the browser (no Google tokens are stored), and `src/googleCalendarApi.ts` creates a "Free Food @ UIUC" calendar and adds or removes saved events in it. To set it up, run `supabase/006_google_calendars.sql` in the SQL Editor; in Google Cloud Console (the project that holds the sign-in client), enable **Google Calendar API** and add the scope `https://www.googleapis.com/auth/calendar.app.created` under **Google Auth Platform → Data Access**. That scope is non-sensitive, so Google's verification review isn't needed.
- `supabase/003_submissions.sql` adds submitted events and the `admins` list. Run it in the SQL Editor, then add each admin with `insert into public.admins (email) values ('netid@illinois.edu');`. Admins sign in like everyone else; being on that list lets them approve events. Keep their emails out of this public repository.
- `submit.html` with `src/submit.ts` is the form, and `review.html` with `src/review.ts` is the admins' page, linked from their account menu. `scripts/sources/submissions.ts` reads approved events during the scheduled fetch, so they appear at the next update. It's skipped when the Supabase settings aren't set.
- Flyer upload: `src/flyer.ts` shrinks the image and sends it to the `read-flyer` server function (`supabase/functions/read-flyer/index.ts`), which asks Gemini for the event's details and returns them to fill in the form. `src/flyerRules.ts` checks the reply. Flyers aren't stored. To set it up, run `supabase/004_flyer_reads.sql` (a limit of 10 flyers per student per day), add `GEMINI_API_KEY` under **Edge Functions → Secrets**, and deploy the function: **Edge Functions → Deploy a new function → Via Editor**, name it `read-flyer`, and paste in the file. Dashboard deploys aren't connected to this repository, so paste the file again after changing it.
- The deploy workflow reads the project URL, publishable key, and Google client ID from repository variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `GOOGLE_CLIENT_ID` (**Settings → Secrets and variables → Actions → Variables**). All three are public by design. The Google client secret lives only in Supabase.

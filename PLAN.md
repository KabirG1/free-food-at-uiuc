# Free Food UIUC: Plan

## The app

A web app for UIUC students that shows which clubs are giving out free food at their events today. Kabir wants one place to check for free food instead of hunting through club Instagrams and websites.

## Done

- **2026-10-29: First milestone.** `npm run fetch-events` pulls today's free-food events from OneIllinois and the page lists them (club, name, time, location, food), with empty and error messages. Kabir checked it in the browser with one real event (GSRC's Queer-O-Ween). 11 tests run against a saved sample feed, and there's a README.
- **2026-10-29: Menu, FAQ, and Contact.** Header links (Today, FAQ, Contact) rather than a hidden hamburger menu, since three or four items fit on a phone. FAQ is a list of dropdowns (Kabir: "like most websites"). Every page has a footer with the contact email, the menu links, and a not-affiliated note. Kabir tried it. Calendar joins the menu when it is built.

## Next

1. **Hide events that have already ended today (built 2026-10-29, Kabir still to check after an event ends).** The page hides events whose end time has passed, by the viewer's clock, and says "Today's free food is over" when all of today's have ended.
2. **Run the fetch on a schedule and host the site (live 2026-10-29).** Live at https://kabirg1.github.io/free-food-at-uiuc/. Still to confirm: the next day's list appears on its own after the 7am run.
3. **Make the site look good (in progress, waiting on Kabir to review).** Rebuilt after researching what makes sites look "vibe coded" (see Decisions): Illinois colors and fonts, schedule-style list grouped into "Happening now" and "Later today", no emoji, no shadows or card boxes, neutral wording, locations open in Google Maps.
4. **Browse other days.** The Calendar menu item: pick a day and see its free-food events. Means saving the next ~2 weeks of events, not just today.
5. **Filters:** meal vs. snacks; time of day, including a custom start and end time where an event shows if it overlaps the range by even one minute; open to everyone (hide private locations); club type.
6. **Update the FAQ** with how the calendar and filters work.
7. Choose and add a second source (Instagram, student submissions, or calendars.illinois.edu).

**Future ideas (Kabir, 2026-10-29),** since Instagram can't be scraped automatically:
- **Upload a flyer to add an event.** A student uploads a photo or screenshot of a flyer or post, it gets scanned for the club, time, place, and food, and the event is added to the list. Needs somewhere to store submissions and a small server-side step to do the scanning.
- **GroupMe.** Read messages from club GroupMe chats to find food announcements. GroupMe has an official API, but it only sees chats the connected account is a member of, so it needs a decision on whose account and members' consent.

## Decisions

- **2026-10-28: Web app.** Anyone can open it from a link on their phone without installing anything; iOS was not an option on Windows anyway. Alternatives: Android, iOS, desktop.
- **2026-10-28: Scheduled fetch, not live scraping.** A scheduled job saves today's events and the site reads the saved copy, so there is no server to run or pay for and sources are not hit on every page load. Alternatives: fetch on each visit, or run locally.
- **2026-10-28: OneIllinois first, Instagram later.** OneIllinois (UIUC's club platform, run on CampusGroups) publishes a public event feed at `https://one.illinois.edu/rss_events` that its robots.txt does not block. Instagram restricts automated access, so it needs its own decision. Alternative considered: Campus Labs Engage, which UIUC turned out not to use.
- **2026-10-28: Free food = `foodProvided` flag or food words in the description.** The feed has a `foodProvided` field, but on this date only 24 of 3,174 upcoming events set it, and food words appear only about 40 times in the whole feed. Using both catches more; a second source will still be needed for the app to be useful most days.
- **2026-10-28: Vite + TypeScript, with the fetch script in TypeScript run by Node.** One language for the page and the scraper, no server. Each source is its own module that returns the shared `FoodEvent` shape (`src/events.ts`), so Instagram or student submissions can be added later without changing the page. Submissions would need somewhere to store them (a Google Form or small free database) as an add-on.
- **2026-10-28: Private GitHub repository** (`free-food-uiuc`), can be made public later. On 2026-10-29 Kabir renamed it to `free-food-at-uiuc` and made it public.
- **2026-10-29: Host on GitHub Pages, making the repo public.** GitHub Pages needs a public repo on the free plan, and Kabir was fine making it public; there are no secrets in it. A GitHub Actions job (`.github/workflows/deploy.yml`) fetches and redeploys four times a day and on every push. Alternative: keep it private and host on Cloudflare Pages or Netlify, which needs a second account and a deploy key.
- **2026-10-29: Design system in Tailwind CSS, with its defaults removed.** Kabir wanted the site to stop looking "vibe coded" and asked for research first (sources included zoer.ai's guide, the Fountain Institute, and impeccable.style), plus reference sites Kabir likes (Think Company, Lounge Lizard, Webflow, Eladio Dieste, Huddle). The common tells are default fonts and palettes, emoji as icons, colored side stripes, cards and shadows on everything, and generic copy. The reference sites share mostly neutral colors with one accent, few shadows, and small corners. Kabir suggested Tailwind instead of a separate DESIGN.md; its built-in theme is wiped (`--*: initial`) so only our values exist and off-system classes don't work. Colors and fonts follow the Illinois brand guide (Illini Blue #13294B, Illini Orange #FF5F05 only on the blue header since it fails contrast on white, darker #C2410C for small orange text; Montserrat headings, Source Sans body). Fonts are self-hosted rather than loaded from Google. Kabir chose no emoji at all and a neutral tone. Alternatives: plain CSS variables with a DESIGN.md, or Tailwind with its defaults (rejected, since its default theme is the generic look).
- **2026-10-29: Commits use GitHub's private noreply email** for this repo, since the repo is public. Earlier commits still show Kabir's Gmail; removing it would mean rewriting history.

- **2026-10-29: Contact us is an email link to kabirgan21@gmail.com.** Kabir chose a plain email link. The address is public on the site, so the page builds it in JavaScript rather than writing it into the HTML, which keeps most spam bots that scan pages from collecting it. Alternatives: a Google Form (keeps the email private) or GitHub issues (needs a GitHub account).

## Problems

(none yet)

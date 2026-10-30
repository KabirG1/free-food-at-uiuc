# Free Food UIUC

A mobile-friendly web page that lists UIUC club events giving out free food today. Events currently come from [OneIllinois](https://one.illinois.edu/events)' public feed.

**Open the site: https://kabirg1.github.io/free-food-at-uiuc/**

Events are grouped under "Happening now" and "Later today". Each shows its start and end time, the club, a location that opens in Google Maps, and the food mentioned. Events disappear from the list once they end.

## Setup

Requires [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run fetch-events` | Downloads events from every source and writes today's free-food events to `public/events.json`. Run this before `dev` or `build`. |
| `npm run dev` | Starts a local server with the page at the address it prints (usually http://localhost:5173). |
| `npm test` | Runs the tests (they use saved sample data in `tests/fixtures`, not the live sites). |
| `npm run build` | Type-checks and builds the site into `dist/`. |
| `npm run preview` | Serves the built `dist/` folder locally. |

## How it works

- `scripts/sources/` has one module per data source. Each returns events in the shared `FoodEvent` shape from `src/events.ts`.
- `scripts/fetch-events.ts` runs every source, keeps events starting today in Champaign's time zone, and saves them. If a source fails, the others still show and the page says which one was unreachable.
- `src/main.ts` loads `events.json` and shows the list, or a "No free food today" message. `src/location.ts` turns locations into map links.
- `faq.html` and `contact.html` are static pages. `src/layout.ts` fills in the header menu, the shared footer, and the contact email links on every page.
- `src/style.css` holds the design system: Tailwind CSS with its default colors, sizes, and fonts removed, so only the Illinois colors, fonts, and spacing defined there can be used.

## Deploying

Deploys are automatic. The GitHub Actions workflow in `.github/workflows/deploy.yml` runs the tests, fetches events, builds the site, and publishes it to GitHub Pages:

- four times a day (7am, 11am, 3pm, and 7pm Champaign time in daylight time; an hour earlier in winter),
- on every push to `main`,
- and on demand from the repository's **Actions** tab (**Fetch events and deploy → Run workflow**).

GitHub Pages must be set to deploy from **GitHub Actions** (repository **Settings → Pages → Source**).

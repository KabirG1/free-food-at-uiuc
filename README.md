# Free Food UIUC

A mobile-friendly web page that lists UIUC club events giving out free food today. Events currently come from [OneIllinois](https://one.illinois.edu/events)' public feed.

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
- `src/main.ts` loads `events.json` and shows the list, or a "No free food today" message.

## Deploying

Not set up yet. The plan is a scheduled GitHub Actions job that runs `fetch-events` a few times a day and publishes the built site.

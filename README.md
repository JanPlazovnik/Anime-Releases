# Anime Releases

A calendar of anime episode releases, synced from [AniList](https://anilist.co). Everything airing from 30 days ago to 90 days ahead is shown publicly. Signing in with AniList highlights the shows on your list, colored by status, and adds a "To watch" list of aired episodes you haven't seen yet. Your list is fetched by your browser; the server only knows the public schedule.

Not affiliated with AniList.

## Features

- Month and week views, with a popover for each episode (banner, cover, description, score, studio)
- Your Watching, Planning and Paused entries colored with AniList's status colors, everything else in gray
- "To watch" and "Up next" lists in the sidebar
- Light and dark theme
- Live updates: open pages refresh when the schedule sync finishes
- Open Graph preview image built from the currently airing shows

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, SQLite via better-sqlite3 and Drizzle, optional Sentry error tracking. Runs as a single Docker container.

## Setup

1. Create an API client at [anilist.co/settings/developer](https://anilist.co/settings/developer) with `<APP_URL>/` as the redirect URL. Sign-in uses AniList's implicit grant, so no client secret is needed.
2. Copy `.env.example` to `.env` and fill it in:

| Variable | Description |
| --- | --- |
| `ANILIST_CLIENT_ID` | AniList API client ID |
| `APP_URL` | Public URL of the app, without a trailing slash |
| `SYNC_INTERVAL_HOURS` | How often the full sync runs (default `6`) |
| `DATABASE_PATH` | Where the SQLite cache is stored, e.g. `data/anime.db` (set automatically in Docker) |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional Sentry DSN; Sentry is disabled when empty |

To use a different time zone than the container default (UTC), add `TZ`, for example `TZ=Europe/Ljubljana`.

## Development

```sh
npm install
npm run dev
```

The app runs at http://localhost:3000 and stores its database in `data/anime.db`.

If a style change doesn't show up, stop the dev server, delete `.next` and start it again.

## Docker

```sh
docker compose up -d --build
```

The database is kept in `./data`. `NEXT_PUBLIC_SENTRY_DSN` is passed in at build time, so rebuild after changing it.

## Syncing

- The server syncs the public airing schedule on startup and every `SYNC_INTERVAL_HOURS`, spacing requests according to AniList's `X-RateLimit-*` headers.
- Your browser fetches your list directly from AniList when it's older than 15 minutes, and on "Sync now" (at most once a minute). These requests count against your own rate limit, not the server's.
- Requests that hit the rate limit wait for the `Retry-After` period and retry.

## Data and privacy

- The server stores no user data: no accounts, sessions, tokens or lists.
- Your AniList token and list (Watching, Planning and Paused entries) live in your browser's local storage. Signing out removes them. The token is only used to read your list.
- Show and episode data is a cache of AniList's public schedule. Each sync removes entries that weren't refreshed in the last 7 days, episodes outside the window and shows with no remaining episodes.

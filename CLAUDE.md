# Kin Haus — Occupancy Hub

## What this is
A local Node.js app that gives Alex (co-owner of Kin Haus, a boutique co-living villa on Koh Phangan, Thailand) a unified occupancy dashboard across all three Airbnb listings plus direct bookings and friend stays.

It runs a local Express server, fetches live iCal feeds from all three Airbnb listings on page load, merges them with a local `data/bookings.json` for manual entries, and serves an interactive calendar dashboard.

---

## Architecture

```
kin-haus-occupancy/
├── server.js           # Express server — fetches iCal, merges data, serves API
├── data/
│   └── bookings.json   # Manual bookings (direct, friend stays, blocks)
├── public/
│   └── index.html      # Frontend dashboard (vanilla JS, no build step)
├── scripts/
│   └── refresh.js      # Standalone CLI script to force-refresh iCal cache
├── package.json
└── CLAUDE.md           # This file
```

---

## The Three Rooms

| Room | Airbnb Listing ID | nightly rate (high season) |
|------|-------------------|---------------------------|
| The Nest | 1511809226602265595 | ฿5,000 |
| Master Suite | 1618003971883950106 | ฿3,200 |
| Nomad Room | 1618012678467611754 | ฿2,400 |

Low season (Apr–Oct): 30% discount on nightly rates.

---

## iCal Sources (live Airbnb feeds)

```
NEST:   https://www.airbnb.com/calendar/ical/1511809226602265595.ics?t=6da53756cef94910b25623ecb81e7ac9
MASTER: https://www.airbnb.com/calendar/ical/1618003971883950106.ics?t=0435a8bdfd1843b086df6d273cd9de77
NOMAD:  https://www.airbnb.com/calendar/ical/1618012678467611754.ics?t=4498a6d4c07b40258da2bc92a284ee36
```

These are private iCal export URLs. Do not commit them to a public repo.

---

## data/bookings.json schema

Manual bookings are stored here (direct bookings, friend stays, owner blocks not reflected in Airbnb):

```json
[
  {
    "id": "unique-string",
    "guest": "Display name",
    "type": "direct | friend | blocked",
    "room": "nest | master | nomad | full",
    "checkin": "YYYY-MM-DD",
    "checkout": "YYYY-MM-DD",
    "amount": 0,
    "notes": "Optional note"
  }
]
```

The `type` field determines colour coding in the dashboard:
- `airbnb` — sourced from iCal (never stored in bookings.json, always live)
- `direct` — direct booking (bank transfer, cash, etc.)
- `friend` — friend / personal stay (off-market)
- `blocked` — owner block not reflected in Airbnb

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bookings` | Returns merged bookings (iCal + manual), optionally filtered by `?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| GET | `/api/bookings/manual` | Returns only manual bookings from bookings.json |
| POST | `/api/bookings` | Add a manual booking |
| DELETE | `/api/bookings/:id` | Delete a manual booking |
| GET | `/api/refresh` | Force re-fetch iCal feeds (bypasses cache) |
| GET | `/api/status` | Returns last iCal sync time and cache status |

---

## iCal Caching

iCal feeds are cached in memory for 30 minutes to avoid hammering Airbnb. The cache is keyed by room. A manual `/api/refresh` call clears all caches.

---

## Conflict Detection

The server detects and flags conflicts in the `/api/bookings` response:
- If a manual booking overlaps with an iCal booking for the same room, the response includes a `conflict: true` flag on the manual booking.
- If Nad (or any friend stay) is logged in bookings.json and a new Airbnb booking lands in that window, the API flags it.

---

## Key People

- **Alex** — co-owner, operator, runs this app
- **Paulo** — co-owner, co-operator
- **Nad** — friend, visiting May 18–22 2026 (already in bookings.json)

---

## Running Locally

```bash
npm install
npm start
# Opens at http://localhost:3000
```

To force-refresh iCal data from the command line:
```bash
node scripts/refresh.js
```

---

## Future Extensions (ideas, not built yet)

- [ ] Notion sync — write new Airbnb bookings to the Kin Haus Income DB automatically
- [ ] Revenue projections — estimate monthly revenue based on bookings + nightly rates
- [ ] Paulo's view — separate read-only URL for Paulo to check occupancy
- [ ] Email alerts — notify when a conflict is detected
- [ ] Booking.com iCal — add a fourth source if Booking.com is ever used

---

## Style Notes

- No em dashes in any generated copy
- Rooms: "The Nest", "Master Suite", "Nomad Room" (exact capitalisation)
- Location: Thongsala (not Ban Tai)
- The app is for internal use only — no public-facing pages

# Kin Haus

Boutique co-living villa on Koh Phangan, Thailand. This app serves two purposes:

1. **Marketing website** at kinhaus.space (public rooms, blog, contact form)
2. **Occupancy dashboard** at /dashboard (password-protected booking management)

Fetches live iCal feeds from three Airbnb listings, merges with local manual bookings, and serves an interactive calendar + booking manager.

## Backlog

Active development backlog is tracked in [`BACKLOG.md`](BACKLOG.md). Claude should read this file at the start of each session for roadmap context.

---

## Tech Stack

- **Astro 5.18** SSR with `@astrojs/node` adapter (standalone mode)
- **TypeScript** backend (strict mode)
- **Vanilla JS** frontend (inline in .astro files, no framework)
- **node-ical** for parsing Airbnb iCal feeds
- **OpenAI** (gpt-4o-mini) for dashboard chat, WhatsApp chatbot, draft replies
- **Flatpickr** (CDN) for date pickers
- **PM2** for process management on the VPS

---

## Architecture

```
kin-haus/
  src/
    layouts/                  # BaseLayout.astro, MarketingLayout.astro
    lib/                      # Shared backend logic
      types.ts                # All TypeScript interfaces
      constants.ts            # Shared constants (room slugs, labels, pricing defaults)
      config.ts               # Room configs, iCal source URLs, rates
      paths.ts                # DATA_DIR and file path constants
      ical.ts                 # Fetch + parse Airbnb iCal feeds
      bookings.ts             # Read/write manual bookings + overrides; getMergedBookings()
      cache.ts                # In-memory iCal cache (30min TTL)
      conflicts.ts            # Booking overlap detection
      dates.ts                # Date utilities (toDateStr, filterByDateRange)
      availability.ts         # Compute available windows per room
      inquiries.ts            # Read/write inquiries
      discount-codes.ts       # Read/write promo codes
      guests.ts               # Read/write guest profiles
      housekeepers.ts         # Read/write housekeeper records
      housekeeping.ts         # Read/write housekeeping tasks
      monitor-rentals.ts      # Read/write monitor rental records
      coworking.ts            # Read/write co-working passes
      dietary.ts              # Read/write dietary preferences
      expenses.ts             # Read/write expense records + receipt files
      income.ts               # Read/write income records + receipt files
      accounting-summary.ts   # Compute accounting summaries from expenses + income
      guest-portals.ts        # Read/write guest portal tokens and state
      guest-upsells.ts        # Upsell definitions for guest portal
      auth.ts                 # Session token generation (HMAC-SHA256)
      api-response.ts         # JSON response helpers
      validate.ts             # Lightweight input validation
      ai/                     # Shared AI/LLM modules
        client.ts             # Shared OpenAI client singleton
        pricing-calculator.ts # Dynamic price computation (seasonal, long-stay, promo codes)
      whatsapp/               # WhatsApp Cloud API integration
        types.ts              # Webhook payload types
        client.ts             # Send messages, mark as read
        chatbot.ts            # AI chatbot (OpenAI tool calling, 5 tools)
        security.ts           # HMAC signature verification + rate limiting
    pages/
      index.astro             # Marketing homepage
      dashboard.astro         # Occupancy dashboard (main app, ~5000 lines)
      accounting.astro        # Accounting module (expenses + income)
      coworking.astro         # Co-working pass management
      dietary.astro           # Dietary preferences management
      login.astro             # Password login
      contact.astro           # Contact form
      location.astro          # Villa location + amenities
      events.astro            # Events / lifestyle
      rooms/                  # Room detail pages (the-nest, the-explorer, nomad-room)
      blog/                   # Blog posts
      guest/                  # Guest portal pages
        [token].astro         # Guest portal entry (pre-arrival onboarding)
        dietary.astro         # Guest dietary preferences form
      admin/                  # Admin-only pages
      api/                    # REST API routes
        auth.ts               # POST login (set session cookie)
        chat.ts               # GET/POST/DELETE SSE streaming dashboard chat
        widget-chat.ts        # POST public marketing site chat (rate-limited, no auth)
        bookings/             # GET (merged), POST, PATCH, DELETE; GET /manual
        pricing.ts            # GET/PATCH room rates
        refresh.ts            # GET force-clear iCal cache
        status.ts             # GET system status
        availability/         # GET public availability per room
        inquiries/            # GET/POST/PATCH/DELETE; POST /:id/draft-reply
        discount-codes/       # GET/POST/PATCH/DELETE; GET /validate
        guests/               # GET/POST/PATCH/DELETE guest profiles; POST /import
        housekeepers/         # GET/POST/PATCH/DELETE housekeeper records
        housekeeping/         # GET/POST/PATCH/DELETE tasks; GET /ical
        monitors/             # GET/POST monitor rentals; POST /rent, /return/:id,
                              #   /advance/:id, /maintenance; GET /history, /revenue
        coworking/            # GET/POST/PATCH/DELETE co-working passes; POST /checkin
        dietary.ts            # GET/PATCH dietary preferences
        expenses/             # GET/POST/PATCH/DELETE expenses; GET/POST /:id/file
        income/               # GET/POST/PATCH/DELETE income; GET/POST /:id/file
        accounting/           # GET /summary
        guest-portal/         # GET/POST portal tokens; GET /:token;
                              #   POST /step/arrival, /tm30, /dietary, /upsells,
                              #        /feedback, /complete
        whatsapp/             # POST webhook for incoming messages
    styles/
      dashboard.css           # Dashboard-specific styles
    middleware.ts             # Auth middleware (protects /dashboard + /api/*)
  data/                       # Runtime JSON (gitignored, backed up on deploy)
    bookings.json
    overrides.json
    inquiries.json
    discount-codes.json
    pricing.json
    guests.json
    monitor-rentals.json
    expenses/                 # Per-expense receipt files (gitignored)
    incomes/                  # Per-income receipt files (gitignored)
  public/                     # Static assets (favicons, images, videos, robots.txt)
  assets/                     # Astro-processed images
  mcp/                        # MCP server (Claude Code integration)
    package.json              # @modelcontextprotocol/sdk, zod
    tsconfig.json
    src/
      index.ts                # MCP server: 10 tools wrapping the REST API
      api-client.ts           # HTTP client with HMAC-SHA256 auth
    dist/                     # Compiled JS (gitignored)
  .mcp.json                   # Claude Code MCP server config
  deploy.sh                   # VPS deployment script
  astro.config.mjs
  CLAUDE.md
```

---

## The Three Rooms

| Room         | Slug      | Airbnb Listing ID   | High Season Rate | Low Season Rate |
| ------------ | --------- | ------------------- | ---------------- | --------------- |
| The Nest     | `nest`    | 1511809226602265595 | 5,000 THB        | 3,500 THB       |
| The Explorer | `master`  | 1618003971883950106 | 3,200 THB        | 2,240 THB       |
| The Nomad    | `nomad`   | 1618012678467611754 | 2,400 THB        | 1,680 THB       |
| Theater Room | `theater` | (manual only)       | N/A              | N/A             |

- High season: Nov-Mar. Low season: Apr-Oct (30% discount).
- Rates stored in `data/pricing.json`, editable from the dashboard.
- Room names: always "The Nest", "The Explorer", "The Nomad" (exact capitalisation).

---

## API Endpoints

### Protected (require session cookie)

| Method           | Path                             | Description                                                                         |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| GET/POST/DELETE  | `/api/chat`                      | SSE streaming dashboard AI chat (GET=restore, POST=send, DELETE=clear)              |
| GET              | `/api/bookings`                  | Merged iCal + manual bookings with conflict detection. Optional `?from=&to=` filter |
| POST             | `/api/bookings`                  | Create manual booking                                                               |
| PATCH            | `/api/bookings/:id`              | Update booking (guest, amount, notes, dates, type)                                  |
| DELETE           | `/api/bookings/:id`              | Delete manual booking                                                               |
| GET              | `/api/bookings/manual`           | Manual bookings only                                                                |
| GET              | `/api/refresh`                   | Force-clear iCal cache and re-fetch                                                 |
| GET              | `/api/status`                    | Cache age, booking counts, uptime                                                   |
| GET              | `/api/pricing`                   | Current room rates                                                                  |
| PATCH            | `/api/pricing`                   | Update room rates                                                                   |
| GET              | `/api/inquiries`                 | List inquiries                                                                      |
| POST             | `/api/inquiries/:id/draft-reply` | Generate AI draft WhatsApp reply for an inquiry                                     |
| PATCH            | `/api/inquiries/:id`             | Update inquiry status                                                               |
| DELETE           | `/api/inquiries/:id`             | Delete inquiry                                                                      |
| GET              | `/api/discount-codes`            | List promo codes                                                                    |
| POST             | `/api/discount-codes`            | Create promo code                                                                   |
| PATCH            | `/api/discount-codes/:id`        | Update promo code                                                                   |
| DELETE           | `/api/discount-codes/:id`        | Delete promo code                                                                   |
| GET/POST         | `/api/guests`                    | List / create guest profiles                                                        |
| GET/PATCH/DELETE | `/api/guests/:id`                | Single guest profile                                                                |
| POST             | `/api/guests/import`             | Bulk import guests from CSV/JSON                                                    |
| GET/POST         | `/api/housekeepers`              | List / create housekeeper records                                                   |
| GET/PATCH/DELETE | `/api/housekeepers/:id`          | Single housekeeper                                                                  |
| GET/POST         | `/api/housekeeping`              | List / create housekeeping tasks                                                    |
| GET              | `/api/housekeeping/ical`         | Housekeeping tasks as iCal feed                                                     |
| GET/POST         | `/api/monitors`                  | List / create monitor rental units                                                  |
| POST             | `/api/monitors/rent`             | Create a rental                                                                     |
| POST             | `/api/monitors/advance/:id`      | Extend a rental                                                                     |
| POST             | `/api/monitors/return/:id`       | Return a rental                                                                     |
| POST             | `/api/monitors/maintenance`      | Log maintenance                                                                     |
| GET              | `/api/monitors/history`          | Rental history                                                                      |
| GET              | `/api/monitors/revenue`          | Revenue summary                                                                     |
| GET/POST         | `/api/coworking`                 | List / create co-working passes                                                     |
| POST             | `/api/coworking/checkin`         | Record a co-working check-in                                                        |
| GET/PATCH/DELETE | `/api/coworking/:id`             | Single co-working pass                                                              |
| GET/PATCH        | `/api/dietary`                   | Dietary preferences (all guests)                                                    |
| GET/POST         | `/api/expenses`                  | List / create expense records                                                       |
| GET/PATCH/DELETE | `/api/expenses/:id`              | Single expense                                                                      |
| GET/POST         | `/api/expenses/:id/file`         | Receipt file for an expense                                                         |
| GET/POST         | `/api/income`                    | List / create income records                                                        |
| GET/PATCH/DELETE | `/api/income/:id`                | Single income record                                                                |
| GET/POST         | `/api/income/:id/file`           | Receipt file for an income record                                                   |
| GET              | `/api/accounting/summary`        | Aggregated P&L summary                                                              |
| GET/POST         | `/api/guest-portal`              | List portals / create portal token                                                  |
| GET              | `/api/guest-portal/:token`       | Get portal state by token                                                           |
| POST             | `/api/guest-portal/step/*`       | Portal onboarding steps (arrival, tm30, dietary, upsells, feedback, complete)       |

### Public (no auth)

| Method | Path                                  | Description                                             |
| ------ | ------------------------------------- | ------------------------------------------------------- |
| POST   | `/api/auth`                           | Login (sets session cookie)                             |
| POST   | `/api/inquiries`                      | Submit booking inquiry from marketing site              |
| GET    | `/api/availability/:room`             | Booked dates for public calendar widget                 |
| GET    | `/api/discount-codes/validate?code=X` | Validate promo code                                     |
| POST   | `/api/widget-chat`                    | Marketing site AI chat (rate-limited: 30 req/hr per IP) |
| POST   | `/api/whatsapp/webhook`               | WhatsApp Cloud API webhook (signature-verified)         |

---

## Authentication

- Password set via `DASHBOARD_PASSWORD` env var
- Session token = HMAC-SHA256(password, password), stored as `kin_session` httpOnly cookie (30 days)
- Middleware (`src/middleware.ts`) protects all `/dashboard` and `/api/*` routes except the public ones listed above
- Login page at `/login`, form POSTs to `/api/auth`

---

## Data Files

All stored in `data/`, gitignored, backed up on deploy.

### bookings.json

```json
[
  {
    "id": "string",
    "guest": "Display name",
    "type": "direct | friend | blocked | owner | hold | waitlist",
    "room": "nest | master | nomad | theater | full",
    "checkin": "YYYY-MM-DD",
    "checkout": "YYYY-MM-DD",
    "amount": 0,
    "notes": "Optional"
  }
]
```

### overrides.json

Per-booking attribute overrides for Airbnb bookings (amount, guest name, notes):

```json
{ "airbnb-nest-abc123": { "amount": 45000, "guest": "Real Name", "notes": "Paid cash" } }
```

### pricing.json

```json
{
  "nest": { "high": 5000, "low": 3500 },
  "master": { "high": 3200, "low": 2240 },
  "nomad": { "high": 2400, "low": 1680 }
}
```

### inquiries.json

```json
[
  {
    "id": "string",
    "room": "The Nest",
    "roomSlug": "nest",
    "checkin": "YYYY-MM-DD",
    "checkout": "YYYY-MM-DD",
    "nights": 5,
    "guest": "Name",
    "message": "...",
    "whatsapp": "+66...",
    "amount": 25000,
    "currency": "THB",
    "status": "new | responded | booked | archived",
    "createdAt": "ISO-8601"
  }
]
```

### discount-codes.json

```json
[
  {
    "id": "string",
    "code": "FRIEND20",
    "discount": 20,
    "note": "...",
    "active": true,
    "createdAt": "ISO-8601"
  }
]
```

### guests.json

Guest profile database (passport details, contact info, stay history, dietary preferences, tags).

### monitor-rentals.json

Monitor rental records (unit, guest, dates, amount, return status).

---

## Booking Types

| Type       | Source           | Color  | Description                                                                                                     |
| ---------- | ---------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `airbnb`   | iCal feed (live) | Red    | Never stored locally, always fetched fresh                                                                      |
| `direct`   | Manual           | Green  | Direct booking (bank transfer, cash)                                                                            |
| `friend`   | Manual           | Blue   | Friend / personal stay                                                                                          |
| `blocked`  | Manual           | Gray   | Owner block (can be overridden by other types)                                                                  |
| `owner`    | Manual           | Gold   | Owner stay                                                                                                      |
| `hold`     | Manual           | Cyan   | Tentative / pending booking                                                                                     |
| `waitlist` | Manual           | Purple | Backup interest for already-booked dates (excluded from conflicts, revenue, occupancy, and public availability) |

---

## iCal Integration

- Private iCal export URLs stored in `.env` (`ICAL_URL_NEST`, `ICAL_URL_MASTER`, `ICAL_URL_NOMAD`)
- Fetched via `node-ical`, cached in-memory for 30 minutes per room
- Falls back to stale cache if fetch fails
- Force refresh: `GET /api/refresh`
- Extracts guest phone (last 4 digits) and Airbnb reservation code from event summary

---

## Conflict Detection

- Detects overlapping date ranges for the same room
- `blocked` bookings can be overridden by `direct`, `friend`, `owner`, `hold` types without flagging a conflict
- Flagged bookings get `conflict: true` and `conflictWith: <id>` in the API response
- Dashboard shows a conflict banner with details

---

## Dashboard AI Chat

SSE streaming chat panel (floating FAB on desktop, full-screen on mobile) backed by `/api/chat`.

- **Model:** gpt-4o-mini
- **Session persistence:** server-side (GET to restore, DELETE to clear)
- **Keyboard shortcut:** Cmd/Ctrl+K opens the command bar (quick navigation + AI shortcuts)
- **Morning briefing:** "Briefing" button on the Today tab sends the morning briefing prompt

**Chat Tools:**

- `get_bookings` - fetch bookings with optional date range
- `create_booking` - create a manual booking
- `update_booking` - edit a booking
- `delete_booking` - delete a booking
- `get_today_summary` - today's check-ins/outs, occupancy, housekeeping tasks
- `get_revenue_insights` - revenue breakdown by room and period
- `get_gap_nights` - find unbooked gaps between bookings
- `update_inquiry` - update an inquiry status
- `create_housekeeping_task` - log a housekeeping task

---

## WhatsApp Integration

AI-powered chatbot for guest inquiries via WhatsApp Cloud API (Meta Business).

**Env vars needed:**

- `WHATSAPP_VERIFY_TOKEN` - webhook verification token
- `WHATSAPP_ACCESS_TOKEN` - Meta API access token
- `WHATSAPP_PHONE_NUMBER_ID` - registered phone number ID
- `WHATSAPP_APP_SECRET` - for HMAC signature verification
- `OPENAI_API_KEY` - for chatbot responses

**Chatbot Tools (5):**

- `check_availability` - check room availability windows (single room or all)
- `create_inquiry` - log a booking request (auto-calculates amount via pricing calculator)
- `calculate_price` - compute accurate total for specific dates with seasonal rates, long-stay discounts, and promo codes
- `lookup_pricing` - get current nightly rates from `data/pricing.json` (never hardcoded)
- `validate_promo_code` - check if a discount code is active

**Features:** Dynamic pricing, promo code validation, availability checking, inquiry creation with auto-calculated amounts, rate-limited (10 msgs/min per phone), conversation history (2hr expiry).

---

## Marketing Site Chat Widget

Floating chat bubble on all marketing pages (`MarketingLayout.astro`), backed by the public `/api/widget-chat` endpoint.

- **Model:** gpt-4o-mini
- **Rate limit:** 30 requests/hr per IP (in-memory, cleanup every 15 min)
- **Conversation:** persisted in `sessionStorage`
- **Tools:** `check_availability`, `calculate_price`, `lookup_pricing`, `validate_promo_code` (same as WhatsApp, no internal data access)

---

## Inquiry Draft Reply

"Draft Reply" button on inquiry cards in the dashboard generates a ready-to-send WhatsApp message.

- **Endpoint:** `POST /api/inquiries/:id/draft-reply`
- **Model:** gpt-4o-mini (single call, max 400 tokens)
- Writes as Alex, plain text, under 160 words, with accurate pricing and availability

---

## Dynamic Pricing Calculator

Interactive stay-cost calculator on all three room pages (MarketingLayout). Initialised from `data-room-slug` on `.room-page`.

- Flatpickr date pickers with booked-out dates blocked (fetched from `/api/availability/:room`)
- Seasonal pricing (high/low) + long-stay discounts (7+ nights: 10%, 14+: 15%, 30+: 20%)
- "Book this room" CTA pre-fills dates into the booking modal via `window._bmSetDates(ci, co)`

---

## Guest Portal

Pre-arrival onboarding flow for confirmed guests. Token-based (no login required).

- **Entry:** `GET /guest/:token` (rendered by `src/pages/guest/[token].astro`)
- **Steps:** arrival details, TM30 info, dietary preferences, upsells, feedback, complete
- **API:** `/api/guest-portal/*`
- Populates guest profiles and sets `tm30Status` on bookings

---

## Accounting Module

Expense and income tracking at `/accounting`.

- Expenses and income stored as JSON arrays; receipt files stored in `data/expenses/` and `data/incomes/`
- Summary endpoint: `GET /api/accounting/summary` (P&L by period and category)
- File upload/download for receipts: `GET|POST /api/expenses/:id/file`, same for income

---

## MCP Server (Claude Code Integration)

The `mcp/` directory contains an MCP (Model Context Protocol) server that lets Claude directly access the booking platform from conversation. It wraps the REST API with 10 tools using stdio transport.

**Env vars needed (set in `.mcp.json` or environment):**

- `KIN_HAUS_URL` - base URL (default: `http://localhost:3001`, staging: `https://staging.kinhaus.space`)
- `KIN_HAUS_PASSWORD` - dashboard password (same as `DASHBOARD_PASSWORD`)

**MCP Tools (10):**

| Tool                 | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| `list_bookings`      | All bookings (Airbnb + manual) with optional date range filter         |
| `create_booking`     | Create manual booking (direct, friend, blocked, owner, hold, waitlist) |
| `update_booking`     | Edit booking fields                                                    |
| `delete_booking`     | Remove manual booking                                                  |
| `list_inquiries`     | All inquiries from WhatsApp + marketing site                           |
| `update_inquiry`     | Change inquiry status                                                  |
| `check_availability` | Booked dates per room                                                  |
| `get_pricing`        | Current room rates                                                     |
| `get_status`         | System status, cache age, uptime                                       |
| `refresh_cache`      | Force iCal re-fetch                                                    |

**Build:**

```bash
cd mcp && npm install && npm run build
```

**Config:** `.mcp.json` at project root auto-registers the server with Claude Code.

---

## Running Locally

```bash
npm install
npm run dev        # Astro dev server at http://localhost:3000
npm run build      # Production build to dist/
npm start          # Production server: node dist/server/entry.mjs
```

---

## Deployment

VPS at `5.223.42.90`, managed with **PM2**, deployed via `deploy.sh`:

```bash
./deploy.sh            # Production: /var/www/kin-haus, port 3001
./deploy.sh staging    # Staging: /var/www/kin-haus-staging, port 3002
```

The script: backs up data/ files, git pulls, npm install + build, restarts via PM2, verifies HTTP 200.

Domain: `kinhaus.space` (production), `staging.kinhaus.space` (staging).

---

## Key People

- **Alex** - co-owner, operator, runs this app
- **Paulo** - co-owner, co-operator

---

## Style Notes

- No em dashes in any generated copy
- Rooms: "The Nest", "The Explorer", "The Nomad" (exact capitalisation)
- Location: Thongsala, Koh Phangan (not Ban Tai)
- Currency display: THB primary, EUR/USD secondary (user-toggleable, EUR_RATE=37, USD_RATE=34)

# Kin Haus

Marketing website and occupancy dashboard for a boutique co-living villa on Koh Phangan, Thailand.

## Tech Stack

- **Astro 5.18** SSR with Node adapter
- **TypeScript** (strict)
- **Vanilla JS** frontend (no framework in dashboard)
- **node-ical** for Airbnb iCal feed parsing
- **OpenAI** (gpt-4o-mini) for WhatsApp chatbot
- **Flatpickr** for date pickers
- **Vitest** for testing

## Getting Started

```bash
pnpm install
cp .env .env.local   # Add Airbnb iCal URLs, dashboard password, API keys
pnpm dev             # http://localhost:3000
```

## Scripts

| Command           | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `pnpm dev`        | Start Astro dev server                               |
| `pnpm build`      | Production build to `dist/`                          |
| `pnpm start`      | Run production server (`node dist/server/entry.mjs`) |
| `pnpm preview`    | Preview production build                             |
| `pnpm test`       | Run tests (Vitest)                                   |
| `pnpm test:watch` | Run tests in watch mode                              |

## Project Structure

```
src/
  pages/              # Astro pages + API routes
    index.astro       # Marketing homepage
    dashboard.astro   # Occupancy dashboard (password-protected)
    rooms/            # Room detail pages
    blog/             # Blog posts
    api/              # REST API (bookings, pricing, availability, inquiries)
  lib/                # Backend logic (ical, bookings, auth, pricing, conflicts)
    ai/               # OpenAI client + pricing calculator
    whatsapp/         # WhatsApp Cloud API chatbot integration
  layouts/            # BaseLayout, MarketingLayout
  middleware.ts       # Auth middleware
data/                 # Runtime JSON storage (gitignored)
mcp/                  # MCP server for Claude Code integration (10 tools)
```

## Deployment

Deployed to VPS via `deploy.sh`:

```bash
./deploy.sh            # Production — kinhaus.space (port 3001)
./deploy.sh staging    # Staging — staging.kinhaus.space (port 3002)
```

## Deep Documentation

See [CLAUDE.md](CLAUDE.md) for full architecture details: API endpoints, data schemas, booking types, iCal integration, WhatsApp chatbot tools, MCP server, auth flow, and room configuration.

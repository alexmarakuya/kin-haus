# Backlog

> Development backlog for Kin Haus. Items are logged here during sessions and reviewed periodically.
> Claude reads this file at the start of each session for roadmap context.

## Next Up

_(nothing currently queued)_

## Ideas

- [ ] **Mobile dashboard redesign** -- Rethink calendar/occupancy view for mobile. The desktop month grid won't work on small screens, needs a fundamentally different concept.
- [ ] **Blog content generation** -- Use AI to draft blog posts targeting digital nomad SEO keywords.
- [ ] **Inquiry auto-decline for unavailable dates** -- Chatbot could automatically let guests know when their requested dates are fully booked and suggest alternatives, reducing manual follow-up.
- [ ] **Real guest testimonials** -- Replace placeholder testimonials on homepage with verified guest reviews once collected.

## Completed

- [x] **LLM: ⌘K command bar in dashboard** -- Spotlight-style Cmd/Ctrl+K overlay with quick tab navigation and AI query shortcuts; free-text falls through to the chat panel. _(completed 2026-04-24)_
- [x] **LLM: AI Briefing button on Today tab** -- One-click morning briefing that opens the chat panel pre-loaded with the briefing prompt. _(completed 2026-04-24)_
- [x] **Dynamic pricing calculator on room pages** -- Flatpickr date pickers with blocked dates, seasonal + long-stay pricing, "Book this room" CTA pre-fills the booking modal. _(completed 2026-04-24)_
- [x] **LLM: Marketing site chat widget** -- Floating chat bubble on all marketing pages (sessionStorage history, typing indicator, availability + pricing tools, 30 req/hr rate limit). _(completed 2026-04-24)_
- [x] **Testimonials section on homepage** -- Three real-looking testimonials from The Nest, The Nomad, and The Explorer guests. _(completed 2026-04-24)_
- [x] **getMergedBookings() canonical export** -- Extracted to src/lib/bookings.ts; removed duplicate from api/chat.ts. _(completed 2026-04-24)_
- [x] **LLM: Dashboard draft-reply for inquiries** -- "Draft Reply" button on inquiry cards generates a WhatsApp reply via gpt-4o-mini with live pricing and availability. _(completed 2026-04-24)_
- [x] **MCP server for Claude Code** -- 10-tool MCP server wrapping the REST API (list/create/update/delete bookings, inquiries, availability, pricing, status, cache refresh). Stdio transport with HMAC-SHA256 auth. _(completed 2026-03-11)_
- [x] **WhatsApp chatbot: dynamic pricing + promo codes** -- Added 3 new tools (calculate*price, lookup_pricing, validate_promo_code), auto-calculated inquiry amounts, removed hardcoded rates from system prompt. *(completed 2026-03-11)\_
- [x] **Calendar half-day bars** -- Check-in cells show right-half colored, last-night cells show left-half colored, making booking boundaries visually clear. _(completed 2026-03-11)_
- [x] **Waitlist/backup booking type** -- New `waitlist` type with purple dotted styling, excluded from conflicts/revenue/occupancy, with "Promote to Booking" flow. _(completed 2026-03-11)_

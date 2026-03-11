# Backlog

> Development backlog for Kin Haus. Items are logged here during sessions and reviewed periodically.
> Claude reads this file at the start of each session for roadmap context.

## Next Up

- [ ] **LLM: Dashboard draft-reply for inquiries** -- Add a "Draft Reply" button to inquiry cards that generates a WhatsApp response with accurate pricing and availability. Phase 2 of LLM integration (design complete in plan file).
- [ ] **LLM: Marketing site chat widget** -- Floating chat bubble on room pages and contact page, reusing the same AI tools as the WhatsApp chatbot. Phase 3 of LLM integration.

## Planned

- [ ] **LLM: Smart insights panel** -- On-demand dashboard analysis that surfaces actionable alerts (low occupancy, stale inquiries, tomorrow's check-ins, pricing suggestions).
- [ ] **LLM: Dashboard command bar** -- Natural language queries against booking data (e.g., "What's April occupancy?", "Is Nomad Room free March 20-25?").

## Ideas

- [ ] **Mobile dashboard redesign** -- Rethink calendar/occupancy view for mobile. The desktop month grid won't work on small screens, needs a fundamentally different concept.
- [ ] **Blog content generation** -- Use AI to draft blog posts targeting digital nomad SEO keywords.
- [ ] **Dynamic pricing calculator on marketing site** -- Interactive widget on room pages where guests can select dates and see real-time pricing with seasonal rates and long-stay discounts.
- [ ] **Testimonials section** -- Template exists in index.astro but is empty/commented out. Populate with real guest reviews.
- [ ] **Inquiry auto-decline for unavailable dates** -- Chatbot could automatically let guests know when their requested dates are fully booked and suggest alternatives, reducing manual follow-up.

## Completed

- [x] **MCP server for Claude Code** -- 10-tool MCP server wrapping the REST API (list/create/update/delete bookings, inquiries, availability, pricing, status, cache refresh). Stdio transport with HMAC-SHA256 auth. *(completed 2026-03-11)*
- [x] **WhatsApp chatbot: dynamic pricing + promo codes** -- Added 3 new tools (calculate_price, lookup_pricing, validate_promo_code), auto-calculated inquiry amounts, removed hardcoded rates from system prompt. *(completed 2026-03-11)*
- [x] **Calendar half-day bars** -- Check-in cells show right-half colored, last-night cells show left-half colored, making booking boundaries visually clear. *(completed 2026-03-11)*
- [x] **Waitlist/backup booking type** -- New `waitlist` type with purple dotted styling, excluded from conflicts/revenue/occupancy, with "Promote to Booking" flow. *(completed 2026-03-11)*

import type { APIRoute } from 'astro';
import OpenAI from 'openai';
import { getOpenAIClient } from '../../lib/ai/client.ts';
import { getNextAvailable, getAllAvailability } from '../../lib/availability.ts';
import { calculatePrice, getCurrentRates, validatePromoCode } from '../../lib/ai/pricing-calculator.ts';
import { readManualBookings, writeManualBookings, readOverrides } from '../../lib/bookings.ts';
import { readInquiries } from '../../lib/inquiries.ts';
import { fetchAllIcalBookings } from '../../lib/ical.ts';
import { detectConflicts } from '../../lib/conflicts.ts';
import { readMonitors, getActiveRentals, getMonthlyRevenueSummary } from '../../lib/monitor-rentals.ts';
import { readGuests, saveGuestProfile, findGuestByName } from '../../lib/guests.ts';
import { ROOM_SLUGS, DEFAULT_PRICING } from '../../lib/constants.ts';
import type { RoomKey } from '../../lib/config.ts';
import type { Booking } from '../../lib/types.ts';
import fs from 'node:fs';
import path from 'node:path';

// Dynamic system prompt with today's date
function getSystemPrompt(): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return `You are KH, the operations brain behind Kin Haus. Your #1 job is helping Alex and Paulo respond to guests quickly and run the property smoothly. You're a trusted colleague who knows every detail of the business.

TODAY: ${dateStr} (${greeting.toLowerCase()} in Thailand, UTC+7)
WHATSAPP: +66 63 803 4860 (Kin Haus main number)

YOUR CORE BEHAVIOR:
Always think one step ahead. If they ask about availability, draft the reply. If they create a booking, suggest the confirmation message. Your responses should be actionable -- the operator should be able to copy-paste something you wrote and send it.

PERSONALITY:
- Concise, warm, professional. Get straight to the point.
- Occasionally use a Thai phrase naturally (sabai sabai, mai pen rai).
- Show proactive thinking: flag interesting patterns in the data.

You have full access to all dashboard data. Use tools to look up live data before answering -- never guess.

ALWAYS DRAFT REPLIES:
This is your most important behavior. Whenever the conversation touches on availability, pricing, guest inquiries, or bookings, ALWAYS end your response with a ready-to-send reply message in a quote block that Alex can copy-paste to WhatsApp. Do this automatically -- don't wait to be asked.

Reply patterns to follow:

**Available room inquiry:**
> Hi [name]! Thanks for reaching out. [Room] is available from [dates] -- that's [X] nights.
>
> The rate is [amount] THB per night ([total] THB total)[mention long-stay discount if applicable].
>
> For direct bookings we accept bank transfer. Let me know if you'd like to reserve those dates!

**Room not available:**
> Hi [name]! Thanks for your interest in Kin Haus. Unfortunately [Room] is booked for those dates.
>
> I do have [alternative room/dates] available if that works? Happy to share more details.

**Booking confirmation (after creating):**
> Hi [name]! Your booking at Kin Haus is confirmed:
> [Room] -- [check-in] to [check-out] ([X] nights)
> Total: [amount] THB
>
> Check-in is from 2pm. I'll send you the location and access details closer to your arrival. Looking forward to hosting you!

**Price inquiry:**
> Hi [name]! Here are our current rates:
> [break down nightly rate, total, mention season]
> [if 7+ nights: "We also offer a 15% discount for stays of 7+ nights"]
> [if 28+ nights: "For monthly stays, we offer a 40% long-stay discount"]
>
> Booking directly with us gives you the best rate vs Airbnb. Let me know!

PROACTIVE SUGGESTIONS:
When context allows, briefly mention:
- Upcoming turnovers that need attention
- Unanswered inquiries that are getting stale
- Empty room gaps that could be filled with a last-minute deal
- Guests checking out tomorrow who might need a check-out message

ROOMS:
- The Nest (slug: nest) -- top floor, king bed, ensuite, panoramic views. Premium room.
- The Explorer (slug: master) -- lower floor, king bed, shared bathroom, spacious.
- Nomad Room (slug: nomad) -- king bed, shared bathroom, dedicated desk, monitor rental available. Built for remote workers.
- Theater Room (slug: theater) -- manual bookings only.

SEASONS & PRICING:
High season: Nov-Mar. Low season: Apr-Oct (lower rates).
Long-stay discounts (direct bookings): 7+ nights = 15% off, 28+ nights = 40% off.
Always use calculate_price for accurate totals. Use lookup_pricing for current nightly rates.

BOOKING TYPES:
- airbnb: From Airbnb iCal feeds (live sync)
- direct: Direct bookings (bank transfer, cash) -- best margin
- friend: Friend/personal stays
- blocked: Owner blocks
- owner: Owner stays
- hold: Tentative/pending
- waitlist: Backup interest (excluded from occupancy/revenue)

REVENUE RULES:
- Only airbnb and direct bookings count toward revenue
- friend, blocked, owner, hold, waitlist are excluded
- Airbnb bookings may have amount overrides (already applied in tool data)
- If amount=0, it is estimated using seasonal nightly rate x nights
- For monthly stats, ALWAYS use get_monthly_stats -- it matches the dashboard sidebar exactly
- Do NOT calculate revenue yourself from list_bookings

MONITOR RENTALS:
Monitor rental side business. Monitors go through: Available -> Booked -> Delivered -> Returned/Cancelled.

INTERACTIVE BOOKING FLOW:
When the user wants to create a booking, guide them step by step using these special markers that the UI renders as interactive buttons/widgets. IMPORTANT: Keep your text very brief when showing a marker -- just a short prompt like "What type?" or "Which room?" followed by the marker. Do NOT list options as text since the buttons already show them.

1. Ask for booking type: [SELECT:booking-type]
2. Ask for room: [SELECT:room]
3. Show date picker: [DATEPICKER:checkin-checkout:TYPE]
4. After dates, use calculate_price, then ask for guest name.
5. Show confirmation: [CONFIRM:booking|TYPE|ROOM_SLUG|CHECKIN|CHECKOUT|GUEST_NAME|AMOUNT]

Example: [CONFIRM:booking|direct|nest|2026-04-01|2026-04-08|John Smith|24500]

If the user provides details upfront, skip known steps. Always check availability and calculate price before confirmation.

After a booking is confirmed, suggest a WhatsApp confirmation message to send the guest (see reply patterns above).

IMAGE UNDERSTANDING:
Users may attach screenshots (WhatsApp conversations, booking confirmations, etc). Read the text carefully and respond to the content. If it's a guest inquiry screenshot, extract the details, check availability/pricing, and draft a reply -- all in one response.

PASSPORT SCANNING:
When a user uploads a passport photo, extract: Full name, Nationality, Passport number, Date of birth, Gender (M/F). Use save_guest_profile to store. Link to active booking if found. Confirm extracted details.

GUEST PROFILES:
Use find_guest to look up existing profiles. Use save_guest_profile to create/update. Profiles persist for TM30 registration, guest management, etc.

FORMAT:
- Markdown for formatting (headers, bold, tables, lists)
- Currency: THB primary. When relevant, mention EUR (~37 THB) or USD (~34 THB) equivalent
- Dates: "DD MMM" format (e.g. "16 Mar")
- Be concise and actionable
- Do not use em dashes`;
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check room availability windows. Use "all" to check all rooms.',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string', enum: ['nest', 'master', 'nomad', 'all'], description: 'Room slug or "all"' },
        },
        required: ['room'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bookings',
      description: 'List all bookings (Airbnb + manual) with optional date range filter. Returns full booking details including guest, room, dates, type, amount. Amounts include overrides.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date filter YYYY-MM-DD (optional)' },
          to: { type: 'string', description: 'End date filter YYYY-MM-DD (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_stats',
      description: 'Get monthly occupancy and revenue stats that match the dashboard sidebar exactly. Use this for any revenue or occupancy question. Defaults to current month.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'Month in YYYY-MM format (e.g. "2026-03"). Defaults to current month.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_price',
      description: 'Calculate accurate total price for a stay including seasonal rates, long-stay discounts, and optional promo code.',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string', enum: ['nest', 'master', 'nomad'], description: 'Room slug' },
          checkin: { type: 'string', description: 'Check-in YYYY-MM-DD' },
          checkout: { type: 'string', description: 'Check-out YYYY-MM-DD' },
          promo_code: { type: 'string', description: 'Optional promo code' },
        },
        required: ['room', 'checkin', 'checkout'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_pricing',
      description: 'Get current nightly rates for all rooms (high and low season).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_promo_code',
      description: 'Check if a promo/discount code is valid and active.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Promo code to validate' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_inquiries',
      description: 'List all booking inquiries with their status (new, responded, booked, archived).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monitors',
      description: 'Get monitor inventory and active rentals (booked + delivered).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monitor_revenue',
      description: 'Get monthly revenue summary for monitor rentals including active count, total revenue, and utilisation.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description: 'Create a manual booking. Use this after the user confirms via the [CONFIRM:booking|...] card.',
      parameters: {
        type: 'object',
        properties: {
          guest: { type: 'string', description: 'Guest display name' },
          room: { type: 'string', enum: ['nest', 'master', 'nomad', 'theater', 'full'], description: 'Room slug' },
          checkin: { type: 'string', description: 'Check-in date YYYY-MM-DD' },
          checkout: { type: 'string', description: 'Check-out date YYYY-MM-DD' },
          type: { type: 'string', enum: ['direct', 'friend', 'blocked', 'owner', 'hold', 'waitlist'], description: 'Booking type' },
          amount: { type: 'number', description: 'Total amount in THB (0 if unknown)' },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['guest', 'room', 'checkin', 'checkout', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_guest_profile',
      description: 'Save or update a guest profile with passport details. Merges with existing profile if guest already exists (matched by passport number or name).',
      parameters: {
        type: 'object',
        properties: {
          full_name: { type: 'string', description: 'Full name as on passport' },
          nationality: { type: 'string', description: 'Nationality (e.g. "British", "German", "Thai")' },
          passport_number: { type: 'string', description: 'Passport number' },
          date_of_birth: { type: 'string', description: 'Date of birth YYYY-MM-DD' },
          gender: { type: 'string', enum: ['M', 'F'], description: 'Gender as on passport' },
          booking_ids: { type: 'array', items: { type: 'string' }, description: 'Booking IDs to link (optional)' },
        },
        required: ['full_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_guest',
      description: 'Find a guest profile by name, or list all guest profiles if no name given.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Guest name to search for (optional - omit to list all)' },
        },
      },
    },
  },
];

// ─── Helper: get merged bookings with overrides ─────────────────────────────
async function getMergedBookings(): Promise<Booking[]> {
  const [ical, manual] = await Promise.all([fetchAllIcalBookings(), Promise.resolve(readManualBookings())]);
  const overrides = readOverrides();
  return [...ical, ...manual].map(b => {
    const ov = overrides[b.id];
    if (!ov) return b;
    return {
      ...b,
      amount: ov.amount !== undefined ? ov.amount : b.amount,
      guest: ov.guest !== undefined ? ov.guest : b.guest,
      notes: ov.notes !== undefined ? ov.notes : b.notes,
    };
  });
}

// ─── Helper: read pricing.json rates ────────────────────────────────────────
function readRates(): Record<string, { high: number; low: number }> {
  try {
    const p = path.join(process.cwd(), 'data', 'pricing.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { /* fall through */ }
  return DEFAULT_PRICING as Record<string, { high: number; low: number }>;
}

function isLowSeason(dateStr: string): boolean {
  const m = new Date(dateStr + 'T12:00:00').getMonth();
  return m >= 3 && m <= 9; // Apr(3) - Oct(9)
}

// ─── get_monthly_stats: mirrors renderStats() exactly ───────────────────────
async function computeMonthlyStats(monthStr?: string): Promise<Record<string, unknown>> {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number);
    year = y;
    month = m - 1; // convert to 0-indexed
  }

  const numDays = new Date(year, month + 1, 0).getDate();
  const rooms = ['nest', 'master', 'nomad'];
  const totalRoomNights = numDays * rooms.length;

  const allBookings = await getMergedBookings();
  const rates = readRates();

  // ─── Occupancy counting (walk each day) ─────────────────────────────────
  let bookedNights = 0;
  let friendNights = 0;
  let holdNights = 0;
  let waitlistNights = 0;

  for (const room of rooms) {
    for (let d = 1; d <= numDays; d++) {
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      // Find booking on this day for this room
      const bk = allBookings.find(b =>
        (b.room === room || b.room === 'full') &&
        b.checkin <= dStr && b.checkout > dStr
      );
      if (bk) {
        if (bk.type === 'waitlist') { waitlistNights++; continue; }
        if (bk.type === 'blocked') { friendNights++; continue; }
        bookedNights++;
        if (bk.type === 'friend' || bk.type === 'owner') friendNights++;
        if (bk.type === 'hold') holdNights++;
      }
    }
  }

  // ─── Revenue calculation (prorate cross-month bookings) ─────────────────
  const monthStart = new Date(year, month, 1);
  const monthEndDate = new Date(year, month + 1, 0); // last day
  let revenue = 0;
  const revenueByRoom: Record<string, number> = { nest: 0, master: 0, nomad: 0 };
  const bookingSummary: { guest: string; room: string; type: string; nights: number; revenue: number }[] = [];

  const revenueBookings = allBookings.filter(b => {
    if (['friend', 'blocked', 'owner', 'hold', 'waitlist'].includes(b.type)) return false;
    const ci = new Date(b.checkin);
    const co = new Date(b.checkout);
    return ci <= monthEndDate && co > monthStart;
  });

  for (const b of revenueBookings) {
    const ci = new Date(b.checkin);
    const co = new Date(b.checkout);
    const totalNights = Math.round((co.getTime() - ci.getTime()) / 86400000);
    if (totalNights <= 0) continue;

    const overlapStart = ci > monthStart ? ci : monthStart;
    const overlapEnd = co <= new Date(year, month + 1, 1) ? co : new Date(year, month + 1, 1);
    const nightsInMonth = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000);
    if (nightsInMonth <= 0) continue;

    const roomRates = rates[b.room] || { high: 3200, low: 2240 };
    const fallbackRate = isLowSeason(b.checkin) ? roomRates.low : roomRates.high;
    const totalAmount = b.amount > 0 ? b.amount : totalNights * fallbackRate;
    const avgPerNight = totalAmount / totalNights;
    const monthRevenue = Math.round(avgPerNight * nightsInMonth);

    revenue += monthRevenue;
    if (revenueByRoom[b.room] !== undefined) {
      revenueByRoom[b.room] += monthRevenue;
    }
    bookingSummary.push({
      guest: b.guest,
      room: b.room,
      type: b.type,
      nights: nightsInMonth,
      revenue: monthRevenue,
    });
  }

  const occupancy = Math.round((bookedNights / totalRoomNights) * 100);
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return {
    month: monthName,
    monthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
    totalRoomNights,
    bookedNights,
    availableNights: totalRoomNights - bookedNights,
    occupancyPercent: occupancy,
    friendBlockedNights: friendNights,
    holdNights,
    waitlistNights,
    estimatedRevenue: revenue,
    revenueByRoom,
    bookingSummary,
  };
}

// ─── Tool execution ─────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, any>): Promise<Record<string, unknown>> {
  switch (name) {
    case 'check_availability': {
      try {
        if (args.room === 'all') {
          const all = await getAllAvailability();
          const summary: Record<string, unknown> = {};
          for (const [key, avail] of Object.entries(all)) {
            summary[key] = {
              isAvailableNow: avail.isAvailableNow,
              currentBookingEnd: avail.currentBookingEnd,
              availableWindows: avail.allWindows.slice(0, 5),
            };
          }
          return summary;
        }
        const result = await getNextAvailable(args.room as RoomKey);
        return {
          room: result.room,
          isAvailableNow: result.isAvailableNow,
          currentBookingEnd: result.currentBookingEnd,
          availableWindows: result.allWindows.slice(0, 5),
        };
      } catch (err: any) {
        return { error: 'Could not check availability: ' + err.message };
      }
    }

    case 'list_bookings': {
      try {
        let all = await getMergedBookings();
        if (args.from) all = all.filter(b => b.checkout >= args.from);
        if (args.to) all = all.filter(b => b.checkin <= args.to);
        const withConflicts = detectConflicts(all);
        return {
          total: withConflicts.length,
          bookings: withConflicts.map(b => ({
            id: b.id, guest: b.guest, room: b.room, type: b.type,
            checkin: b.checkin, checkout: b.checkout,
            amount: b.amount || 0, notes: b.notes || '',
            conflict: (b as any).conflict || false,
          })),
        };
      } catch (err: any) {
        return { error: 'Could not list bookings: ' + err.message };
      }
    }

    case 'get_monthly_stats': {
      try {
        return await computeMonthlyStats(args.month);
      } catch (err: any) {
        return { error: 'Could not compute stats: ' + err.message };
      }
    }

    case 'calculate_price': {
      try {
        const price = calculatePrice(args.room, args.checkin, args.checkout, args.promo_code);
        return {
          nights: price.nights,
          highSeasonNights: price.highSeasonNights,
          lowSeasonNights: price.lowSeasonNights,
          highRate: price.highRate,
          lowRate: price.lowRate,
          subtotal: price.subtotal,
          discountPercent: price.discountPercent,
          discountReason: price.discountReason,
          discountAmount: price.discount,
          promoCode: price.promoCode,
          promoDiscount: price.promoDiscount,
          total: price.total,
          perNight: price.perNight,
          currency: price.currency,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'lookup_pricing': {
      try {
        const rates = getCurrentRates();
        return {
          note: 'High season = Nov-Mar, Low season = Apr-Oct. Long-stay: 7+ nights = 15% off, 28+ nights = 40% off.',
          rooms: {
            nest: { name: 'The Nest', ...rates['nest'] },
            master: { name: 'The Explorer', ...rates['master'] },
            nomad: { name: 'Nomad Room', ...rates['nomad'] },
          },
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'validate_promo_code': {
      try {
        const result = validatePromoCode(args.code);
        if (!result.valid) return { valid: false, message: 'Code not valid or expired.' };
        return { valid: true, code: result.code, discountPercent: result.discount, note: result.note };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'list_inquiries': {
      try {
        const inquiries = readInquiries();
        return {
          total: inquiries.length,
          byStatus: {
            new: inquiries.filter(i => i.status === 'new').length,
            responded: inquiries.filter(i => i.status === 'responded').length,
            booked: inquiries.filter(i => i.status === 'booked').length,
            archived: inquiries.filter(i => i.status === 'archived').length,
          },
          inquiries: inquiries.slice(0, 20).map(i => ({
            id: i.id, guest: i.guest, room: i.room,
            checkin: i.checkin, checkout: i.checkout, nights: i.nights,
            amount: i.amount, status: i.status,
            whatsapp: i.whatsapp, createdAt: i.createdAt,
          })),
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'get_monitors': {
      try {
        const monitors = readMonitors();
        const rentals = getActiveRentals();
        return {
          monitors: monitors.map(m => ({
            id: m.id, name: m.name, status: m.status, dailyRate: m.dailyRate,
          })),
          activeRentals: rentals.map(r => ({
            id: r.id, monitorId: r.monitorId, renter: r.renter,
            status: r.status, startDate: r.startDate,
            deliveryDate: r.deliveryDate, endDate: r.endDate,
            dailyRate: r.dailyRate, depositHeld: r.depositHeld,
          })),
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'get_monitor_revenue': {
      try {
        return getMonthlyRevenueSummary();
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'create_booking': {
      try {
        const bookings = readManualBookings();
        const newBooking = {
          id: `manual-${Date.now()}`,
          guest: args.guest || 'Guest',
          type: args.type || 'direct',
          room: args.room,
          checkin: args.checkin,
          checkout: args.checkout,
          amount: parseFloat(args.amount) || 0,
          notes: args.notes || '',
        };
        bookings.push(newBooking);
        writeManualBookings(bookings);
        return { success: true, booking: newBooking, message: `Booking created for ${newBooking.guest} in ${newBooking.room} (${newBooking.checkin} to ${newBooking.checkout})` };
      } catch (err: any) {
        return { error: 'Could not create booking: ' + err.message };
      }
    }

    case 'save_guest_profile': {
      try {
        const profile = saveGuestProfile({
          fullName: args.full_name,
          nationality: args.nationality,
          passportNumber: args.passport_number,
          dateOfBirth: args.date_of_birth,
          gender: args.gender,
          bookingIds: args.booking_ids || [],
        });
        return { success: true, guest: profile, message: `Guest profile saved for ${profile.fullName}` };
      } catch (err: any) {
        return { error: 'Could not save guest profile: ' + err.message };
      }
    }

    case 'find_guest': {
      try {
        if (args.name) {
          const guest = findGuestByName(args.name);
          if (guest) return { found: true, guest };
          return { found: false, message: `No guest found matching "${args.name}"` };
        }
        // List all guests
        const guests = readGuests();
        return { total: guests.length, guests: guests.slice(0, 20).map(g => ({ id: g.id, fullName: g.fullName, nationality: g.nationality, passportNumber: g.passportNumber, bookingIds: g.bookingIds })) };
      } catch (err: any) {
        return { error: 'Could not search guests: ' + err.message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export const POST: APIRoute = async ({ request }) => {
  let openai: OpenAI;
  try {
    openai = getOpenAIClient();
  } catch {
    return new Response(JSON.stringify({ error: 'AI not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Messages required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if any message has image content (triggers gpt-4o for vision)
  let hasImages = false;
  const aiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: getSystemPrompt() },
    ...messages.map((m: any) => {
      if (Array.isArray(m.content)) {
        // Multi-part message (text + images)
        hasImages = true;
        return { role: m.role, content: m.content };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let maxLoops = 5;

        while (maxLoops-- > 0) {
          const response = await openai.chat.completions.create({
            model: hasImages ? 'gpt-4o' : 'gpt-4o-mini',
            max_tokens: 2048,
            tools: TOOLS,
            messages: aiMessages,
            stream: true,
          });

          let assistantContent = '';
          let toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
          let finishReason = '';

          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;
            finishReason = chunk.choices[0]?.finish_reason || finishReason;

            if (delta?.content) {
              assistantContent += delta.content;
              send({ type: 'delta', content: delta.content });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCalls.has(idx)) {
                  toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' });
                }
                const existing = toolCalls.get(idx)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) existing.args += tc.function.arguments;
              }
            }
          }

          if (finishReason === 'tool_calls' && toolCalls.size > 0) {
            const toolCallsArray = Array.from(toolCalls.values()).map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.args },
            }));

            aiMessages.push({
              role: 'assistant',
              content: assistantContent || null,
              tool_calls: toolCallsArray,
            });

            for (const tc of toolCallsArray) {
              const args = JSON.parse(tc.function.arguments);
              send({ type: 'tool', name: tc.function.name });
              console.log(`[chat] tool: ${tc.function.name}`, JSON.stringify(args));
              const result = await executeTool(tc.function.name, args);
              aiMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
            }
            continue;
          }

          break;
        }

        send({ type: 'done' });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err: any) {
        console.error('[chat] AI error:', err.message);
        send({ type: 'error', content: 'Something went wrong. Please try again.' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};

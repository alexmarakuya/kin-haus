import type { APIRoute } from 'astro';
import OpenAI from 'openai';
import { getOpenAIClient } from '../../lib/ai/client.ts';
import { getNextAvailable, getAllAvailability } from '../../lib/availability.ts';
import { calculatePrice, getCurrentRates, validatePromoCode } from '../../lib/ai/pricing-calculator.ts';
import { readManualBookings, writeManualBookings, readOverrides } from '../../lib/bookings.ts';
import { readInquiries, writeInquiries } from '../../lib/inquiries.ts';
import { readTasks, createTask } from '../../lib/housekeeping.ts';
import { fetchAllIcalBookings } from '../../lib/ical.ts';
import { detectConflicts } from '../../lib/conflicts.ts';
import { readMonitors, getActiveRentals, getMonthlyRevenueSummary } from '../../lib/monitor-rentals.ts';
import { readGuests, saveGuestProfile, findGuestByName } from '../../lib/guests.ts';
import { ROOM_SLUGS, DEFAULT_PRICING } from '../../lib/constants.ts';
import type { RoomKey } from '../../lib/config.ts';
import type { Booking } from '../../lib/types.ts';
import fs from 'node:fs';
import path from 'node:path';

// ─── Server-side chat session storage ────────────────────────────────────────
const CHAT_FILE = path.join(process.cwd(), 'data', 'chat-session.json');
const CHAT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

function loadChatSession(): { messages: any[]; updatedAt: string } | null {
  try {
    if (!fs.existsSync(CHAT_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    // Expire after 24h
    if (data.updatedAt && Date.now() - new Date(data.updatedAt).getTime() > CHAT_MAX_AGE) return null;
    return data;
  } catch { return null; }
}

function saveChatSession(messages: any[]): void {
  try {
    const dir = path.dirname(CHAT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHAT_FILE, JSON.stringify({ messages: messages.slice(-30), updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch (err: any) {
    console.error('[chat] save session error:', err.message);
  }
}

// ─── Property snapshot (injected into every system prompt) ───────────────────
async function buildPropertySnapshot(): Promise<string> {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const allBookings = await getMergedBookings();
    const rooms = ['nest', 'master', 'nomad'];
    const labels: Record<string, string> = { nest: 'The Nest', master: 'The Explorer', nomad: 'The Nomad' };
    const skip = (b: Booking) => b.type === 'blocked' || b.type === 'waitlist';

    // Room status
    const roomLines = rooms.map(room => {
      const occupied = allBookings.find(b => (b.room === room || b.room === 'full') && todayStr >= b.checkin && todayStr < b.checkout && !skip(b));
      const departing = allBookings.find(b => (b.room === room || b.room === 'full') && b.checkout === todayStr && !skip(b));
      const arriving = allBookings.find(b => (b.room === room || b.room === 'full') && b.checkin === todayStr && !skip(b));
      let status = 'Empty';
      let guest = '';
      if (arriving && departing) { status = 'TURNOVER'; guest = `${departing.guest || '?'} out, ${arriving.guest || '?'} in`; }
      else if (arriving) { status = 'CHECK-IN'; guest = arriving.guest || '?'; }
      else if (departing) { status = 'CHECK-OUT'; guest = departing.guest || '?'; }
      else if (occupied) { status = 'Occupied'; guest = occupied.guest || '?'; const left = Math.round((new Date(occupied.checkout).getTime() - today.getTime()) / 86400000); guest += ` (${left}d left)`; }
      return `  ${labels[room]}: ${status}${guest ? ' - ' + guest : ''}`;
    }).join('\n');

    // Upcoming check-ins (next 3 days)
    const upcoming: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const dStr = d.toISOString().slice(0, 10);
      const arrivals = allBookings.filter(b => b.checkin === dStr && !skip(b));
      arrivals.forEach(b => upcoming.push(`  ${dStr}: ${b.guest || '?'} -> ${labels[b.room] || b.room}`));
    }

    // Gap nights (next 14 days)
    const gaps: string[] = [];
    for (const room of rooms) {
      const emptyDays: string[] = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const dStr = d.toISOString().slice(0, 10);
        const booked = allBookings.find(b => (b.room === room || b.room === 'full') && dStr >= b.checkin && dStr < b.checkout && !skip(b));
        if (!booked) emptyDays.push(dStr);
      }
      if (emptyDays.length > 0 && emptyDays.length < 14) {
        gaps.push(`  ${labels[room]}: ${emptyDays.length} empty night(s) in next 14 days`);
      }
    }

    // Unanswered inquiries
    const inquiries = readInquiries();
    const newInq = inquiries.filter(i => i.status === 'new');

    // Pending housekeeping
    const hkTasks = readTasks();
    const pendingHk = hkTasks.filter(t => t.date === todayStr && t.status !== 'done');

    let snapshot = `\n--- PROPERTY SNAPSHOT (live) ---\nROOMS TODAY:\n${roomLines}`;
    if (upcoming.length) snapshot += `\nUPCOMING ARRIVALS:\n${upcoming.join('\n')}`;
    if (gaps.length) snapshot += `\nGAP ALERTS:\n${gaps.join('\n')}`;
    if (newInq.length) snapshot += `\nUNANSWERED INQUIRIES: ${newInq.length} new`;
    if (pendingHk.length) snapshot += `\nHOUSEKEEPING TODAY: ${pendingHk.length} pending task(s)`;
    snapshot += '\n---';

    return snapshot;
  } catch (err: any) {
    console.error('[chat] snapshot error:', err.message);
    return '';
  }
}

// Dynamic system prompt with today's date + property snapshot
async function getSystemPrompt(): Promise<string> {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const snapshot = await buildPropertySnapshot();

  return `You are KH, the operations brain behind Kin Haus. Your #1 job is helping Alex and Paulo respond to guests quickly and run the property smoothly. You're a trusted colleague who knows every detail of the business.

TODAY: ${dateStr} (${greeting.toLowerCase()} in Thailand, UTC+7)
WHATSAPP: +66 63 803 4860 (Kin Haus main number)
CHECK-IN: 2pm | CHECK-OUT: 11am | WIFI: "KinHaus" / password on arrival
ADDRESS: 69/10 Moo 4, Thongsala, Koh Phangan, 84280
${snapshot}

YOUR CORE BEHAVIOR:
Always think one step ahead. If they ask about availability, draft the reply. If they create a booking, suggest the confirmation message. Your responses should be actionable -- the operator should be able to copy-paste something you wrote and send it.

PERSONALITY:
- Concise, warm, professional. Get straight to the point.
- Occasionally use a Thai phrase naturally (sabai sabai, mai pen rai).
- Show proactive thinking: flag interesting patterns in the data.
- Match the guest's tone: casual messages get casual replies, formal gets formal.

You have full access to all dashboard data. Use tools to look up live data before answering -- never guess.

ALWAYS DRAFT REPLIES:
This is your most important behavior. Whenever the conversation touches on availability, pricing, guest inquiries, or bookings, ALWAYS end your response with a ready-to-send reply message in a quote block that Alex can copy-paste to WhatsApp. Do this automatically -- don't wait to be asked.

Include these details in replies when relevant:
- Check-in from 2pm, check-out by 11am
- Direct booking = bank transfer, best rate vs Airbnb
- WhatsApp: +66 63 803 4860
- Always show per-night rate AND total

Reply patterns to follow:

**Available room inquiry:**
> Hi [name]! Thanks for reaching out. [Room] is available from [dates] -- that's [X] nights.
>
> The rate is [amount] THB per night ([total] THB total, ~[EUR] EUR)[mention long-stay discount if applicable].
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
- Returning guests who've stayed before (check guest profiles)

ROOMS:
- The Nest (slug: nest) -- top floor, king bed, ensuite, panoramic views. Premium room.
- The Explorer (slug: master) -- lower floor, king bed, shared bathroom, spacious.
- The Nomad (slug: nomad) -- king bed, shared bathroom, dedicated desk, monitor rental available. Built for remote workers.
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

DAILY BRIEFING:
When the user says "morning", "briefing", "what's happening today", or similar, use get_today_summary to generate a clean daily overview covering: room status, arrivals, departures, housekeeping, inquiries, and gap alerts.

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
  {
    type: 'function',
    function: {
      name: 'update_booking',
      description: 'Update an existing manual booking. Use list_bookings to find the booking ID first.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Booking ID to update' },
          guest: { type: 'string', description: 'New guest name' },
          room: { type: 'string', enum: ['nest', 'master', 'nomad', 'theater', 'full'], description: 'New room' },
          checkin: { type: 'string', description: 'New check-in YYYY-MM-DD' },
          checkout: { type: 'string', description: 'New check-out YYYY-MM-DD' },
          type: { type: 'string', enum: ['direct', 'friend', 'blocked', 'owner', 'hold', 'waitlist'], description: 'New type' },
          amount: { type: 'number', description: 'New amount in THB' },
          notes: { type: 'string', description: 'New notes' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_booking',
      description: 'Delete a manual booking by ID. Cannot delete Airbnb bookings.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Booking ID to delete' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_inquiry',
      description: 'Update the status of a booking inquiry.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Inquiry ID' },
          status: { type: 'string', enum: ['new', 'responded', 'booked', 'archived'], description: 'New status' },
        },
        required: ['id', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_housekeeping_task',
      description: 'Create a housekeeping or maintenance task for a specific date and room.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Task date YYYY-MM-DD' },
          room: { type: 'string', enum: ['nest', 'master', 'nomad'], description: 'Room slug' },
          type: { type: 'string', enum: ['cleaning', 'maintenance', 'laundry', 'inspection', 'other'], description: 'Task type' },
          title: { type: 'string', description: 'Task description' },
        },
        required: ['date', 'room', 'type', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_summary',
      description: 'Get a comprehensive daily briefing: room status, arrivals, departures, housekeeping, inquiries, gap alerts, revenue. Use when user asks for morning briefing or daily overview.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_revenue_insights',
      description: 'Get revenue analytics: ADR, RevPAR, occupancy trends, direct vs Airbnb split, gap-night cost estimates. Use for revenue questions or optimization suggestions.',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: 'Number of months to analyze (default 3)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_gap_nights',
      description: 'Find empty nights per room in the next N days with fill suggestions and estimated lost revenue.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look ahead (default 14)' },
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
            nomad: { name: 'The Nomad', ...rates['nomad'] },
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

    case 'update_booking': {
      try {
        const bookings = readManualBookings();
        const idx = bookings.findIndex(b => b.id === args.id);
        if (idx === -1) return { error: 'Booking not found or is an Airbnb booking (cannot edit)' };
        const old = bookings[idx];
        if (args.guest !== undefined) bookings[idx].guest = args.guest;
        if (args.room !== undefined) bookings[idx].room = args.room;
        if (args.checkin !== undefined) bookings[idx].checkin = args.checkin;
        if (args.checkout !== undefined) bookings[idx].checkout = args.checkout;
        if (args.type !== undefined) bookings[idx].type = args.type;
        if (args.amount !== undefined) bookings[idx].amount = parseFloat(args.amount) || 0;
        if (args.notes !== undefined) bookings[idx].notes = args.notes;
        writeManualBookings(bookings);
        return { success: true, booking: bookings[idx], message: `Booking updated for ${bookings[idx].guest}` };
      } catch (err: any) {
        return { error: 'Could not update booking: ' + err.message };
      }
    }

    case 'delete_booking': {
      try {
        const bookings = readManualBookings();
        const idx = bookings.findIndex(b => b.id === args.id);
        if (idx === -1) return { error: 'Booking not found or is an Airbnb booking (cannot delete)' };
        const deleted = bookings.splice(idx, 1)[0];
        writeManualBookings(bookings);
        return { success: true, message: `Deleted booking for ${deleted.guest} (${deleted.room}, ${deleted.checkin} to ${deleted.checkout})` };
      } catch (err: any) {
        return { error: 'Could not delete booking: ' + err.message };
      }
    }

    case 'update_inquiry': {
      try {
        const inquiries = readInquiries();
        const idx = inquiries.findIndex(i => i.id === args.id);
        if (idx === -1) return { error: 'Inquiry not found' };
        inquiries[idx].status = args.status;
        writeInquiries(inquiries);
        return { success: true, message: `Inquiry from ${inquiries[idx].guest} marked as "${args.status}"` };
      } catch (err: any) {
        return { error: 'Could not update inquiry: ' + err.message };
      }
    }

    case 'create_housekeeping_task': {
      try {
        const task = createTask({
          date: args.date,
          room: args.room,
          type: args.type,
          title: args.title,
        });
        return { success: true, task, message: `Housekeeping task created: ${args.title} for ${args.room} on ${args.date}` };
      } catch (err: any) {
        return { error: 'Could not create task: ' + err.message };
      }
    }

    case 'get_today_summary': {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const allBookings = await getMergedBookings();
        const rooms = ['nest', 'master', 'nomad'];
        const labels: Record<string, string> = { nest: 'The Nest', master: 'The Explorer', nomad: 'The Nomad' };
        const skip = (b: Booking) => b.type === 'blocked' || b.type === 'waitlist';

        const roomStatus = rooms.map(room => {
          const occupied = allBookings.find(b => (b.room === room || b.room === 'full') && todayStr >= b.checkin && todayStr < b.checkout && !skip(b));
          const departing = allBookings.find(b => (b.room === room || b.room === 'full') && b.checkout === todayStr && !skip(b));
          const arriving = allBookings.find(b => (b.room === room || b.room === 'full') && b.checkin === todayStr && !skip(b));
          let status = 'empty';
          if (arriving && departing) status = 'turnover';
          else if (arriving) status = 'check-in';
          else if (departing) status = 'check-out';
          else if (occupied) status = 'occupied';
          return { room: labels[room], status, guest: occupied?.guest || arriving?.guest || departing?.guest || null, daysLeft: occupied ? Math.round((new Date(occupied.checkout).getTime() - new Date(todayStr).getTime()) / 86400000) : null };
        });

        const checkingIn = allBookings.filter(b => b.checkin === todayStr && !skip(b));
        const checkingOut = allBookings.filter(b => b.checkout === todayStr && !skip(b));
        const inHouse = allBookings.filter(b => todayStr >= b.checkin && todayStr < b.checkout && !skip(b));

        // Guest TM30 status
        const guests = readGuests();
        const guestTm30 = inHouse.map(b => {
          const g = b.guestId ? guests.find(gg => gg.id === b.guestId) : guests.find(gg => gg.fullName?.toLowerCase() === b.guest?.toLowerCase());
          const hasTm30 = g && g.nationality && g.passportNumber && g.dateOfBirth;
          return { guest: b.guest, room: labels[b.room] || b.room, tm30Ready: !!hasTm30, missing: !hasTm30 ? [!g?.nationality && 'nationality', !g?.passportNumber && 'passport', !g?.dateOfBirth && 'DOB'].filter(Boolean) : [] };
        });

        const hkTasks = readTasks();
        const todayHk = hkTasks.filter(t => t.date === todayStr);
        const inquiries = readInquiries();
        const newInq = inquiries.filter(i => i.status === 'new');

        // Monthly revenue so far
        const stats = await computeMonthlyStats();

        return {
          date: todayStr,
          rooms: roomStatus,
          arrivals: checkingIn.map(b => ({ guest: b.guest, room: labels[b.room] || b.room, nights: Math.round((new Date(b.checkout).getTime() - new Date(b.checkin).getTime()) / 86400000), checkout: b.checkout })),
          departures: checkingOut.map(b => ({ guest: b.guest, room: labels[b.room] || b.room })),
          inHouse: guestTm30,
          housekeeping: { pending: todayHk.filter(t => t.status === 'pending').length, inProgress: todayHk.filter(t => t.status === 'in_progress').length, done: todayHk.filter(t => t.status === 'done').length },
          inquiries: { new: newInq.length, total: inquiries.length },
          monthToDate: { occupancy: stats.occupancyPercent + '%', revenue: stats.estimatedRevenue + ' THB' },
        };
      } catch (err: any) {
        return { error: 'Could not generate summary: ' + err.message };
      }
    }

    case 'get_revenue_insights': {
      try {
        const monthsBack = args.months || 3;
        const now = new Date();
        const results: any[] = [];

        for (let i = 0; i < monthsBack; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const stats = await computeMonthlyStats(key);
          results.push(stats);
        }

        // Calculate ADR and RevPAR
        const totalRevenue = results.reduce((s, r) => s + (r.estimatedRevenue || 0), 0);
        const totalBookedNights = results.reduce((s, r) => s + (r.bookedNights || 0), 0);
        const totalRoomNights = results.reduce((s, r) => s + (r.totalRoomNights || 0), 0);
        const adr = totalBookedNights > 0 ? Math.round(totalRevenue / totalBookedNights) : 0;
        const revpar = totalRoomNights > 0 ? Math.round(totalRevenue / totalRoomNights) : 0;

        // Direct vs Airbnb split
        const allBookings = await getMergedBookings();
        const recentBookings = allBookings.filter(b => {
          const ci = new Date(b.checkin);
          const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
          return ci >= cutoff && (b.type === 'airbnb' || b.type === 'direct');
        });
        const directCount = recentBookings.filter(b => b.type === 'direct').length;
        const airbnbCount = recentBookings.filter(b => b.type === 'airbnb').length;

        return {
          period: `Last ${monthsBack} months`,
          months: results.map(r => ({ month: r.month, occupancy: r.occupancyPercent + '%', revenue: r.estimatedRevenue })),
          averageDailyRate: adr,
          revPAR: revpar,
          channelSplit: { direct: directCount, airbnb: airbnbCount, directPercent: recentBookings.length > 0 ? Math.round(directCount / recentBookings.length * 100) : 0 },
          recommendation: adr > 0 ? `ADR is ${adr} THB. RevPAR is ${revpar} THB. ${directCount > airbnbCount ? 'Direct bookings are leading -- great margin.' : 'Most bookings via Airbnb -- consider promoting direct bookings for better margins.'}` : 'Not enough data for recommendations.',
        };
      } catch (err: any) {
        return { error: 'Could not compute insights: ' + err.message };
      }
    }

    case 'get_gap_nights': {
      try {
        const daysAhead = args.days || 14;
        const todayStr = new Date().toISOString().slice(0, 10);
        const allBookings = await getMergedBookings();
        const rooms = ['nest', 'master', 'nomad'];
        const labels: Record<string, string> = { nest: 'The Nest', master: 'The Explorer', nomad: 'The Nomad' };
        const rates = readRates();
        const skip = (b: Booking) => b.type === 'blocked' || b.type === 'waitlist';

        const gapsByRoom: Record<string, { emptyDates: string[]; estimatedLostRevenue: number }> = {};

        for (const room of rooms) {
          const emptyDates: string[] = [];
          const roomRates = rates[room] || { high: 2400, low: 1680 };
          let lostRevenue = 0;
          for (let i = 0; i < daysAhead; i++) {
            const d = new Date(); d.setDate(d.getDate() + i);
            const dStr = d.toISOString().slice(0, 10);
            const booked = allBookings.find(b => (b.room === room || b.room === 'full') && dStr >= b.checkin && dStr < b.checkout && !skip(b));
            if (!booked) {
              emptyDates.push(dStr);
              lostRevenue += isLowSeason(dStr) ? roomRates.low : roomRates.high;
            }
          }
          if (emptyDates.length > 0) {
            gapsByRoom[labels[room]] = { emptyDates, estimatedLostRevenue: lostRevenue };
          }
        }

        const totalLost = Object.values(gapsByRoom).reduce((s, g) => s + g.estimatedLostRevenue, 0);
        const totalEmpty = Object.values(gapsByRoom).reduce((s, g) => s + g.emptyDates.length, 0);

        return {
          lookAhead: `${daysAhead} days from ${todayStr}`,
          gaps: gapsByRoom,
          totalEmptyNights: totalEmpty,
          totalEstimatedLostRevenue: totalLost,
          suggestion: totalEmpty > 5 ? `${totalEmpty} empty nights could generate up to ${totalLost} THB. Consider last-minute deals or reaching out to past guests.` : totalEmpty > 0 ? `Only ${totalEmpty} gap night(s) -- looking good.` : 'Fully booked! No gaps.',
        };
      } catch (err: any) {
        return { error: 'Could not compute gaps: ' + err.message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// DELETE: Clear chat session
export const DELETE: APIRoute = async () => {
  try { if (fs.existsSync(CHAT_FILE)) fs.unlinkSync(CHAT_FILE); } catch { /* ok */ }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

// GET: Load previous chat session
export const GET: APIRoute = async () => {
  const session = loadChatSession();
  return new Response(JSON.stringify({ messages: session?.messages || [], updatedAt: session?.updatedAt || null }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

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
  const systemPrompt = await getSystemPrompt();
  const aiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
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

        // Save chat session server-side (last 30 messages for continuity)
        saveChatSession(messages);

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

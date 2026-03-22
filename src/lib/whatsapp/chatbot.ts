import OpenAI from 'openai';
import { getNextAvailable, getAllAvailability } from '../availability.ts';
import { readInquiries, writeInquiries } from '../inquiries.ts';
import { ROOM_SLUGS } from '../constants.ts';
import { getOpenAIClient } from '../ai/client.ts';
import { calculatePrice, getCurrentRates, validatePromoCode } from '../ai/pricing-calculator.ts';
import type { RoomKey } from '../config.ts';
import type { ConversationState } from './types.ts';

const SYSTEM_PROMPT = `You are the Kin Haus booking assistant on WhatsApp. Kin Haus is a boutique co-living villa in Koh Phangan, Thailand (near Thongsala).

RULES:
- Reply in whatever language the guest writes in
- Be warm, helpful, and concise -- this is WhatsApp, not email
- Keep messages under 500 words
- Use plain text only (no markdown, no HTML, no bullet symbols like *)
- Never share internal data (occupancy stats, revenue, owner info)
- For anything you cannot answer, say you will pass them to Alex
- Do not use em dashes
- Always use the lookup_pricing tool before quoting rates (do not rely on memorised prices)
- Always use the calculate_price tool to give accurate totals for specific dates
- If a guest mentions a promo or discount code, use validate_promo_code first

ROOMS:

1. The Nest (top floor)
King bed, ensuite bathroom, panoramic sunrise/pool/sea views, AC, blackout blinds. Best for couples and privacy seekers.

2. The Explorer (lower floor)
King bed, shared bathroom, full wardrobe, desk, sunrise views, AC. Spacious and comfortable.

3. The Nomad
King bed, shared bathroom, dedicated desk, AC, blackout blinds, 500+ Mbps WiFi, monitor rental available. Built for remote workers.

SEASONS & DISCOUNTS:
High season: November through March. Low season: April through October.
Rates change by season -- always use lookup_pricing or calculate_price instead of guessing.
Long-stay discounts (direct bookings only): 7+ nights = 15% off, 28+ nights = 40% off.
Promo codes may offer additional discounts -- use validate_promo_code to check.

CHECK-IN / CHECK-OUT:
Check-in: 3 PM
Check-out: 12 PM (noon)
Early check-in / late check-out possible depending on availability

SHARED AMENITIES:
Infinity pool, 500+ Mbps fibre WiFi with mesh network and backup connection, shared kitchen (fully equipped), living area and terrace, weekly cleaning included, utilities included

LOCATION:
Near Thongsala, Koh Phangan, Thailand
5 min scooter from Thongsala Pier
10-15 min to Thongsala Walking Street, Pantip Market
15-20 min to Haad Rin, 20 min to Zen Beach
Getting here: fly to Koh Samui (USM), ferry 30 min; or Surat Thani, ferry 2.5 hours
Scooter rentals nearby: 200-300 THB/day

BOOKING PROCESS:
Direct bookings via WhatsApp get better rates (no Airbnb platform fees).
Payment: bank transfer or cash.
Website: kinhaus.space

When a guest wants to book:
1. Use check_availability to verify the dates are free
2. Use calculate_price to get the accurate total (including any promo code the guest mentioned)
3. Share the price breakdown with the guest and confirm they want to proceed
4. Use create_inquiry to log the booking request (the amount will be calculated automatically)
5. Let them know the booking request has been logged and Alex will be in touch to confirm and arrange payment`;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description:
        'Check room availability. Call with a specific room to see its available windows, or call with "all" to check all three rooms.',
      parameters: {
        type: 'object',
        properties: {
          room: {
            type: 'string',
            enum: ['nest', 'master', 'nomad', 'all'],
            description: 'Room to check. Use "all" to check all rooms at once.',
          },
        },
        required: ['room'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_inquiry',
      description: 'Create a booking inquiry when a guest wants to book a room. The amount is calculated automatically from the dates.',
      parameters: {
        type: 'object',
        properties: {
          room: {
            type: 'string',
            enum: ['The Nest', 'The Explorer', 'The Nomad'],
            description: 'Room name',
          },
          checkin: { type: 'string', description: 'Check-in date YYYY-MM-DD' },
          checkout: { type: 'string', description: 'Check-out date YYYY-MM-DD' },
          guest: { type: 'string', description: 'Guest name' },
          message: { type: 'string', description: 'Summary of the conversation or request' },
          promo_code: { type: 'string', description: 'Promo code if the guest provided one' },
        },
        required: ['room', 'checkin', 'checkout', 'guest'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_price',
      description: 'Calculate the total price for a stay including seasonal rates, long-stay discounts, and optional promo code. Always use this before quoting a price.',
      parameters: {
        type: 'object',
        properties: {
          room: {
            type: 'string',
            enum: ['nest', 'master', 'nomad'],
            description: 'Room slug',
          },
          checkin: { type: 'string', description: 'Check-in date YYYY-MM-DD' },
          checkout: { type: 'string', description: 'Check-out date YYYY-MM-DD' },
          promo_code: { type: 'string', description: 'Optional promo code to apply' },
        },
        required: ['room', 'checkin', 'checkout'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_pricing',
      description: 'Get the current nightly rates for all rooms (high and low season). Use this before quoting any rates.',
      parameters: {
        type: 'object',
        properties: {},
      },
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
          code: { type: 'string', description: 'The promo code to validate' },
        },
        required: ['code'],
      },
    },
  },
];

// Conversation history: in-memory, keyed by phone number
const conversations = new Map<string, ConversationState>();
const MAX_HISTORY = 20;
const EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours

function getConversation(phoneNumber: string, userName: string): ConversationState {
  const now = Date.now();
  const existing = conversations.get(phoneNumber);

  if (existing && now - existing.lastActivity < EXPIRY_MS) {
    existing.lastActivity = now;
    return existing;
  }

  const state: ConversationState = { history: [], lastActivity: now, userName };
  conversations.set(phoneNumber, state);
  return state;
}

function trimHistory(state: ConversationState): void {
  while (state.history.length > MAX_HISTORY) {
    state.history.shift();
  }
}

// Periodically clean up expired conversations
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of conversations) {
    if (now - state.lastActivity > EXPIRY_MS) {
      conversations.delete(key);
    }
  }
}, 30 * 60 * 1000); // every 30 min

/**
 * Handle an incoming WhatsApp message and return the AI response.
 */
export async function handleMessage(from: string, text: string, userName: string): Promise<string> {
  let openai: OpenAI;
  try {
    openai = getOpenAIClient();
  } catch {
    console.error('[whatsapp] OPENAI_API_KEY not configured');
    return 'Sorry, I am having trouble right now. Please message Alex directly.';
  }
  const state = getConversation(from, userName);

  // Add user message to history
  state.history.push({ role: 'user', content: text, timestamp: Date.now() });
  trimHistory(state);

  // Build messages for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...state.history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
  ];

  try {
    let response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      tools: TOOLS,
      messages,
    });

    let choice = response.choices[0];

    // Tool call loop: execute tools and continue until we get a final message
    while (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const toolCalls = choice.message.tool_calls;

      // Add assistant message with tool calls to the conversation
      messages.push(choice.message);

      // Execute each tool call and add results
      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`[whatsapp] tool call: ${toolCall.function.name}`, JSON.stringify(args));
        const result = await executeTool(toolCall.function.name, args, from, state.userName);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        tools: TOOLS,
        messages,
      });

      choice = response.choices[0];
    }

    const reply = choice.message.content || 'Sorry, I could not generate a response.';

    // Save assistant response to history
    state.history.push({ role: 'assistant', content: reply, timestamp: Date.now() });
    trimHistory(state);

    return reply;
  } catch (err: any) {
    console.error('[whatsapp] AI error:', err.message);
    return 'Sorry, I am having trouble right now. Please message Alex directly.';
  }
}

async function executeTool(
  name: string,
  input: Record<string, string>,
  phoneNumber: string,
  userName: string
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'check_availability':
      return await executeCheckAvailability(input.room);
    case 'create_inquiry':
      return executeCreateInquiry(input, phoneNumber, userName);
    case 'calculate_price':
      return executeCalculatePrice(input);
    case 'lookup_pricing':
      return executeLookupPricing();
    case 'validate_promo_code':
      return executeValidatePromoCode(input.code);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function executeCheckAvailability(room: string): Promise<Record<string, unknown>> {
  try {
    if (room === 'all') {
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

    const result = await getNextAvailable(room as RoomKey);
    return {
      room: result.room,
      isAvailableNow: result.isAvailableNow,
      currentBookingEnd: result.currentBookingEnd,
      availableWindows: result.allWindows.slice(0, 5),
    };
  } catch (err: any) {
    console.error('[whatsapp] availability check failed:', err.message);
    return { error: 'Could not check availability right now' };
  }
}

function executeCreateInquiry(
  input: Record<string, string>,
  phoneNumber: string,
  userName: string
): Record<string, unknown> {
  try {
    const roomSlug = ROOM_SLUGS[input.room] || input.room;
    const checkin = input.checkin;
    const checkout = input.checkout;
    const nights = Math.round(
      (new Date(checkout + 'T12:00:00').getTime() - new Date(checkin + 'T12:00:00').getTime()) / 86400000
    );

    // Auto-calculate the amount using the pricing calculator
    let amount = 0;
    let promoCode: string | undefined;
    let promoDiscount: number | undefined;
    try {
      const price = calculatePrice(roomSlug, checkin, checkout, input.promo_code);
      amount = price.total;
      if (price.promoCode) {
        promoCode = price.promoCode;
        promoDiscount = price.promoDiscount;
      }
    } catch {
      // Fall back to 0 if pricing calculation fails
      console.warn('[whatsapp] pricing calculation failed for inquiry, using 0');
    }

    const guestName = input.guest || userName || 'WhatsApp Guest';
    const message = input.message || `WhatsApp booking request from ${guestName} (${phoneNumber})`;

    const inquiry: Record<string, unknown> = {
      id: `inq-wa-${Date.now()}`,
      room: input.room,
      roomSlug,
      checkin,
      checkout,
      nights,
      guest: guestName,
      message,
      whatsapp: phoneNumber,
      amount,
      currency: 'thb',
      status: 'new' as const,
      createdAt: new Date().toISOString(),
    };

    if (promoCode) {
      inquiry.promoCode = promoCode;
      inquiry.promoDiscount = promoDiscount;
    }

    const inquiries = readInquiries();
    inquiries.push(inquiry as any);
    writeInquiries(inquiries);

    console.log(`[whatsapp] inquiry created: ${inquiry.id} for ${guestName}, amount: ${amount} THB`);
    return { success: true, inquiryId: inquiry.id, calculatedAmount: amount };
  } catch (err: any) {
    console.error('[whatsapp] create inquiry failed:', err.message);
    return { error: 'Could not create the booking inquiry' };
  }
}

function executeCalculatePrice(input: Record<string, string>): Record<string, unknown> {
  try {
    const price = calculatePrice(input.room, input.checkin, input.checkout, input.promo_code);
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

function executeLookupPricing(): Record<string, unknown> {
  try {
    const rates = getCurrentRates();
    return {
      note: 'High season = Nov-Mar, Low season = Apr-Oct. Long-stay discounts: 7+ nights = 15% off, 28+ nights = 40% off.',
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

function executeValidatePromoCode(code: string): Record<string, unknown> {
  try {
    const result = validatePromoCode(code);
    if (!result.valid) {
      return { valid: false, message: 'This code is not valid or has expired.' };
    }
    return {
      valid: true,
      code: result.code,
      discountPercent: result.discount,
      note: result.note,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

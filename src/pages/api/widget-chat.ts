/**
 * Public chat endpoint for the marketing site widget.
 * Deliberately limited: availability, pricing, and general villa info only.
 * No access to internal booking data, guest info, or accounting.
 */
import type { APIRoute } from "astro";
import OpenAI from "openai";
import { getOpenAIClient } from "../../lib/ai/client.ts";
import { getNextAvailable, getAllAvailability } from "../../lib/availability.ts";
import {
  calculatePrice,
  getCurrentRates,
  validatePromoCode,
} from "../../lib/ai/pricing-calculator.ts";
import { json, jsonError } from "../../lib/api-response.ts";
import type { RoomKey } from "../../lib/config.ts";

// ─── Rate limiting (in-memory, per IP) ──────────────────────────────────────
const RATE_LIMIT = 30; // max messages per IP per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface RateEntry {
  count: number;
  windowStart: number;
}
const rateMap = new Map<string, RateEntry>();

// Periodically clean up stale entries
setInterval(
  () => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [key, entry] of rateMap) {
      if (entry.windowStart < cutoff) rateMap.delete(key);
    }
  },
  15 * 60 * 1000,
);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── System prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the Kin Haus booking assistant on the website. Kin Haus is a boutique co-living villa on Koh Phangan, Thailand (near Thongsala). Think of yourself as a friendly, knowledgeable concierge.

YOUR ROLE:
Help guests understand room availability, pricing, and villa amenities. When they want to book, direct them to the "Check Availability" button on the room page or to WhatsApp.

RULES:
- Reply in whatever language the guest writes in
- Be warm, friendly, and concise
- Plain text only (no markdown, no asterisks, no bullet symbols, no em dashes)
- Under 200 words per reply
- Always use lookup_pricing before quoting any rates (do not guess prices)
- Always use calculate_price to give accurate totals for specific dates
- If a guest mentions a promo code, use validate_promo_code first
- Do not share internal data about other guests, bookings, or business info
- For anything you cannot answer, say you will pass them to Alex

ROOMS:
1. The Nest -- top floor, king bed, ensuite bathroom, panoramic sunrise and sea views, AC, blackout blinds. Best for couples and privacy seekers.
2. The Explorer -- lower floor, king bed, shared bathroom, full wardrobe, desk, sunrise views, AC. Spacious and comfortable.
3. The Nomad -- king bed, shared bathroom, dedicated desk, AC, blackout blinds, 500+ Mbps WiFi, monitor rental available. Built for remote workers.

SHARED AMENITIES:
Infinity pool, 500+ Mbps fibre WiFi with mesh network, shared kitchen (fully equipped), living area and terrace, weekly cleaning included, utilities included.

LOCATION:
Near Thongsala, Koh Phangan, Thailand.
5 min scooter from Thongsala Pier.
Getting here: fly to Koh Samui (USM), ferry 30 min; or Surat Thani, ferry 2.5 hours.

CHECK-IN / CHECK-OUT:
Check-in: 3 PM. Check-out: noon.
Early check-in and late check-out may be possible depending on availability.

BOOKING:
Direct bookings via WhatsApp get the best rate (no Airbnb platform fees).
Payment: bank transfer or cash.
WhatsApp: +66 63 803 4860
Website: kinhaus.space

When a guest wants to book or check availability:
1. Use check_availability to see if their dates are free
2. Use calculate_price to give an accurate total
3. Invite them to use the "Check Availability" button on the room page, or message Alex directly on WhatsApp: +66 63 803 4860`;

// ─── Tools (availability + pricing only -- no internal data access) ──────────
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: 'Check room availability. Use "all" to check all three rooms at once.',
      parameters: {
        type: "object",
        properties: {
          room: {
            type: "string",
            enum: ["nest", "master", "nomad", "all"],
            description: 'Room slug or "all"',
          },
        },
        required: ["room"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_price",
      description:
        "Calculate accurate total price for a stay including seasonal rates, long-stay discounts, and optional promo code.",
      parameters: {
        type: "object",
        properties: {
          room: { type: "string", enum: ["nest", "master", "nomad"], description: "Room slug" },
          checkin: { type: "string", description: "Check-in date YYYY-MM-DD" },
          checkout: { type: "string", description: "Check-out date YYYY-MM-DD" },
          promo_code: { type: "string", description: "Optional promo code" },
        },
        required: ["room", "checkin", "checkout"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_pricing",
      description:
        "Get the current nightly rates for all rooms (high and low season). Always use this before quoting any rates.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_promo_code",
      description: "Check if a promo/discount code is valid and active.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "The promo code to validate" },
        },
        required: ["code"],
      },
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, string>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "check_availability": {
      try {
        if (args.room === "all") {
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
        return { error: "Could not check availability right now" };
      }
    }

    case "calculate_price": {
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

    case "lookup_pricing": {
      try {
        const rates = getCurrentRates();
        return {
          note: "High season = Nov-Mar, Low season = Apr-Oct. Long-stay discounts: 7+ nights = 15% off, 28+ nights = 40% off.",
          rooms: {
            nest: { name: "The Nest", ...rates["nest"] },
            master: { name: "The Explorer", ...rates["master"] },
            nomad: { name: "The Nomad", ...rates["nomad"] },
          },
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case "validate_promo_code": {
      try {
        const result = validatePromoCode(args.code);
        if (!result.valid)
          return { valid: false, message: "This code is not valid or has expired." };
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

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    // Rate limiting
    const ip = clientAddress || request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return jsonError("Too many requests. Please try again later.", 429);
    }

    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Invalid request body", 400);

    const { message, history } = body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return jsonError("message is required", 400);
    }
    if (message.length > 2000) {
      return jsonError("Message too long", 400);
    }

    // Validate and cap history
    const safeHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (Array.isArray(history)) {
      for (const msg of history.slice(-20)) {
        // last 20 messages max
        if (
          msg &&
          (msg.role === "user" || msg.role === "assistant") &&
          typeof msg.content === "string"
        ) {
          safeHistory.push({ role: msg.role, content: msg.content.slice(0, 2000) });
        }
      }
    }

    let openai: OpenAI;
    try {
      openai = getOpenAIClient();
    } catch {
      return jsonError("AI service not available", 503);
    }

    // Build messages for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...safeHistory,
      { role: "user", content: message.trim() },
    ];

    // Tool call loop (max 3 rounds)
    let maxLoops = 3;
    while (maxLoops-- > 0) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 512,
        tools: TOOLS,
        messages,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
        messages.push(choice.message);

        for (const toolCall of choice.message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          console.log(`[widget-chat] tool: ${toolCall.function.name}`, JSON.stringify(args));
          const result = await executeTool(toolCall.function.name, args);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      const reply = choice.message.content?.trim() || "Sorry, I could not generate a response.";
      return json({ reply });
    }

    return json({
      reply:
        "Sorry, I ran into a problem. Please try again or message us on WhatsApp: +66 63 803 4860",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/widget-chat] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

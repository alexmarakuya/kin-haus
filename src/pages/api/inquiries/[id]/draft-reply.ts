import type { APIRoute } from "astro";
import { readInquiries } from "../../../../lib/inquiries.ts";
import { calculatePrice } from "../../../../lib/ai/pricing-calculator.ts";
import { getOpenAIClient } from "../../../../lib/ai/client.ts";
import { getNextAvailable } from "../../../../lib/availability.ts";
import { json, jsonError } from "../../../../lib/api-response.ts";
import type { RoomKey } from "../../../../lib/config.ts";

const SYSTEM_PROMPT = `You are helping Alex, the owner of Kin Haus, draft a short WhatsApp reply to a guest inquiry.

Kin Haus is a boutique co-living villa on Koh Phangan, Thailand (near Thongsala). Three rooms: The Nest (top floor, king bed, ensuite, panoramic views), The Explorer (lower floor, king bed, shared bath, great desk), The Nomad (ground floor, king bed, shared bath, built for remote workers with 500+ Mbps WiFi and monitor rental).

Shared: infinity pool, 500+ Mbps fibre WiFi, fully equipped kitchen, weekly cleaning, utilities included. Check-in 3 PM, check-out noon.

STYLE RULES:
- Write in first person as Alex
- Warm, friendly, and direct -- this is WhatsApp, not email
- Plain text only: no markdown, no asterisks, no bullet symbols, no em dashes, no hashtags
- Under 160 words
- Mention the room, dates, and total price clearly
- Include a simple per-night average if it helps clarity
- End with a clear call to action (e.g. "Just let me know if you'd like to go ahead and I'll send payment details!")
- If the dates are not available, say so warmly and offer to check alternatives`;

export const POST: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    if (!id) return jsonError("Missing inquiry id", 400);

    // Look up the inquiry
    const inquiries = readInquiries();
    const inq = inquiries.find((i) => i.id === id);
    if (!inq) return jsonError("Inquiry not found", 404);

    // Calculate accurate pricing for the stay
    let priceContext = "";
    try {
      const roomSlug =
        inq.roomSlug ||
        (inq.room === "The Nest" ? "nest" : inq.room === "The Explorer" ? "master" : "nomad");
      const price = calculatePrice(roomSlug, inq.checkin, inq.checkout);
      const parts: string[] = [];
      parts.push(`Total: ${price.total.toLocaleString()} THB for ${price.nights} nights`);
      parts.push(`Average: ${price.perNight.toLocaleString()} THB/night`);
      if (price.highSeasonNights > 0 && price.lowSeasonNights > 0) {
        parts.push(
          `(${price.highSeasonNights} high-season nights at ${price.highRate.toLocaleString()} THB, ${price.lowSeasonNights} low-season nights at ${price.lowRate.toLocaleString()} THB)`,
        );
      } else if (price.highSeasonNights > 0) {
        parts.push(`(high season rate: ${price.highRate.toLocaleString()} THB/night)`);
      } else {
        parts.push(`(low season rate: ${price.lowRate.toLocaleString()} THB/night)`);
      }
      if (price.discountReason) {
        parts.push(`Long-stay discount applied: ${price.discountReason}`);
      }
      priceContext = parts.join("\n");
    } catch {
      priceContext =
        inq.amount > 0
          ? `Amount on file: ${inq.amount.toLocaleString()} THB`
          : "Pricing unavailable";
    }

    // Check current availability for the room
    let availContext = "";
    try {
      const roomSlug = (inq.roomSlug || "nest") as RoomKey;
      const avail = await getNextAvailable(roomSlug);
      if (avail.isAvailableNow) {
        availContext = "The room is currently available for those dates.";
      } else {
        const nextWindow = avail.allWindows[0];
        if (nextWindow) {
          availContext = `Room is booked through ${avail.currentBookingEnd || "unknown"}. Next available: ${nextWindow.start} to ${nextWindow.end || "open"}.`;
        } else {
          availContext = "Room availability is unclear -- confirm manually.";
        }
      }
    } catch {
      availContext = "Could not check live availability -- confirm manually before sending.";
    }

    // Build the user context message for the LLM
    const guestName = inq.guest || "the guest";
    const userContext = `Guest inquiry details:
- Guest: ${guestName}
- Room: ${inq.room}
- Check-in: ${inq.checkin}
- Check-out: ${inq.checkout}
- Nights: ${inq.nights}
- Original message: "${inq.message || "(no message)"}"
- WhatsApp: ${inq.whatsapp || "(unknown)"}

Pricing (use these exact figures -- do not guess or change them):
${priceContext}

Availability:
${availContext}

Write a warm WhatsApp reply from Alex confirming the inquiry and quoting the price. If unavailable, let them know warmly.`;

    // Call gpt-4o-mini for the draft
    let openai;
    try {
      openai = getOpenAIClient();
    } catch {
      return jsonError("AI service not configured (OPENAI_API_KEY missing)", 503);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContext },
      ],
    });

    const draft = response.choices[0]?.message?.content?.trim() || "";
    if (!draft) return jsonError("AI returned an empty response", 502);

    console.log(`[api/inquiries/draft-reply] generated draft for inquiry ${id} (${inq.guest})`);
    return json({ draft });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/inquiries/draft-reply] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

import type { APIRoute } from "astro";
import { findPortalByToken, markStepComplete } from "../../../../lib/guest-portals.ts";
import { readDietary, writeDietary } from "../../../../lib/dietary.ts";
import { saveUpsell, findUpsellByPortal } from "../../../../lib/guest-upsells.ts";
import type { SpiceTolerance } from "../../../../lib/types.ts";
import { json, jsonError } from "../../../../lib/api-response.ts";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      token,
      dietaryStyles,
      allergies,
      intolerances,
      spiceTolerance,
      favouriteCuisines,
      dietaryNotes,
      wantChef,
      chefPeople,
    } = body;

    if (!token) return jsonError("token is required");
    const portal = findPortalByToken(token);
    if (!portal) return jsonError("Portal not found", 404);

    // Save dietary requirements
    const dietaryEntry = {
      id: `diet-${Date.now()}`,
      guestId: portal.guestId,
      guestName: portal.guestName,
      arrivalDate: portal.checkin,
      dietaryStyles: Array.isArray(dietaryStyles) ? dietaryStyles : [],
      allergies: Array.isArray(allergies) ? allergies : [],
      intolerances: Array.isArray(intolerances) ? intolerances : [],
      spiceTolerance: (spiceTolerance || "Medium") as SpiceTolerance,
      favouriteCuisines: Array.isArray(favouriteCuisines) ? favouriteCuisines : [],
      notes: dietaryNotes || "",
      submittedAt: new Date().toISOString(),
    };

    const dietaryEntries = readDietary();
    dietaryEntries.push(dietaryEntry);
    writeDietary(dietaryEntries);

    // Save chef upsell preference
    const existingUpsell = findUpsellByPortal(portal.id);
    const people = parseInt(chefPeople) || 1;
    saveUpsell({
      portalId: portal.id,
      bookingId: portal.bookingId,
      guestName: portal.guestName,
      privateChef: {
        interested: !!wantChef,
        people: wantChef ? people : 0,
        pricePerPerson: 1000,
        dietaryId: dietaryEntry.id,
      },
      monitorRental: existingUpsell?.monitorRental || { interested: false },
      scooterRental: existingUpsell?.scooterRental || { interested: false, dailyRate: 300 },
    });

    markStepComplete(token, "dietary");

    console.log(
      `[guest-portal] dietary submitted for ${portal.guestName} (chef: ${wantChef ? "yes" : "no"})`,
    );
    return json({ success: true, dietaryId: dietaryEntry.id });
  } catch (err: any) {
    console.error("[api] guest-portal/step/dietary error:", err);
    return jsonError("Failed to save dietary preferences", 500, err.message);
  }
};

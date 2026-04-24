import type { APIRoute } from "astro";
import { readDietary, writeDietary } from "../../lib/dietary.ts";
import { findGuestByName } from "../../lib/guests.ts";
import { json, jsonError } from "../../lib/api-response.ts";
import type { SpiceTolerance } from "../../lib/types.ts";

const VALID_SPICE: SpiceTolerance[] = ["None", "Mild", "Medium", "Hot", "Extra hot"];

export const GET: APIRoute = async () => {
  try {
    const entries = readDietary();
    entries.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
    return json({ dietary: entries });
  } catch (err: any) {
    console.error("[api] /api/dietary GET error:", err);
    return jsonError("Failed to fetch dietary requirements", 500, err.message);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      guestName,
      arrivalDate,
      dietaryStyles,
      allergies,
      intolerances,
      spiceTolerance,
      favouriteCuisines,
      notes,
    } = body;

    if (!guestName || !guestName.trim()) {
      return jsonError("guestName is required");
    }
    if (!arrivalDate || !/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) {
      return jsonError("arrivalDate is required and must be YYYY-MM-DD");
    }
    if (spiceTolerance && !VALID_SPICE.includes(spiceTolerance)) {
      return jsonError(`spiceTolerance must be one of: ${VALID_SPICE.join(", ")}`);
    }

    const guest = findGuestByName(guestName.trim());

    const entry = {
      id: `diet-${Date.now()}`,
      guestId: guest?.id,
      guestName: guestName.trim(),
      arrivalDate,
      dietaryStyles: Array.isArray(dietaryStyles) ? dietaryStyles : [],
      allergies: Array.isArray(allergies) ? allergies : [],
      intolerances: Array.isArray(intolerances) ? intolerances : [],
      spiceTolerance: (spiceTolerance || "Medium") as SpiceTolerance,
      favouriteCuisines: Array.isArray(favouriteCuisines) ? favouriteCuisines : [],
      notes: notes || "",
      submittedAt: new Date().toISOString(),
    };

    const entries = readDietary();
    entries.push(entry);
    writeDietary(entries);

    console.log(`[dietary] new: ${entry.id} -- ${entry.guestName} (arriving ${entry.arrivalDate})`);
    return json({ success: true, id: entry.id }, 201);
  } catch (err: any) {
    console.error("[api] /api/dietary POST error:", err);
    return jsonError("Failed to save dietary requirements", 500, err.message);
  }
};

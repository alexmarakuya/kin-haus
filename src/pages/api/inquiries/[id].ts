import type { APIRoute } from "astro";
import { readInquiries, writeInquiries } from "../../../lib/inquiries.ts";
import { VALID_INQUIRY_STATUSES } from "../../../lib/constants.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const body = await request.json();
    const { status } = body;

    if (status && !VALID_INQUIRY_STATUSES.includes(status)) {
      return jsonError("status must be new, responded, booked, or archived");
    }

    const inquiries = readInquiries();
    const inquiry = inquiries.find((i) => i.id === id);

    if (!inquiry) {
      return jsonError("Inquiry not found", 404);
    }

    if (status) inquiry.status = status;

    writeInquiries(inquiries);

    console.log(`[inquiries] updated: ${id} -- status=${status}`);
    return json({ updated: true, inquiry });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/inquiries/:id] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const inquiries = readInquiries();
    const index = inquiries.findIndex((i) => i.id === id);

    if (index === -1) {
      return jsonError("Inquiry not found", 404);
    }

    const removed = inquiries.splice(index, 1)[0];
    writeInquiries(inquiries);

    console.log(`[inquiries] deleted: ${id}`);
    return json({ deleted: true, inquiry: removed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/inquiries/:id] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

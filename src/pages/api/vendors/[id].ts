import type { APIRoute } from "astro";
import { readVendors, updateVendor, deleteVendor } from "../../../lib/vendors.ts";
import type { VendorType, VendorPaymentMethod } from "../../../lib/types.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

const VALID_TYPES: VendorType[] = ["staff", "utility", "supplier", "contractor"];
const VALID_PAYMENT_METHODS: VendorPaymentMethod[] = ["bank_transfer", "cash", "promptpay"];

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return jsonError("Missing id", 404);

    const vendors = readVendors();
    if (!vendors.find((v) => v.id === id)) return jsonError("Vendor not found", 404);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body");
    }

    const updates: Parameters<typeof updateVendor>[1] = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim())
        return jsonError("name must be a non-empty string");
      updates.name = body.name.trim();
    }
    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type as VendorType))
        return jsonError(`type must be one of: ${VALID_TYPES.join(", ")}`);
      updates.type = body.type as VendorType;
    }
    if (body.role !== undefined)
      updates.role = typeof body.role === "string" ? body.role.trim() : undefined;
    if (body.phone !== undefined)
      updates.phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
    if (body.paymentMethod !== undefined) {
      if (
        body.paymentMethod !== null &&
        !VALID_PAYMENT_METHODS.includes(body.paymentMethod as VendorPaymentMethod)
      )
        return jsonError(`paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`);
      updates.paymentMethod =
        body.paymentMethod === null ? undefined : (body.paymentMethod as VendorPaymentMethod);
    }
    if (body.bankAccount !== undefined)
      updates.bankAccount =
        typeof body.bankAccount === "string" ? body.bankAccount.trim() : undefined;
    if (body.defaultAmount !== undefined) {
      updates.defaultAmount =
        body.defaultAmount === null
          ? undefined
          : typeof body.defaultAmount === "number" && body.defaultAmount >= 0
            ? body.defaultAmount
            : undefined;
    }
    if (body.currency !== undefined)
      updates.currency = typeof body.currency === "string" ? body.currency : "THB";
    if (body.notes !== undefined)
      updates.notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
    if (body.active !== undefined) updates.active = Boolean(body.active);

    const vendor = updateVendor(id, updates);
    if (!vendor) return jsonError("Vendor not found", 404);
    return json({ vendor });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/vendors/[id]] PATCH error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return jsonError("Missing id", 404);
    const ok = deleteVendor(id);
    if (!ok) return jsonError("Vendor not found", 404);
    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/vendors/[id]] DELETE error:", msg);
    return jsonError("Internal server error", 500);
  }
};

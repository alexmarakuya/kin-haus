import type { APIRoute } from "astro";
import { readVendors, createVendor } from "../../../lib/vendors.ts";
import type { VendorType, VendorPaymentMethod } from "../../../lib/types.ts";
import { json, jsonError } from "../../../lib/api-response.ts";
import { validate, required, isString } from "../../../lib/validate.ts";

const VALID_TYPES: VendorType[] = ["staff", "utility", "supplier", "contractor"];
const VALID_PAYMENT_METHODS: VendorPaymentMethod[] = ["bank_transfer", "cash", "promptpay"];

export const GET: APIRoute = async ({ url }) => {
  try {
    const all = url.searchParams.get("all") === "true";
    const vendors = readVendors();
    return json({ vendors: all ? vendors : vendors.filter((v) => v.active) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/vendors] GET error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body");
    }

    const err = validate(body, {
      name: [required, isString],
      type: [required],
    });
    if (err) return jsonError(err);

    if (!VALID_TYPES.includes(body.type as VendorType)) {
      return jsonError(`type must be one of: ${VALID_TYPES.join(", ")}`);
    }

    if (
      body.paymentMethod !== undefined &&
      body.paymentMethod !== null &&
      !VALID_PAYMENT_METHODS.includes(body.paymentMethod as VendorPaymentMethod)
    ) {
      return jsonError(`paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`);
    }

    if (
      body.defaultAmount !== undefined &&
      (typeof body.defaultAmount !== "number" || body.defaultAmount < 0)
    ) {
      return jsonError("defaultAmount must be a non-negative number");
    }

    const vendor = createVendor({
      name: (body.name as string).trim(),
      type: body.type as VendorType,
      role: typeof body.role === "string" ? body.role.trim() : undefined,
      phone: typeof body.phone === "string" ? body.phone.trim() : undefined,
      paymentMethod:
        typeof body.paymentMethod === "string"
          ? (body.paymentMethod as VendorPaymentMethod)
          : undefined,
      bankAccount: typeof body.bankAccount === "string" ? body.bankAccount.trim() : undefined,
      defaultAmount: typeof body.defaultAmount === "number" ? body.defaultAmount : undefined,
      currency: typeof body.currency === "string" ? body.currency : "THB",
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
      active: body.active !== false,
    });

    return json({ vendor }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/vendors] POST error:", msg);
    return jsonError("Internal server error", 500);
  }
};

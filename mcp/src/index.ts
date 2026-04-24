#!/usr/bin/env node

/**
 * Kin Haus MCP Server
 *
 * Exposes the Kin Haus booking platform as MCP tools so Claude can
 * read bookings, check availability, manage inquiries, look up pricing,
 * manage expenses / receipts, and more -- all from the conversation.
 *
 * Transport: stdio (standard for Claude Code)
 * Auth: HMAC-SHA256 session token computed from KIN_HAUS_PASSWORD
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client.js";

const server = new McpServer({
  name: "kin-haus",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool: list_bookings
// ---------------------------------------------------------------------------
server.tool(
  "list_bookings",
  "List all bookings (Airbnb + manual) with conflict detection. Optionally filter by date range.",
  {
    from: z.string().optional().describe("Start date filter (YYYY-MM-DD)"),
    to: z.string().optional().describe("End date filter (YYYY-MM-DD)"),
  },
  async ({ from, to }) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    const path = `/api/bookings${qs ? `?${qs}` : ""}`;

    const res = await apiGet(path);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: create_booking
// ---------------------------------------------------------------------------
server.tool(
  "create_booking",
  "Create a manual booking (direct, friend, blocked, owner, hold, or waitlist).",
  {
    guest: z.string().describe("Guest display name"),
    room: z.enum(["nest", "master", "nomad", "theater", "full"]).describe("Room slug"),
    checkin: z.string().describe("Check-in date (YYYY-MM-DD)"),
    checkout: z.string().describe("Check-out date (YYYY-MM-DD)"),
    type: z
      .enum(["direct", "friend", "blocked", "owner", "hold", "waitlist"])
      .default("direct")
      .describe("Booking type"),
    amount: z.number().optional().describe("Total amount in THB"),
    notes: z.string().optional().describe("Optional notes"),
  },
  async ({ guest, room, checkin, checkout, type, amount, notes }) => {
    const body: Record<string, unknown> = { guest, room, checkin, checkout, type };
    if (amount !== undefined) body.amount = amount;
    if (notes) body.notes = notes;

    const res = await apiPost("/api/bookings", body);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: update_booking
// ---------------------------------------------------------------------------
server.tool(
  "update_booking",
  "Update fields on an existing manual booking.",
  {
    id: z.string().describe("Booking ID"),
    guest: z.string().optional().describe("New guest name"),
    room: z
      .enum(["nest", "master", "nomad", "theater", "full"])
      .optional()
      .describe("New room slug"),
    checkin: z.string().optional().describe("New check-in date (YYYY-MM-DD)"),
    checkout: z.string().optional().describe("New check-out date (YYYY-MM-DD)"),
    type: z
      .enum(["direct", "friend", "blocked", "owner", "hold", "waitlist"])
      .optional()
      .describe("New booking type"),
    amount: z.number().optional().describe("New amount in THB"),
    notes: z.string().optional().describe("New notes"),
  },
  async ({ id, ...updates }) => {
    // Filter out undefined values
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) body[key] = value;
    }

    const res = await apiPatch(`/api/bookings/${id}`, body);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: delete_booking
// ---------------------------------------------------------------------------
server.tool(
  "delete_booking",
  "Delete a manual booking by ID. Cannot delete Airbnb bookings.",
  {
    id: z.string().describe("Booking ID to delete"),
  },
  async ({ id }) => {
    const res = await apiDelete(`/api/bookings/${id}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: list_inquiries
// ---------------------------------------------------------------------------
server.tool(
  "list_inquiries",
  "List all booking inquiries (from WhatsApp chatbot and marketing site).",
  {},
  async () => {
    const res = await apiGet("/api/inquiries");
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: update_inquiry
// ---------------------------------------------------------------------------
server.tool(
  "update_inquiry",
  "Update an inquiry status (new, responded, booked, archived).",
  {
    id: z.string().describe("Inquiry ID"),
    status: z.enum(["new", "responded", "booked", "archived"]).describe("New status"),
  },
  async ({ id, status }) => {
    const res = await apiPatch(`/api/inquiries/${id}`, { status });
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: check_availability
// ---------------------------------------------------------------------------
server.tool(
  "check_availability",
  "Check booked dates for a room (public endpoint, no auth needed). Returns date ranges that are already booked.",
  {
    room: z.enum(["nest", "master", "nomad"]).describe("Room slug to check"),
  },
  async ({ room }) => {
    const res = await apiGet(`/api/availability/${room}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_pricing
// ---------------------------------------------------------------------------
server.tool(
  "get_pricing",
  "Get current nightly rates for all rooms (high and low season).",
  {},
  async () => {
    const res = await apiGet("/api/pricing");
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_status
// ---------------------------------------------------------------------------
server.tool(
  "get_status",
  "Get system status: cache age, booking counts, uptime, and server health.",
  {},
  async () => {
    const res = await apiGet("/api/status");
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: refresh_cache
// ---------------------------------------------------------------------------
server.tool(
  "refresh_cache",
  "Force re-fetch of Airbnb iCal feeds. Use when bookings seem stale.",
  {},
  async () => {
    const res = await apiGet("/api/refresh");
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

const expenseCategory = z
  .enum(["supplies", "food", "utilities", "maintenance", "travel", "fees", "other"])
  .describe("Expense category");

const accountingScope = z
  .enum(["business", "personal"])
  .describe("business = Kin Haus P&L; personal = tracked separately");

// ---------------------------------------------------------------------------
// Tool: list_expenses
// ---------------------------------------------------------------------------
server.tool(
  "list_expenses",
  "List operator expenses and receipt metadata (amounts in THB). Optional date range, category, and scope filter.",
  {
    from: z.string().optional().describe("Start date filter (YYYY-MM-DD)"),
    to: z.string().optional().describe("End date filter (YYYY-MM-DD)"),
    category: expenseCategory.optional().describe("Filter by category"),
    scope: accountingScope.optional().describe("Filter by business vs personal"),
  },
  async ({ from, to, category, scope }) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (category) params.set("category", category);
    if (scope) params.set("scope", scope);
    const qs = params.toString();
    const path = `/api/expenses${qs ? `?${qs}` : ""}`;
    const res = await apiGet(path);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_expense
// ---------------------------------------------------------------------------
server.tool(
  "get_expense",
  "Get one expense by ID. Use list_expenses first if the id is unknown.",
  {
    id: z.string().describe("Expense id (e.g. exp-1712...)"),
  },
  async ({ id }) => {
    const res = await apiGet(`/api/expenses/${encodeURIComponent(id)}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: create_expense
// ---------------------------------------------------------------------------
server.tool(
  "create_expense",
  "Create an expense record. Pass image_base64 to attach a receipt photo (raw base64 or data URL). JPEG, PNG, or WebP, max ~6MB. Ideal for syncing mobile receipt screenshots via Claude.",
  {
    date: z.string().describe("Expense date (YYYY-MM-DD)"),
    amount: z.number().describe("Amount in THB"),
    vendor: z.string().describe("Merchant or payee name"),
    category: expenseCategory,
    scope: accountingScope.optional().describe("Default business"),
    notes: z.string().optional().describe("Optional notes"),
    image_base64: z
      .string()
      .optional()
      .describe("Receipt image as base64 or data:image/...;base64,..."),
    image_mime_type: z
      .string()
      .optional()
      .describe("MIME type if raw base64 without data URL (image/jpeg, image/png, image/webp)"),
  },
  async ({ date, amount, vendor, category, scope, notes, image_base64, image_mime_type }) => {
    const body: Record<string, unknown> = {
      date,
      amount,
      vendor,
      category,
      notes: notes ?? "",
      source: "mcp",
    };
    if (scope) body.scope = scope;
    if (image_base64) {
      body.imageBase64 = image_base64;
      if (image_mime_type) body.imageMimeType = image_mime_type;
    }
    const res = await apiPost("/api/expenses", body);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: update_expense
// ---------------------------------------------------------------------------
server.tool(
  "update_expense",
  "Update an expense. Set clear_image true to remove the stored receipt file.",
  {
    id: z.string().describe("Expense id"),
    date: z.string().optional(),
    amount: z.number().optional(),
    vendor: z.string().optional(),
    category: expenseCategory.optional(),
    scope: accountingScope.optional(),
    notes: z.string().optional(),
    clear_image: z.boolean().optional().describe("If true, delete attached receipt image"),
    image_base64: z.string().optional().describe("Replace receipt image (JPEG, PNG, or WebP)"),
    image_mime_type: z.string().optional(),
  },
  async ({ id, clear_image, image_base64, image_mime_type, ...rest }) => {
    const body: Record<string, unknown> = { ...rest };
    if (clear_image === true) body.clearImage = true;
    if (image_base64) {
      body.imageBase64 = image_base64;
      if (image_mime_type) body.imageMimeType = image_mime_type;
    }
    const res = await apiPatch(`/api/expenses/${encodeURIComponent(id)}`, body);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: delete_expense
// ---------------------------------------------------------------------------
server.tool(
  "delete_expense",
  "Delete an expense and its receipt file if present.",
  {
    id: z.string().describe("Expense id"),
  },
  async ({ id }) => {
    const res = await apiDelete(`/api/expenses/${encodeURIComponent(id)}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

const incomeCategory = z
  .enum(["airbnb", "direct_booking", "coworking", "monitor_rental", "transfer", "other"])
  .describe("Income category");

const depositAccount = z
  .enum(["wise", "cash", "business", "personal_other", "other"])
  .describe("Where the money landed (e.g. wise for Airbnb payouts, cash, business bank)");

// ---------------------------------------------------------------------------
// Tool: get_accounting_summary
// ---------------------------------------------------------------------------
server.tool(
  "get_accounting_summary",
  "P&L summary: business income vs business expenses (net), personal totals, and income grouped by deposit account. All amounts THB.",
  {
    from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    to: z.string().optional().describe("End date (YYYY-MM-DD)"),
  },
  async ({ from, to }) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    const res = await apiGet(`/api/accounting/summary${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: list_income
// ---------------------------------------------------------------------------
server.tool(
  "list_income",
  "List income lines (Airbnb to Wise, cash, business account, etc.). Filter by date, category, deposit account, or scope.",
  {
    from: z.string().optional(),
    to: z.string().optional(),
    category: incomeCategory.optional(),
    deposit_account: depositAccount.optional(),
    scope: accountingScope.optional(),
  },
  async ({ from, to, category, deposit_account, scope }) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (category) params.set("category", category);
    if (deposit_account) params.set("depositAccount", deposit_account);
    if (scope) params.set("scope", scope);
    const qs = params.toString();
    const res = await apiGet(`/api/income${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_income
// ---------------------------------------------------------------------------
server.tool(
  "get_income",
  "Get one income record by ID.",
  {
    id: z.string().describe("Income id (e.g. inc-...)"),
  },
  async ({ id }) => {
    const res = await apiGet(`/api/income/${encodeURIComponent(id)}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: create_income
// ---------------------------------------------------------------------------
server.tool(
  "create_income",
  "Record income: amount, where it was deposited (wise, cash, business, etc.), and business vs personal for P&L. Optional image_base64 for screenshots.",
  {
    date: z.string().describe("YYYY-MM-DD"),
    amount: z.number().describe("Amount in THB"),
    description: z.string().describe("Short label e.g. Airbnb payout March"),
    category: incomeCategory,
    deposit_account: depositAccount,
    scope: accountingScope.describe("business counts toward Kin Haus net"),
    notes: z.string().optional(),
    image_base64: z.string().optional(),
    image_mime_type: z.string().optional(),
  },
  async ({
    date,
    amount,
    description,
    category,
    deposit_account,
    scope,
    notes,
    image_base64,
    image_mime_type,
  }) => {
    const body: Record<string, unknown> = {
      date,
      amount,
      description,
      category,
      depositAccount: deposit_account,
      scope,
      notes: notes ?? "",
      source: "mcp",
    };
    if (image_base64) {
      body.imageBase64 = image_base64;
      if (image_mime_type) body.imageMimeType = image_mime_type;
    }
    const res = await apiPost("/api/income", body);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: update_income
// ---------------------------------------------------------------------------
server.tool(
  "update_income",
  "Update an income line. clear_image removes attachment.",
  {
    id: z.string(),
    date: z.string().optional(),
    amount: z.number().optional(),
    description: z.string().optional(),
    category: incomeCategory.optional(),
    deposit_account: depositAccount.optional(),
    scope: accountingScope.optional(),
    notes: z.string().optional(),
    clear_image: z.boolean().optional(),
    image_base64: z.string().optional(),
    image_mime_type: z.string().optional(),
  },
  async ({ id, clear_image, image_base64, image_mime_type, deposit_account, ...rest }) => {
    const body: Record<string, unknown> = { ...rest };
    if (deposit_account !== undefined) body.depositAccount = deposit_account;
    if (clear_image === true) body.clearImage = true;
    if (image_base64) {
      body.imageBase64 = image_base64;
      if (image_mime_type) body.imageMimeType = image_mime_type;
    }
    const res = await apiPatch(`/api/income/${encodeURIComponent(id)}`, body);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: delete_income
// ---------------------------------------------------------------------------
server.tool(
  "delete_income",
  "Delete an income line and attachment if any.",
  {
    id: z.string(),
  },
  async ({ id }) => {
    const res = await apiDelete(`/api/income/${encodeURIComponent(id)}`);
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error ${res.status}: ${JSON.stringify(res.data)}` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Connect via stdio transport
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[kin-haus-mcp] Server running on stdio");
}

main().catch((err) => {
  console.error("[kin-haus-mcp] Fatal error:", err);
  process.exit(1);
});

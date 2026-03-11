#!/usr/bin/env node

/**
 * Kin Haus MCP Server
 *
 * Exposes the Kin Haus booking platform as MCP tools so Claude can
 * read bookings, check availability, manage inquiries, look up pricing,
 * and more -- all from the conversation.
 *
 * Transport: stdio (standard for Claude Code)
 * Auth: HMAC-SHA256 session token computed from KIN_HAUS_PASSWORD
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiGet, apiPost, apiPatch, apiDelete } from './api-client.js';

const server = new McpServer({
  name: 'kin-haus',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Tool: list_bookings
// ---------------------------------------------------------------------------
server.tool(
  'list_bookings',
  'List all bookings (Airbnb + manual) with conflict detection. Optionally filter by date range.',
  {
    from: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
    to: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
  },
  async ({ from, to }) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const path = `/api/bookings${qs ? `?${qs}` : ''}`;

    const res = await apiGet(path);
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: create_booking
// ---------------------------------------------------------------------------
server.tool(
  'create_booking',
  'Create a manual booking (direct, friend, blocked, owner, hold, or waitlist).',
  {
    guest: z.string().describe('Guest display name'),
    room: z
      .enum(['nest', 'master', 'nomad', 'theater', 'full'])
      .describe('Room slug'),
    checkin: z.string().describe('Check-in date (YYYY-MM-DD)'),
    checkout: z.string().describe('Check-out date (YYYY-MM-DD)'),
    type: z
      .enum(['direct', 'friend', 'blocked', 'owner', 'hold', 'waitlist'])
      .default('direct')
      .describe('Booking type'),
    amount: z.number().optional().describe('Total amount in THB'),
    notes: z.string().optional().describe('Optional notes'),
  },
  async ({ guest, room, checkin, checkout, type, amount, notes }) => {
    const body: Record<string, unknown> = { guest, room, checkin, checkout, type };
    if (amount !== undefined) body.amount = amount;
    if (notes) body.notes = notes;

    const res = await apiPost('/api/bookings', body);
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_booking
// ---------------------------------------------------------------------------
server.tool(
  'update_booking',
  'Update fields on an existing manual booking.',
  {
    id: z.string().describe('Booking ID'),
    guest: z.string().optional().describe('New guest name'),
    room: z
      .enum(['nest', 'master', 'nomad', 'theater', 'full'])
      .optional()
      .describe('New room slug'),
    checkin: z.string().optional().describe('New check-in date (YYYY-MM-DD)'),
    checkout: z.string().optional().describe('New check-out date (YYYY-MM-DD)'),
    type: z
      .enum(['direct', 'friend', 'blocked', 'owner', 'hold', 'waitlist'])
      .optional()
      .describe('New booking type'),
    amount: z.number().optional().describe('New amount in THB'),
    notes: z.string().optional().describe('New notes'),
  },
  async ({ id, ...updates }) => {
    // Filter out undefined values
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) body[key] = value;
    }

    const res = await apiPatch(`/api/bookings/${id}`, body);
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: delete_booking
// ---------------------------------------------------------------------------
server.tool(
  'delete_booking',
  'Delete a manual booking by ID. Cannot delete Airbnb bookings.',
  {
    id: z.string().describe('Booking ID to delete'),
  },
  async ({ id }) => {
    const res = await apiDelete(`/api/bookings/${id}`);
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_inquiries
// ---------------------------------------------------------------------------
server.tool(
  'list_inquiries',
  'List all booking inquiries (from WhatsApp chatbot and marketing site).',
  {},
  async () => {
    const res = await apiGet('/api/inquiries');
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_inquiry
// ---------------------------------------------------------------------------
server.tool(
  'update_inquiry',
  'Update an inquiry status (new, responded, booked, archived).',
  {
    id: z.string().describe('Inquiry ID'),
    status: z
      .enum(['new', 'responded', 'booked', 'archived'])
      .describe('New status'),
  },
  async ({ id, status }) => {
    const res = await apiPatch(`/api/inquiries/${id}`, { status });
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: check_availability
// ---------------------------------------------------------------------------
server.tool(
  'check_availability',
  'Check booked dates for a room (public endpoint, no auth needed). Returns date ranges that are already booked.',
  {
    room: z
      .enum(['nest', 'master', 'nomad'])
      .describe('Room slug to check'),
  },
  async ({ room }) => {
    const res = await apiGet(`/api/availability/${room}`);
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_pricing
// ---------------------------------------------------------------------------
server.tool(
  'get_pricing',
  'Get current nightly rates for all rooms (high and low season).',
  {},
  async () => {
    const res = await apiGet('/api/pricing');
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_status
// ---------------------------------------------------------------------------
server.tool(
  'get_status',
  'Get system status: cache age, booking counts, uptime, and server health.',
  {},
  async () => {
    const res = await apiGet('/api/status');
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: refresh_cache
// ---------------------------------------------------------------------------
server.tool(
  'refresh_cache',
  'Force re-fetch of Airbnb iCal feeds. Use when bookings seem stale.',
  {},
  async () => {
    const res = await apiGet('/api/refresh');
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error ${res.status}: ${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Connect via stdio transport
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[kin-haus-mcp] Server running on stdio');
}

main().catch((err) => {
  console.error('[kin-haus-mcp] Fatal error:', err);
  process.exit(1);
});

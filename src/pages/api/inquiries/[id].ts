import type { APIRoute } from 'astro';
import { readInquiries, writeInquiries } from '../../../lib/inquiries.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  const body = await request.json();
  const { status } = body;

  const validStatuses = ['new', 'responded', 'booked', 'archived'];
  if (status && !validStatuses.includes(status)) {
    return new Response(JSON.stringify({ error: 'status must be new, responded, booked, or archived' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const inquiries = readInquiries();
  const inquiry = inquiries.find((i) => i.id === id);

  if (!inquiry) {
    return new Response(JSON.stringify({ error: 'Inquiry not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (status) inquiry.status = status;

  writeInquiries(inquiries);

  console.log(`[inquiries] updated: ${id} -- status=${status}`);
  return new Response(JSON.stringify({ updated: true, inquiry }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;
  const inquiries = readInquiries();
  const index = inquiries.findIndex((i) => i.id === id);

  if (index === -1) {
    return new Response(JSON.stringify({ error: 'Inquiry not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const removed = inquiries.splice(index, 1)[0];
  writeInquiries(inquiries);

  console.log(`[inquiries] deleted: ${id}`);
  return new Response(JSON.stringify({ deleted: true, inquiry: removed }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

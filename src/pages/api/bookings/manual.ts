import type { APIRoute } from 'astro';
import { readManualBookings } from '../../../lib/bookings.ts';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(readManualBookings()), {
    headers: { 'Content-Type': 'application/json' },
  });
};

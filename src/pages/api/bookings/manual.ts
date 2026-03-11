import type { APIRoute } from 'astro';
import { readManualBookings } from '../../../lib/bookings.ts';
import { json } from '../../../lib/api-response.ts';

export const GET: APIRoute = async () => {
  return json(readManualBookings());
};

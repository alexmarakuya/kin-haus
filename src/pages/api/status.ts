import type { APIRoute } from 'astro';
import { getCacheStatus } from '../../lib/cache.ts';
import { readManualBookings } from '../../lib/bookings.ts';

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      cache: getCacheStatus(),
      manualBookings: readManualBookings().length,
      uptime: Math.round(process.uptime()) + 's',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

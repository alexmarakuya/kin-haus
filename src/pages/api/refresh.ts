import type { APIRoute } from 'astro';
import { clearCache } from '../../lib/cache.ts';
import { fetchIcalBookings } from '../../lib/ical.ts';

export const GET: APIRoute = async () => {
  clearCache();

  try {
    const [nest, master, nomad] = await Promise.all([
      fetchIcalBookings('nest', true),
      fetchIcalBookings('master', true),
      fetchIcalBookings('nomad', true),
    ]);

    return new Response(
      JSON.stringify({
        refreshed: true,
        counts: { nest: nest.length, master: master.length, nomad: nomad.length },
        syncedAt: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Refresh failed', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

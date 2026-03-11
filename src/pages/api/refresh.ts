import type { APIRoute } from 'astro';
import { clearCache } from '../../lib/cache.ts';
import { fetchIcalBookings } from '../../lib/ical.ts';
import { json, jsonError } from '../../lib/api-response.ts';

export const GET: APIRoute = async () => {
  clearCache();

  try {
    const [nest, master, nomad] = await Promise.all([
      fetchIcalBookings('nest', true),
      fetchIcalBookings('master', true),
      fetchIcalBookings('nomad', true),
    ]);

    return json({
      refreshed: true,
      counts: { nest: nest.length, master: master.length, nomad: nomad.length },
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return jsonError('Refresh failed', 500, err.message);
  }
};

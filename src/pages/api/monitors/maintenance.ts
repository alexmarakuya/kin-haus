import type { APIRoute } from 'astro';
import { readMonitors, writeMonitors } from '../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { monitorId } = body;

    if (!monitorId) return jsonError('monitorId is required');

    const monitors = readMonitors();
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor) return jsonError('Monitor not found', 404);

    if (monitor.status === 'rented') {
      return jsonError('Cannot toggle maintenance on a rented monitor. Return it first.', 409);
    }

    monitor.status = monitor.status === 'maintenance' ? 'available' : 'maintenance';
    writeMonitors(monitors);

    console.log(`[monitor-rentals] ${monitor.id} → ${monitor.status}`);
    return json(monitor);
  } catch (err: any) {
    console.error('[api] /api/monitors/maintenance POST error:', err);
    return jsonError('Failed to toggle maintenance', 500, err.message);
  }
};

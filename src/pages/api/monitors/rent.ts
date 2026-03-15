import type { APIRoute } from 'astro';
import { readMonitors, writeMonitors, readRentals, writeRentals } from '../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { monitorId, renter, contact, startDate, endDate, dailyRate, depositHeld, notes } = body;

    if (!monitorId || !renter || !contact || !startDate) {
      return jsonError('monitorId, renter, contact, and startDate are required');
    }

    const monitors = readMonitors();
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor) return jsonError('Monitor not found', 404);
    if (monitor.status !== 'available') return jsonError(`Monitor is currently ${monitor.status}`, 409);

    const rental = {
      id: `mr-${Date.now()}`,
      monitorId,
      renter: String(renter).trim(),
      contact: String(contact).trim(),
      startDate,
      endDate: endDate || '',
      dailyRate: dailyRate ?? monitor.dailyRate,
      depositHeld: !!depositHeld,
      revenue: 0,
      status: 'active' as const,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    // Update monitor status
    monitor.status = 'rented';
    writeMonitors(monitors);

    // Add rental
    const rentals = readRentals();
    rentals.push(rental);
    writeRentals(rentals);

    console.log(`[monitor-rentals] rented ${monitorId} to ${rental.renter}`);
    return json(rental, 201);
  } catch (err: any) {
    console.error('[api] /api/monitors/rent POST error:', err);
    return jsonError('Failed to create rental', 500, err.message);
  }
};

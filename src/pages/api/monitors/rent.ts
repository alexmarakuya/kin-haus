import type { APIRoute } from 'astro';
import { readMonitors, writeMonitors, readRentals, writeRentals } from '../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { monitorId, renter, contact, startDate, endDate, dailyRate, depositHeld, notes, deliverNow } = body;

    if (!monitorId || !renter || !contact || !startDate) {
      return jsonError('monitorId, renter, contact, and startDate are required');
    }

    const monitors = readMonitors();
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor) return jsonError('Monitor not found', 404);
    if (monitor.status !== 'available') return jsonError(`Monitor is currently ${monitor.status}`, 409);

    const today = new Date().toISOString().slice(0, 10);
    const rental = {
      id: `mr-${Date.now()}`,
      monitorId,
      renter: String(renter).trim(),
      contact: String(contact).trim(),
      startDate,
      deliveryDate: deliverNow ? today : undefined,
      endDate: endDate || '',
      dailyRate: dailyRate ?? monitor.dailyRate,
      depositHeld: !!depositHeld,
      revenue: 0,
      status: (deliverNow ? 'delivered' : 'booked') as 'booked' | 'delivered',
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    // Only mark monitor as rented if delivering now
    if (deliverNow) {
      monitor.status = 'rented';
      writeMonitors(monitors);
    }

    const rentals = readRentals();
    rentals.push(rental);
    writeRentals(rentals);

    console.log(`[monitor-rentals] ${deliverNow ? 'rented' : 'booked'} ${monitorId} for ${rental.renter}`);
    return json(rental, 201);
  } catch (err: any) {
    console.error('[api] /api/monitors/rent POST error:', err);
    return jsonError('Failed to create rental', 500, err.message);
  }
};

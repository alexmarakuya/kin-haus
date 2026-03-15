import type { APIRoute } from 'astro';
import { readMonitors, writeMonitors, readRentals, writeRentals, calculateRevenue } from '../../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../../lib/api-response.ts';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const rentalId = params.id;
    if (!rentalId) return jsonError('Rental ID is required');

    const body = await request.json();
    const { action } = body;

    if (!action || !['deliver', 'return', 'cancel'].includes(action)) {
      return jsonError('action must be deliver, return, or cancel');
    }

    const rentals = readRentals();
    const rental = rentals.find(r => r.id === rentalId);
    if (!rental) return jsonError('Rental not found', 404);

    const monitors = readMonitors();
    const monitor = monitors.find(m => m.id === rental.monitorId);

    if (action === 'deliver') {
      if (rental.status !== 'booked') return jsonError('Can only deliver a booked rental', 409);
      rental.status = 'delivered';
      rental.deliveryDate = new Date().toISOString().slice(0, 10);
      if (monitor) {
        monitor.status = 'rented';
        writeMonitors(monitors);
      }
      writeRentals(rentals);
      console.log(`[monitor-rentals] delivered ${rental.monitorId} to ${rental.renter}`);
      return json(rental);
    }

    if (action === 'return') {
      if (rental.status !== 'delivered') return jsonError('Can only return a delivered rental', 409);
      rental.status = 'completed';
      rental.completedAt = new Date().toISOString();
      rental.revenue = calculateRevenue(rental);
      writeRentals(rentals);
      if (monitor) {
        monitor.status = 'available';
        writeMonitors(monitors);
      }
      console.log(`[monitor-rentals] returned ${rental.monitorId} from ${rental.renter} — ฿${rental.revenue}`);
      return json(rental);
    }

    if (action === 'cancel') {
      if (rental.status !== 'booked') return jsonError('Can only cancel a booked rental', 409);
      rental.status = 'cancelled';
      rental.completedAt = new Date().toISOString();
      rental.revenue = 0;
      writeRentals(rentals);
      console.log(`[monitor-rentals] cancelled rental for ${rental.renter}`);
      return json(rental);
    }

    return jsonError('Unknown action');
  } catch (err: any) {
    console.error('[api] /api/monitors/advance POST error:', err);
    return jsonError('Failed to advance rental', 500, err.message);
  }
};

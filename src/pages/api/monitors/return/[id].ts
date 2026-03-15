import type { APIRoute } from 'astro';
import { readMonitors, writeMonitors, readRentals, writeRentals, calculateRevenue } from '../../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../../lib/api-response.ts';

export const POST: APIRoute = async ({ params }) => {
  try {
    const rentalId = params.id;
    if (!rentalId) return jsonError('Rental ID is required');

    const rentals = readRentals();
    const rental = rentals.find(r => r.id === rentalId);
    if (!rental) return jsonError('Rental not found', 404);
    if (rental.status !== 'active') return jsonError('Rental is already completed', 409);

    // Complete the rental
    rental.status = 'completed';
    rental.completedAt = new Date().toISOString();
    rental.revenue = calculateRevenue(rental);
    writeRentals(rentals);

    // Set monitor back to available
    const monitors = readMonitors();
    const monitor = monitors.find(m => m.id === rental.monitorId);
    if (monitor) {
      monitor.status = 'available';
      writeMonitors(monitors);
    }

    console.log(`[monitor-rentals] returned ${rental.monitorId} from ${rental.renter} — ฿${rental.revenue}`);
    return json(rental);
  } catch (err: any) {
    console.error('[api] /api/monitors/return POST error:', err);
    return jsonError('Failed to return monitor', 500, err.message);
  }
};

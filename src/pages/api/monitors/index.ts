import type { APIRoute } from 'astro';
import { readMonitors, getActiveRentals, getDaysRented, getDaysRemaining, isOverdue, calculateRevenue } from '../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async () => {
  try {
    const monitors = readMonitors();
    const activeRentals = getActiveRentals();

    const enriched = monitors.map(m => {
      const rental = activeRentals.find(r => r.monitorId === m.id);
      return {
        ...m,
        currentRenter: rental ? rental.renter : null,
        currentRenterContact: rental ? rental.contact : null,
        rentalId: rental ? rental.id : null,
        daysRented: rental ? getDaysRented(rental) : null,
        daysRemaining: rental ? getDaysRemaining(rental) : null,
        revenueAccrued: rental ? calculateRevenue(rental) : null,
        depositHeld: rental ? rental.depositHeld : null,
        overdue: rental ? isOverdue(rental) : false,
        rentalStartDate: rental ? rental.startDate : null,
        rentalEndDate: rental ? rental.endDate : null,
      };
    });

    return json({ monitors: enriched });
  } catch (err: any) {
    console.error('[api] /api/monitors GET error:', err);
    return jsonError('Failed to fetch monitors', 500, err.message);
  }
};

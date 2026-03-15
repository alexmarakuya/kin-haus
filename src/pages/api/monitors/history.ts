import type { APIRoute } from 'astro';
import { getCompletedRentals, readMonitors } from '../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async ({ url }) => {
  try {
    const format = url.searchParams.get('format');
    const rentals = getCompletedRentals();
    const monitors = readMonitors();

    // Sort newest first
    rentals.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

    if (format === 'csv') {
      const monitorName = (id: string) => monitors.find(m => m.id === id)?.name || id;
      const lines = [
        'Monitor,Renter,Contact,Start Date,End Date,Days,Daily Rate (THB),Revenue (THB),Deposit Held,Notes',
        ...rentals.map(r => {
          const days = r.revenue > 0 ? Math.round(r.revenue / r.dailyRate) : 0;
          return [
            `"${monitorName(r.monitorId)}"`,
            `"${r.renter}"`,
            `"${r.contact}"`,
            r.startDate,
            r.completedAt?.slice(0, 10) || '',
            days,
            r.dailyRate,
            r.revenue,
            r.depositHeld ? 'Yes' : 'No',
            `"${(r.notes || '').replace(/"/g, '""')}"`,
          ].join(',');
        }),
      ];

      return new Response(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="monitor-rental-history.csv"',
        },
      });
    }

    return json({ rentals });
  } catch (err: any) {
    console.error('[api] /api/monitors/history GET error:', err);
    return jsonError('Failed to fetch history', 500, err.message);
  }
};

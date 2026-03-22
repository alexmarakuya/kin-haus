import type { APIRoute } from 'astro';
import { findHousekeeperByToken } from '../../../lib/housekeepers.ts';
import { readTasks } from '../../../lib/housekeeping.ts';
import { ROOM_LABELS } from '../../../lib/constants.ts';
import type { HousekeepingTask } from '../../../lib/types.ts';

function escapeIcal(str: string): string {
  return str.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

function formatIcalDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

const TYPE_EMOJI: Record<string, string> = {
  cleaning: '\ud83e\uddf9',
  maintenance: '\ud83d\udd27',
  laundry: '\ud83e\uddf4',
  inspection: '\ud83d\udd0d',
  other: '\ud83d\udccc',
};

const STATUS_PREFIX: Record<string, string> = {
  done: '\u2705 ',
  in_progress: '\u23f3 ',
  pending: '',
};

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('Missing token', { status: 401 });
  }

  const hk = findHousekeeperByToken(token);
  if (!hk) {
    return new Response('Invalid or inactive token', { status: 403 });
  }

  const allTasks = readTasks();

  // Filter tasks for this housekeeper's assigned rooms and available days
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 7); // Include past week for context

  const tasks = allTasks.filter(t => {
    if (!hk.assignedRooms.includes(t.room) && t.room !== 'common') return false;
    const taskDate = new Date(t.date + 'T12:00:00');
    if (taskDate < cutoff) return false;
    const dayOfWeek = taskDate.getDay();
    if (!hk.availableDays.includes(dayOfWeek)) return false;
    return true;
  });

  // Build iCalendar
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kin Haus//Housekeeping//EN',
    `X-WR-CALNAME:${escapeIcal(hk.name)} - Kin Haus Tasks`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-PUBLISHED-TTL:PT30M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
  ];

  for (const task of tasks) {
    const roomName = task.room === 'common' ? 'Common Areas' : (ROOM_LABELS[task.room] || task.room);
    const emoji = TYPE_EMOJI[task.type] || '\ud83d\udccc';
    const prefix = STATUS_PREFIX[task.status] || '';
    const dateFormatted = formatIcalDate(task.date);

    lines.push(
      'BEGIN:VEVENT',
      `UID:hk-${task.id}@kinhaus.space`,
      `DTSTART;VALUE=DATE:${dateFormatted}`,
      `DTEND;VALUE=DATE:${dateFormatted}`,
      `SUMMARY:${prefix}${emoji} ${escapeIcal(task.title)} [${escapeIcal(roomName)}]`,
      `DESCRIPTION:${escapeIcal(`Room: ${roomName}\\nType: ${task.type}\\nStatus: ${task.status.replace('_', ' ')}${task.notes ? '\\nNotes: ' + task.notes : ''}`)}`,
      `CATEGORIES:Housekeeping,${task.type}`,
      `STATUS:${task.status === 'done' ? 'COMPLETED' : 'CONFIRMED'}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${hk.name.replace(/\s+/g, '-').toLowerCase()}-tasks.ics"`,
      'Cache-Control': 'no-cache, max-age=0',
    },
  });
};

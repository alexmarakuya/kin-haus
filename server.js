const express = require('express');
const cors = require('cors');
const ical = require('node-ical');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const ICAL_SOURCES = {
  nest: {
    room: 'nest',
    label: 'The Nest',
    url: 'https://www.airbnb.com/calendar/ical/1511809226602265595.ics?t=6da53756cef94910b25623ecb81e7ac9',
    rate: 5000,
  },
  master: {
    room: 'master',
    label: 'Master Suite',
    url: 'https://www.airbnb.com/calendar/ical/1618003971883950106.ics?t=0435a8bdfd1843b086df6d273cd9de77',
    rate: 3200,
  },
  nomad: {
    room: 'nomad',
    label: 'Nomad Room',
    url: 'https://www.airbnb.com/calendar/ical/1618012678467611754.ics?t=4498a6d4c07b40258da2bc92a284ee36',
    rate: 2400,
  },
};

const BOOKINGS_FILE = path.join(__dirname, 'data', 'bookings.json');
const OVERRIDES_FILE = path.join(__dirname, 'data', 'overrides.json');
const PRICING_FILE = path.join(__dirname, 'data', 'pricing.json');
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── CACHE ───────────────────────────────────────────────────────────────────

const cache = {
  data: {},      // { room: [bookings] }
  fetchedAt: {}, // { room: timestamp }
};

function isCacheValid(room) {
  const t = cache.fetchedAt[room];
  return t && (Date.now() - t) < CACHE_TTL_MS;
}

function clearCache() {
  cache.data = {};
  cache.fetchedAt = {};
  console.log('[cache] cleared');
}

// ─── ICAL PARSING ─────────────────────────────────────────────────────────────

function toDateStr(d) {
  if (!d) return null;
  const date = new Date(d);
  return date.toISOString().split('T')[0];
}

async function fetchIcalBookings(roomKey, forceRefresh = false) {
  if (!forceRefresh && isCacheValid(roomKey)) {
    console.log(`[ical] cache hit: ${roomKey}`);
    return cache.data[roomKey];
  }

  const source = ICAL_SOURCES[roomKey];
  console.log(`[ical] fetching ${roomKey}...`);

  try {
    const events = await ical.async.fromURL(source.url);
    const bookings = [];

    for (const key of Object.keys(events)) {
      const event = events[key];
      if (event.type !== 'VEVENT') continue;

      const summary = event.summary || '';
      const checkin = toDateStr(event.start);
      const checkout = toDateStr(event.end);

      if (!checkin || !checkout) continue;

      // Determine booking type from Airbnb iCal conventions
      const isReserved = summary.toLowerCase().includes('reserved') ||
                         summary.toLowerCase().includes('reservation');
      const isBlock = summary.toLowerCase().includes('not available') ||
                      summary.toLowerCase().includes('blocked') ||
                      summary.toLowerCase().includes('unavailable');

      // Extract reservation code from description
      let resCode = '';
      let guestPhone = '';
      const desc = event.description || '';
      const resMatch = desc.match(/reservations\/details\/([A-Z0-9]+)/);
      const phoneMatch = desc.match(/Phone Number \(Last 4 Digits\): (\d{4})/);
      if (resMatch) resCode = resMatch[1];
      if (phoneMatch) guestPhone = phoneMatch[1];

      bookings.push({
        id: `airbnb-${roomKey}-${crypto.createHash('md5').update(key).digest('hex').slice(0, 8)}`,
        guest: resCode ? `Guest ···${guestPhone}` : (isBlock ? 'Blocked' : 'Airbnb Guest'),
        type: isBlock ? 'blocked' : 'airbnb',
        room: roomKey,
        checkin,
        checkout,
        amount: 0,
        notes: resCode ? `Res: ${resCode}` : (isBlock ? 'Airbnb — Not available' : ''),
        source: 'ical',
      });
    }

    cache.data[roomKey] = bookings;
    cache.fetchedAt[roomKey] = Date.now();
    console.log(`[ical] ${roomKey}: ${bookings.length} events`);
    return bookings;

  } catch (err) {
    console.error(`[ical] error fetching ${roomKey}:`, err.message);
    // Return cached data if available, even if stale
    if (cache.data[roomKey]) {
      console.warn(`[ical] returning stale cache for ${roomKey}`);
      return cache.data[roomKey];
    }
    return [];
  }
}

// ─── MANUAL BOOKINGS ─────────────────────────────────────────────────────────

function readManualBookings() {
  try {
    if (!fs.existsSync(BOOKINGS_FILE)) return [];
    const raw = fs.readFileSync(BOOKINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[bookings] error reading file:', err.message);
    return [];
  }
}

function writeManualBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), 'utf8');
}

// ─── OVERRIDES (for Airbnb bookings) ────────────────────────────────────────

function readOverrides() {
  try {
    if (!fs.existsSync(OVERRIDES_FILE)) return {};
    const raw = fs.readFileSync(OVERRIDES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[overrides] error reading file:', err.message);
    return {};
  }
}

function writeOverrides(overrides) {
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2), 'utf8');
}

function applyOverrides(bookings) {
  const overrides = readOverrides();
  return bookings.map(b => {
    const ov = overrides[b.id];
    if (!ov) return b;
    return { ...b, ...ov };
  });
}

// ─── PRICING ────────────────────────────────────────────────────────────────

const DEFAULT_PRICING = {
  nest:   { high: 5000, low: 3500 },
  master: { high: 3200, low: 2240 },
  nomad:  { high: 2400, low: 1680 },
};

function readPricing() {
  try {
    if (!fs.existsSync(PRICING_FILE)) return { ...DEFAULT_PRICING };
    const raw = fs.readFileSync(PRICING_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Merge with defaults so new rooms always have fallback values
    return { ...DEFAULT_PRICING, ...data };
  } catch (err) {
    console.error('[pricing] error reading file:', err.message);
    return { ...DEFAULT_PRICING };
  }
}

function writePricing(pricing) {
  fs.writeFileSync(PRICING_FILE, JSON.stringify(pricing, null, 2), 'utf8');
}

// ─── CONFLICT DETECTION ──────────────────────────────────────────────────────

function detectConflicts(allBookings) {
  const result = allBookings.map(b => ({ ...b, conflict: false, conflictWith: null }));

  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i];
      const b = result[j];

      // Only check same room (or if either is 'full')
      const sameRoom = a.room === b.room ||
                       a.room === 'full' || b.room === 'full';
      if (!sameRoom) continue;

      // Check date overlap: a.checkin < b.checkout && b.checkin < a.checkout
      if (a.checkin < b.checkout && b.checkin < a.checkout) {
        result[i].conflict = true;
        result[i].conflictWith = b.id;
        result[j].conflict = true;
        result[j].conflictWith = a.id;
      }
    }
  }

  return result;
}

// ─── DATE FILTERING ──────────────────────────────────────────────────────────

function filterByDateRange(bookings, from, to) {
  if (!from && !to) return bookings;
  return bookings.filter(b => {
    if (from && b.checkout < from) return false;
    if (to && b.checkin > to) return false;
    return true;
  });
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// GET /api/bookings — merged iCal + manual, with conflict detection
app.get('/api/bookings', async (req, res) => {
  const { from, to, refresh } = req.query;
  const forceRefresh = refresh === 'true';

  try {
    // Fetch all three iCal feeds in parallel
    const [nestBookings, masterBookings, nomadBookings] = await Promise.all([
      fetchIcalBookings('nest', forceRefresh),
      fetchIcalBookings('master', forceRefresh),
      fetchIcalBookings('nomad', forceRefresh),
    ]);

    const icalBookings = applyOverrides([...nestBookings, ...masterBookings, ...nomadBookings]);
    const manualBookings = readManualBookings().map(b => ({ ...b, source: 'manual' }));
    const allBookings = [...icalBookings, ...manualBookings];

    const filtered = filterByDateRange(allBookings, from, to);
    const withConflicts = detectConflicts(filtered);

    res.json({
      bookings: withConflicts,
      meta: {
        total: withConflicts.length,
        ical: icalBookings.length,
        manual: manualBookings.length,
        conflicts: withConflicts.filter(b => b.conflict).length,
        lastSync: {
          nest: cache.fetchedAt.nest ? new Date(cache.fetchedAt.nest).toISOString() : null,
          master: cache.fetchedAt.master ? new Date(cache.fetchedAt.master).toISOString() : null,
          nomad: cache.fetchedAt.nomad ? new Date(cache.fetchedAt.nomad).toISOString() : null,
        },
      },
    });

  } catch (err) {
    console.error('[api] /api/bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings', detail: err.message });
  }
});

// GET /api/bookings/manual — only manual bookings
app.get('/api/bookings/manual', (req, res) => {
  res.json(readManualBookings());
});

// POST /api/bookings — add a manual booking
app.post('/api/bookings', (req, res) => {
  const { guest, type, room, checkin, checkout, amount, notes } = req.body;

  if (!checkin || !checkout || checkin >= checkout) {
    return res.status(400).json({ error: 'Invalid check-in / check-out dates' });
  }

  if (!['direct', 'friend', 'blocked'].includes(type)) {
    return res.status(400).json({ error: 'type must be direct, friend, or blocked' });
  }

  if (!['nest', 'master', 'nomad', 'full'].includes(room)) {
    return res.status(400).json({ error: 'Invalid room' });
  }

  const bookings = readManualBookings();
  const newBooking = {
    id: `manual-${Date.now()}`,
    guest: guest || 'Guest',
    type,
    room,
    checkin,
    checkout,
    amount: parseFloat(amount) || 0,
    notes: notes || '',
  };

  bookings.push(newBooking);
  writeManualBookings(bookings);

  console.log(`[bookings] added: ${newBooking.id} — ${newBooking.guest} (${room}, ${checkin}–${checkout})`);
  res.status(201).json(newBooking);
});

// DELETE /api/bookings/:id — delete a manual booking
app.delete('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const bookings = readManualBookings();
  const index = bookings.findIndex(b => b.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const removed = bookings.splice(index, 1)[0];
  writeManualBookings(bookings);

  console.log(`[bookings] deleted: ${id}`);
  res.json({ deleted: true, booking: removed });
});

// PATCH /api/bookings/:id — update a booking's guest name, amount, or notes
app.patch('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const updates = {};
  if (req.body.guest !== undefined) updates.guest = req.body.guest;
  if (req.body.amount !== undefined) updates.amount = parseFloat(req.body.amount) || 0;
  if (req.body.notes !== undefined) updates.notes = req.body.notes;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  // Check if it's a manual booking first
  const bookings = readManualBookings();
  const index = bookings.findIndex(b => b.id === id);

  if (index !== -1) {
    // Manual booking — update in bookings.json
    Object.assign(bookings[index], updates);
    writeManualBookings(bookings);
    console.log(`[bookings] updated manual: ${id}`, updates);
    return res.json(bookings[index]);
  }

  // Airbnb booking — store override
  const overrides = readOverrides();
  overrides[id] = { ...(overrides[id] || {}), ...updates };
  writeOverrides(overrides);
  console.log(`[overrides] saved for ${id}:`, updates);
  res.json({ id, ...updates, source: 'override' });
});

// GET /api/pricing — current room rates
app.get('/api/pricing', (req, res) => {
  res.json(readPricing());
});

// PATCH /api/pricing — update room rates (deep merge)
app.patch('/api/pricing', (req, res) => {
  const current = readPricing();
  const updates = req.body;

  for (const room of Object.keys(updates)) {
    if (!current[room]) continue;
    if (typeof updates[room] !== 'object') continue;
    if (updates[room].high !== undefined) current[room].high = Number(updates[room].high) || 0;
    if (updates[room].low !== undefined) current[room].low = Number(updates[room].low) || 0;
  }

  writePricing(current);
  console.log('[pricing] updated:', JSON.stringify(current));
  res.json(current);
});

// GET /api/refresh — force-clear cache and re-fetch
app.get('/api/refresh', async (req, res) => {
  clearCache();

  try {
    const [nest, master, nomad] = await Promise.all([
      fetchIcalBookings('nest', true),
      fetchIcalBookings('master', true),
      fetchIcalBookings('nomad', true),
    ]);

    res.json({
      refreshed: true,
      counts: { nest: nest.length, master: master.length, nomad: nomad.length },
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Refresh failed', detail: err.message });
  }
});

// GET /api/status — cache and system status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    cache: {
      nest: cache.fetchedAt.nest ? { age: Math.round((Date.now() - cache.fetchedAt.nest) / 1000) + 's', events: cache.data.nest?.length || 0 } : 'empty',
      master: cache.fetchedAt.master ? { age: Math.round((Date.now() - cache.fetchedAt.master) / 1000) + 's', events: cache.data.master?.length || 0 } : 'empty',
      nomad: cache.fetchedAt.nomad ? { age: Math.round((Date.now() - cache.fetchedAt.nomad) / 1000) + 's', events: cache.data.nomad?.length || 0 } : 'empty',
    },
    manualBookings: readManualBookings().length,
    uptime: Math.round(process.uptime()) + 's',
  });
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🏠 Kin Haus Occupancy Hub running at http://localhost:${PORT}\n`);
  console.log('   Rooms:  The Nest · Master Suite · Nomad Room');
  console.log('   iCal:   3 live Airbnb feeds');
  console.log('   Cache:  30 min TTL\n');
});

import type { Booking } from './types.ts';
import { CACHE_TTL_MS } from './config.ts';

const cache: {
  data: Record<string, Booking[]>;
  fetchedAt: Record<string, number>;
} = {
  data: {},
  fetchedAt: {},
};

export function isCacheValid(room: string): boolean {
  const t = cache.fetchedAt[room];
  return !!t && Date.now() - t < CACHE_TTL_MS;
}

export function getCachedBookings(room: string): Booking[] | null {
  return cache.data[room] ?? null;
}

export function setCachedBookings(room: string, bookings: Booking[]): void {
  cache.data[room] = bookings;
  cache.fetchedAt[room] = Date.now();
}

export function clearCache(): void {
  cache.data = {};
  cache.fetchedAt = {};
  console.log('[cache] cleared');
}

export function getCacheStatus(): Record<string, { age: string; events: number } | 'empty'> {
  const status: Record<string, { age: string; events: number } | 'empty'> = {};
  for (const room of ['nest', 'master', 'nomad']) {
    if (cache.fetchedAt[room]) {
      status[room] = {
        age: Math.round((Date.now() - cache.fetchedAt[room]) / 1000) + 's',
        events: cache.data[room]?.length || 0,
      };
    } else {
      status[room] = 'empty';
    }
  }
  return status;
}

export function getLastSyncTimes(): Record<string, string | null> {
  return {
    nest: cache.fetchedAt.nest ? new Date(cache.fetchedAt.nest).toISOString() : null,
    master: cache.fetchedAt.master ? new Date(cache.fetchedAt.master).toISOString() : null,
    nomad: cache.fetchedAt.nomad ? new Date(cache.fetchedAt.nomad).toISOString() : null,
  };
}

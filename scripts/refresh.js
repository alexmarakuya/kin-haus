#!/usr/bin/env node
/**
 * Kin Haus — iCal Refresh Script
 * 
 * Hits the local server's /api/refresh endpoint to force-clear the cache
 * and re-fetch all three Airbnb iCal feeds.
 * 
 * Usage:
 *   node scripts/refresh.js
 *   npm run refresh
 */

const PORT = process.env.PORT || 3000;
const url = `http://localhost:${PORT}/api/refresh`;

console.log('🔄 Refreshing Kin Haus iCal feeds...\n');

fetch(url)
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      console.error('❌ Refresh failed:', data.error);
      process.exit(1);
    }
    console.log('✅ Refresh complete\n');
    console.log('   The Nest:     ', data.counts.nest, 'events');
    console.log('   Master Suite: ', data.counts.master, 'events');
    console.log('   Nomad Room:   ', data.counts.nomad, 'events');
    console.log('\n   Synced at:', data.syncedAt);
  })
  .catch(err => {
    console.error('❌ Could not connect to server at', url);
    console.error('   Make sure the server is running: npm start\n');
    console.error('   Error:', err.message);
    process.exit(1);
  });

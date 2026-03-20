import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://kinhaus.space',
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [
    sitemap({
      customPages: [
        'https://kinhaus.space/',
        'https://kinhaus.space/rooms',
        'https://kinhaus.space/rooms/the-nest',
        'https://kinhaus.space/rooms/the-explorer',
        'https://kinhaus.space/rooms/nomad-room',
        'https://kinhaus.space/contact',
        'https://kinhaus.space/location',
        'https://kinhaus.space/events',
        'https://kinhaus.space/blog',
        'https://kinhaus.space/blog/digital-nomad-guide-koh-phangan',
        'https://kinhaus.space/blog/co-living-beats-hotels-remote-workers',
      ],
    }),
  ],
  security: {
    checkOrigin: false,
  },
  server: {
    port: 3000,
  },
});

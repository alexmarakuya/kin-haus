// PM2 ecosystem config for Kin Haus
// Usage:
//   pm2 start ecosystem.config.cjs --only kin-haus          (production)
//   pm2 start ecosystem.config.cjs --only kin-haus-staging  (staging)
//   pm2 reload ecosystem.config.cjs --only kin-haus         (zero-downtime reload)

module.exports = {
  apps: [
    {
      name: 'kin-haus',
      script: 'dist/server/entry.mjs',
      cwd: '/var/www/kin-haus',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        HOST: '0.0.0.0',
        PORT: '3004',
        NODE_ENV: 'production',
      },
      error_file: '/var/log/kin-haus-error.log',
      out_file: '/var/log/kin-haus-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Keep last 7 days of logs, rotate at 10 MB
      rotate_interval: '0 0 * * *',
    },
    {
      name: 'kin-haus-staging',
      script: 'dist/server/entry.mjs',
      cwd: '/var/www/kin-haus-staging',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        HOST: '0.0.0.0',
        PORT: '3002',
        NODE_ENV: 'production',
      },
      error_file: '/var/log/kin-haus-staging-error.log',
      out_file: '/var/log/kin-haus-staging-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};

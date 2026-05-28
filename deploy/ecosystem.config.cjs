const rootDir = process.env.ROOT_DIR || '/opt/dicuciin/dicuciin';
const apiBase = process.env.NUXT_PUBLIC_API_BASE || 'https://api.dicuciin.com/api/v1';

module.exports = {
  apps: [
    {
      name: 'laundry-be',
      cwd: `${rootDir}/laundry-be`,
      script: 'dist/main.js',
      // Gunakan cluster mode dengan 2 instance untuk zero-downtime reload
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      // Graceful shutdown: tunggu request selesai sebelum mematikan proses
      kill_timeout: 5000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        APP_PORT: 3000,
      },
    },
    {
      name: 'laundry-admin',
      cwd: `${rootDir}/laundry-admin`,
      script: '.output/server/index.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        NUXT_PUBLIC_API_BASE: apiBase,
      },
    },
  ],
};

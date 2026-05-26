const rootDir = process.env.ROOT_DIR || '/opt/dicuciin/dicuciin';
const apiBase = process.env.NUXT_PUBLIC_API_BASE || 'https://api.dicuciin.com/api/v1';

module.exports = {
  apps: [
    {
      name: 'laundry-be',
      cwd: `${rootDir}/laundry-be`,
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
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
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        NUXT_PUBLIC_API_BASE: apiBase,
      },
    },
  ],
};

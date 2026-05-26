module.exports = {
  apps: [
    {
      name: 'laundry-be',
      cwd: '/opt/dicuciin/laundry-be',
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
      cwd: '/opt/dicuciin/laundry-admin',
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
        NUXT_PUBLIC_API_BASE: 'https://api.example.com/api/v1',
      },
    },
  ],
};

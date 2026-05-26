export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  sourcemap: {
    client: false,
    server: false,
  },

  devServer: {
    port: 3001,
  },

  modules: ['@nuxt/ui', '@pinia/nuxt', '@vueuse/nuxt'],

  colorMode: {
    preference: 'light',
    fallback: 'light',
    classSuffix: '',
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3000/api/v1',
    },
  },

  routeRules: {
    '/': { redirect: '/dashboard' },
  },
})

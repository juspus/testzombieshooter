import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Bridge Vercel's build-time VERCEL_ENV ('production' | 'preview' | 'development')
  // into client code so debug-only features can check it at runtime.
  define: {
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV || 'development'),
  },
  plugins: [
    react(),
    VitePWA({
      // Auto-install the updated service worker without asking the user
      registerType: 'autoUpdate',

      // Don't generate a new manifest — we already have public/manifest.webmanifest
      // and index.html already links to it.
      manifest: false,

      // Cache everything the build emits plus the panorama texture
      workbox: {
        // Pre-cache all build output (JS chunks, CSS, HTML, images, fonts)
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,webp,svg,ico,woff,woff2,wasm}'],

        // Also pre-cache the big panorama texture that lives in /public
        additionalManifestEntries: [
          { url: '/forest-panorama.png', revision: null },
        ],

        // Runtime caching for anything not covered by the pre-cache list
        runtimeCaching: [
          {
            // Large static assets (textures, models) — serve from cache, refresh in bg
            urlPattern: /\.(?:png|jpg|jpeg|webp|svg|wasm)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            // JS / CSS chunks — cache-first so the game starts instantly offline
            urlPattern: /\.(?:js|css)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'code-chunks',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
            },
          },
        ],

        // Don't block the install step while warming up the runtime cache
        skipWaiting: true,
        clientsClaim: true,
      },

      // Keep the SW inactive in dev so hot-reload works normally
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
})

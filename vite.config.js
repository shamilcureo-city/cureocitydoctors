import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { apiDevPlugin } from './vite-plugin-api.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Expose ALL .env vars (not just VITE_*) to process.env so Vercel-style
  // serverless functions can read GEMINI_API_KEY etc. during `vite dev`.
  // Production reads them from Vercel project env, not from this file.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [
      react(),
      apiDevPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        // Don't precache the giant WorkflowApp chunk — the runtime SW will
        // cache-on-fetch for those. We only precache the shell.
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // Never cache the AI endpoints — they're stateful and budget-gated.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // Static assets — cache-first with ~30d expiry
              urlPattern: ({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination),
              handler: 'CacheFirst',
              options: {
                cacheName: 'cureocity-assets',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // API requests — network only, never cache. Clinical data must
              // be live; stale responses could harm patients.
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
          ],
        },
        manifest: {
          name: 'Cureocity Clinical Assistant',
          short_name: 'Cureocity',
          description: 'AI clinical decision support for Indian primary care doctors. Live ambient consults, KB-grounded differentials, India-specific prescribing.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          background_color: '#ffffff',
          theme_color: '#0a7a6e',
          lang: 'en-IN',
          categories: ['medical', 'health', 'productivity'],
          icons: [
            { src: '/cureocity-icon.svg',          sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
            { src: '/cureocity-icon-maskable.svg', sizes: 'any',     type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        // Disable PWA in dev — service workers + Vite HMR can fight.
        devOptions: { enabled: false },
      }),
    ],
    server: {
      allowedHosts: ['host.docker.internal', 'localhost'],
    },
  };
})

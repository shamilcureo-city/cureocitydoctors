import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
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
    plugins: [react(), apiDevPlugin()],
    server: {
      allowedHosts: ['host.docker.internal', 'localhost'],
    },
  };
})

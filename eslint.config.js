import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // The legacy engine emits HTML-string callbacks (onclick="updateLab(...)")
    // that ESLint can't trace, producing many false-positive unused-var warnings.
    // Slated for replacement in Sprint 2 (Gemini intake).
    files: ['src/engine/cureocityEngine.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    // Node-runtime files: Vite config, dev-only middleware, Vercel serverless
    // functions. These run on Node (Edge or otherwise), not in the browser.
    files: ['vite.config.js', 'vite-plugin-api.js', 'api/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])

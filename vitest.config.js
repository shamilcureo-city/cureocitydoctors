import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: [
      'src/**/__tests__/**/*.test.{js,jsx}',
      'src/**/*.test.{js,jsx}',
      'api/**/__tests__/**/*.test.{js,jsx}',
    ],
    exclude: ['node_modules', 'dist', '.git'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**', 'src/lib/**', 'src/hooks/**'],
      exclude: ['**/__tests__/**', '**/*.test.*'],
    },
  },
});

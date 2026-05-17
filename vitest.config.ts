import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/**/types.ts', 'src/renderer/src/i18n/*.ts']
    }
  }
});

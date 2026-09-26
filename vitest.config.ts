import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'targets/**/*.test.ts'],
    setupFiles: ['src/testing/setup.ts'],
  },
});

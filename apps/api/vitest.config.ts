import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // Route tests share a database; run files serially to keep them isolated.
    fileParallelism: false,
  },
});

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [
      'third_party/**',
      'node_modules/**',
      'out/**',
      'dist/**',
      ...(process.env.VITEST_INCLUDE_LIVE ? [] : ['**/*.live.test.ts'])
    ],
    testTimeout: 15000
  }
})

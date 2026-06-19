import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['third_party/**', 'node_modules/**', 'out/**', 'dist/**']
  }
})

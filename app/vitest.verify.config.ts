import { defineConfig } from 'vitest/config'

// Bounded exhaustive checks under verify/. Not part of `npm test`: each has its own script.
export default defineConfig({
  test: { include: ['verify/**/*.check.mjs'], testTimeout: 30 * 60_000 },
})

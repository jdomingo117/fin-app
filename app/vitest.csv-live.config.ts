import { defineConfig } from 'vitest/config'

// Invoked only by the runner after it verifies its disposable project.
export default defineConfig({
  test: { include: ['src/lib/csv/e2e.test.ts', 'src/lib/csv/gate2Quality.e2e.test.ts'] },
})

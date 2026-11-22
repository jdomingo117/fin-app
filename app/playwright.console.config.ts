import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['console-foundation.spec.ts', 'console-effects.spec.ts', 'console-gate-three.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: './test-results/console',
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:5320',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'Desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'Phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
})

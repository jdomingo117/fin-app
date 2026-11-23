import { defineConfig } from '@playwright/test'

const workflowCapture = Boolean(process.env.CONSOLE_WORKFLOW_CAPTURE_DIR)

export default defineConfig({
  testDir: './e2e',
  testMatch: ['console-foundation.spec.ts', 'console-effects.spec.ts', 'console-gate-three.spec.ts', 'console-phase-three.spec.ts', 'console-analysis-hubs.spec.ts', 'console-workflows.spec.ts'],
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
    video: workflowCapture ? 'on' : 'off',
    launchOptions: workflowCapture ? { slowMo: 290 } : undefined,
  },
  webServer: process.env.CI ? {
    command: 'npm run dev -- --host 127.0.0.1 --port 5320 --strictPort',
    url: 'http://127.0.0.1:5320/dashboard',
    env: { VITE_BUDGET_V1_ENABLED: 'true' },
  } : undefined,
  projects: [
    { name: 'Desktop', use: { viewport: { width: 1440, height: 900 },
      video: workflowCapture ? { mode: 'on', size: { width: 1440, height: 900 } } : 'off' } },
    { name: 'Phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
})

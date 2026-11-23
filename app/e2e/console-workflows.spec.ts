import AxeBuilder from '@axe-core/playwright'
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { auditConsoleChrome } from './fixtures/console-leftovers'
import { dashboard, signInForConsole } from './fixtures/console-review'
import { workflowReplies } from './fixtures/console-workflow-replies'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const routes = [
  { path: 'budget', title: 'Budget' }, { path: 'ledger', title: 'Ledger review' },
  { path: 'ingestion', title: 'Ingestion' }, { path: 'transfers', title: 'Transfers' },
] as const

const traces = new WeakMap<Page, { cdp: CDPSession; output: string; events: unknown[] }>()

test.afterEach(async ({ page }) => {
  const trace = traces.get(page)
  if (!trace) return
  const complete = new Promise(done => trace.cdp.once('Tracing.tracingComplete', done))
  await trace.cdp.send('Tracing.end')
  await complete
  await writeFile(trace.output, gzipSync(JSON.stringify({ traceEvents: trace.events })))
})

async function enter(page: Page, path: string, options?: Parameters<typeof workflowReplies>[0]) {
  const data = workflowReplies(options)
  await signInForConsole(page, true, undefined, data.reply)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  const { project, title } = test.info()
  if (path === 'budget' && title.startsWith('Leftovers') && process.env.CONSOLE_WORKFLOW_CAPTURE_DIR) {
    await expect(page.locator('.console-home')).toBeVisible()
    await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
    if (project.name === 'Desktop') await page.mouse.move(1435, 66)
    await capture(page, 'dashboard')
  }
  const traceDirectory = process.env.CONSOLE_WORKFLOW_TRACE_DIR
  if (traceDirectory && project.name === 'Desktop' && !/^(?:Leftovers|Budget recovers)/.test(title)) {
    await mkdir(traceDirectory, { recursive: true })
    const cdp = await page.context().newCDPSession(page)
    const events: unknown[] = []
    cdp.on('Tracing.dataCollected', chunk => events.push(...chunk.value))
    await cdp.send('Tracing.start', { categories:
      'toplevel,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,cc,viz,gpu' })
    traces.set(page, { cdp, output: resolve(traceDirectory, `console-phase-4b-${path}-chrome.json.gz`), events })
  }
  await page.goto(new URL(path, dashboard).href)
  await expect(page.locator('.console-viewport')).toHaveCount(1)
  await expect(page.locator('.console-workflow-dock')).toHaveAttribute('data-initial-hero', 'compact')
  await expect(page.locator('.console-workflow-hub')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  return data
}

async function capture(page: Page, name: string) {
  const directory = process.env.CONSOLE_WORKFLOW_CAPTURE_DIR
  if (!directory) return
  await page.waitForTimeout(600)
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: resolve(directory, `${page.viewportSize()?.width}-${name}.jpg`), quality: 89 })
}

async function checkAxe(page: Page) {
  await expect(routeLayer(page)).toHaveCSS('opacity', '1')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach('axe', { body: JSON.stringify(results.violations), contentType: 'application/json' })
  expect.soft(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
}

const routeLayer = (page: Page) => page.locator('.console-route-layer:not([inert])')

for (const route of routes) test(`Leftovers audit · ${route.path}`, async ({ page }) => {
  await enter(page, route.path)
  await expect(routeLayer(page).getByRole('heading', { name: route.title, exact: true }).first()).toBeVisible()
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
  if (route.path === 'budget') await expect(page.locator('[data-budget-value="hero-remaining"] [data-budget-amount]')).toHaveText('$577.80')
  if (route.path === 'ledger') await expect(page.getByRole('button', { name: /Market grocer/ }).first()).toBeVisible()
  if (route.path === 'ingestion') await expect(page.getByLabel('Import into')).toBeVisible()
  if (route.path === 'transfers') await expect(page.getByRole('button', { name: /^Confirm 1 internal transfer/ })).toBeVisible()
  await auditConsoleChrome(routeLayer(page), route.path)
  await capture(page, route.path)
  await checkAxe(page)
})

test('Ledger corrects a category and restores keyboard focus', async ({ page }) => {
  const fixture = await enter(page, 'ledger')
  await page.getByRole('textbox', { name: 'Search ledger' }).press('c')
  await expect(page.getByRole('dialog', { name: 'Control Centre' })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Search ledger' }).clear()
  const row = page.getByRole('button', { name: /Market grocer.*21 Nov|21 Nov.*Market grocer/ }).first()
  await row.focus()
  await page.keyboard.press('ArrowDown')
  await expect(row).not.toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(row).toBeFocused()
  await page.keyboard.press('Enter')
  const editor = page.getByRole('dialog', { name: 'Market grocer' })
  await expect(editor).toBeVisible()
  const category = editor.getByRole('combobox', { name: 'Transaction category' })
  await category.selectOption('Transport')
  const discard = page.waitForEvent('dialog').then(async prompt => {
    expect(prompt.message()).toContain('Discard unsaved transaction')
    await prompt.dismiss()
  })
  await Promise.all([page.keyboard.press('Escape'), discard])
  await expect(category).toHaveValue('Transport')
  expect(fixture.writes).toEqual([])
  await auditConsoleChrome(editor, 'ledger correction')
  await capture(page, 'ledger-edit')
  await editor.getByRole('button', { name: 'Save correction' }).click()
  await expect(row).toContainText('Transport')
  await editor.getByRole('button', { name: 'Close transaction detail' }).click()
  await expect(row).toBeFocused()
  expect(fixture.writes).toContainEqual({ resource: 'update-transaction-category',
    body: { action: 'edit', transaction_id: fixture.expected.parentId, category: 'Transport', subcategory: null } })
  await capture(page, 'ledger-corrected')
})

test('Budget reviews, saves and reopens a changed allocation', async ({ page }) => {
  const fixture = await enter(page, 'budget')
  await page.locator('summary').filter({ hasText: 'Income & allocations' }).click()
  await page.getByRole('button', { name: /Change my plan/ }).click()
  const form = page.getByRole('form', { name: 'Adjust allocation plan' })
  const amount = form.getByRole('textbox', { name: /Everyday spending/ })
  await amount.fill('1030.00')
  const discard = page.waitForEvent('dialog').then(async prompt => {
    expect(prompt.message()).toContain('discard unsaved allocation')
    await prompt.dismiss()
  })
  await Promise.all([page.getByRole('button', { name: 'Back to Home' }).click(), discard])
  await expect(page).toHaveURL(/\/budget$/)
  await expect(amount).toHaveValue('1030.00')
  await form.getByRole('button', { name: 'Review my plan' }).click()
  await expect(form.getByText('Check before saving')).toBeVisible()
  await auditConsoleChrome(routeLayer(page), 'budget review')
  await capture(page, 'budget-review')
  await form.getByRole('button', { name: 'Save plan changes' }).click()
  await expect(page.getByText('Budget saved. No money was moved.')).toBeVisible()
  await expect(page.locator('.console-budget-save-result')).toBeFocused()
  expect(fixture.writes).toContainEqual({
    resource: 'manage-budget', body: expect.objectContaining({ action: 'revise', expected_plan: '1',
      scope: 'period', lines: [{ line_id: fixture.expected.lineId, amount_cents: 103000 }] }),
  })
  await capture(page, 'budget-saved')
  if (!(await page.getByRole('button', { name: /Change my plan/ }).isVisible())) {
    await page.locator('summary').filter({ hasText: 'Income & allocations' }).click()
  }
  await page.getByRole('button', { name: /Change my plan/ }).click()
  await expect(amount).toHaveValue('1030.00')
})

test('Budget recovers a committed allocation after a reload without a second write', async ({ page }) => {
  const fixture = await enter(page, 'budget', { loseBudgetReceipt: true })
  await page.locator('summary').filter({ hasText: 'Income & allocations' }).click()
  await page.getByRole('button', { name: /Change my plan/ }).click()
  const form = page.getByRole('form', { name: 'Adjust allocation plan' })
  await form.getByRole('textbox', { name: /Everyday spending/ }).fill('991.05')
  await form.getByRole('button', { name: 'Review my plan' }).click()
  await form.getByRole('button', { name: 'Save plan changes' }).click()
  await expect(page.getByText(/The result is not confirmed/)).toBeVisible()
  const receipt = page.getByRole('button', { name: 'Check saved result' })
  page.once('dialog', dialog => dialog.accept())
  await page.reload()
  await receipt.click()
  await expect(page.getByText('Budget saved. No money was moved.')).toBeVisible()
  await expect(receipt).toHaveCount(0)
  expect(fixture.writes).toHaveLength(1)
  expect(fixture.budgetChecks).toEqual([fixture.writes[0].body.request_id])
})

test('Ingestion stages a statement and keeps the staged rows when leaving is cancelled', async ({ page }) => {
  const fixture = await enter(page, 'ingestion')
  await page.getByLabel('Import into').selectOption(fixture.expected.everyday)
  await page.locator('input[type=file]').setInputFiles({
    name: 'review-statement.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Date,Description,Amount,Category\n2026-11-18,Corner market,-23.45,Food & drink\n2026-11-19,Bus fare,-5.50,Transport\n'),
  })
  await page.getByRole('button', { name: 'Stage 2 rows' }).click()
  await expect(page.getByText('2 ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Review statement rows' })).toBeFocused()
  await auditConsoleChrome(routeLayer(page), 'ingestion staging')
  await capture(page, 'ingestion-staged')
  const dialog = page.waitForEvent('dialog')
  await page.getByRole('button', { name: 'Back to Home' }).click({ noWaitAfter: true })
  const prompt = await dialog
  expect(prompt.message()).toContain('stage this statement again')
  await prompt.dismiss()
  await expect(page).toHaveURL(/\/ingestion$/)
  await expect(page.getByText('2 ready', { exact: true })).toBeVisible()
  expect(fixture.writes).toEqual([])
})

test('Transfers cancels and then confirms a group through one write', async ({ page }) => {
  const fixture = await enter(page, 'transfers')
  const action = page.getByRole('button', { name: /^Confirm 1 internal transfer/ })
  await expect(action).toBeVisible()
  page.once('dialog', dialog => dialog.dismiss())
  await action.click()
  expect(fixture.writes).toEqual([])
  await capture(page, 'transfers-confirmation')
  page.once('dialog', dialog => dialog.accept())
  await action.click()
  await expect(action).toHaveCount(0)
  expect(fixture.writes).toEqual([{ resource: 'decide-transfer',
    body: { link_ids: [fixture.expected.transferId], verdict: 'confirmed' } }])
  await capture(page, 'transfers-confirmed')
})

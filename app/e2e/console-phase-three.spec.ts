import { expect, test, type Page } from '@playwright/test'
import { dashboard, signInForConsole } from './fixtures/console-review'

const reports = new Set(['portfolio_summary', 'cash_flow_report', 'net_worth_monthly', 'reporting_transaction_lines'])

function tile(page: Page, name: string) {
  return page.getByRole('toolbar', { name: 'Money sections' }).getByRole('button', { name, exact: true })
}

async function enterConsole(page: Page) {
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
}

async function openOverview(page: Page) {
  await tile(page, 'Overview').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(dashboard + '?hub=overview')
  await expect(page.locator('.console-route-layer')).toHaveCount(1)
}

test('rapid Home previews reuse reports and open before the light dwell', async ({ page }) => {
  const reads: string[] = []
  await signInForConsole(page, true, resource => { if (reports.has(resource)) reads.push(resource) })
  await enterConsole(page)
  await expect(page.locator('.console-home .console-hero-amount')).toContainText('$184,320')
  await expect(page.getByRole('group', { name: 'Transaction cards' })).toBeVisible()
  await expect(page.locator('.console-home .console-orb-line')).toBeAttached()
  const before = [...reads]
  await tile(page, 'Overview').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await expect(tile(page, 'Income')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.console-home .console-hero-amount')).toContainText('$7,080')
  expect(reads).toEqual(before)

  const ambientAtOpen = await tile(page, 'Income').evaluate(button => {
    const section = button.closest('.console-viewport')?.querySelector('.console-ambient[data-current="true"]')
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return (section as HTMLElement | null)?.dataset.section
  })
  expect(ambientAtOpen).not.toBe('income')
  await expect(page).toHaveURL(/\/income$/)
  await expect(page.getByRole('heading', { name: 'Income', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(page).toHaveURL(dashboard)
  await expect(tile(page, 'Income')).toBeFocused()
  await expect(page.locator('.console-home .console-hero-amount')).toContainText('$7,080')
})

test('phone Overview art shares the figure row and modules follow the reading order', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'Phone geometry')
  await signInForConsole(page)
  await enterConsole(page)
  const home = page.locator('.console-home')
  const hub = page.locator('.console-expanded-hero')
  async function checkHero(hero: typeof home) {
    const geometry = await hero.evaluate(node => {
      const amount = node.querySelector('.console-hero-amount')!.getBoundingClientRect()
      const movement = node.querySelector('.console-figures')!.getBoundingClientRect()
      const art = node.querySelector('.console-orb')!.getBoundingClientRect()
      return {
        headlineGap: Math.min(movement.top, art.top) - amount.bottom,
        artGap: art.left - movement.right,
        sharedRow: movement.top < art.bottom && movement.bottom > art.top,
        artOnscreen: art.right <= innerWidth
      }
    })
    expect(geometry.headlineGap).toBeGreaterThanOrEqual(0)
    expect(geometry.artGap).toBeGreaterThan(0)
    expect(geometry.sharedRow).toBe(true)
    expect(geometry.artOnscreen).toBe(true)
  }
  await expect(home.locator('.console-preview')).toHaveCSS('opacity', '1')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await checkHero(home)
  }
  await openOverview(page)
  await expect(home).toHaveCount(0)
  await expect(hub).toHaveCSS('opacity', '1')
  for (const movingPart of await hub.locator('.console-handoff').all()) {
    await expect(movingPart).toHaveCSS('transform', 'none')
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await checkHero(hub)
  }

  const overview = page.locator('.console-designed-scroll')
  expect(await overview.getByRole('heading', { level: 2 }).allTextContents()).toEqual([
    'Overview hub', 'Cumulative net worth', 'Asset allocation', 'Holdings', 'Spending insights', 'Recent activity',
  ])
  const chart = overview.getByRole('region', { name: 'Cumulative net worth' })
  await chart.focus()
  await page.keyboard.press('ArrowRight')
  await expect(overview.getByRole('region', { name: 'Asset allocation' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(overview.getByRole('region', { name: 'Holdings' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(overview.getByRole('region', { name: 'Spending insights' })).toBeFocused()
})

test('report failures retry in place and empty Overview modules retain their context', async ({ page }) => {
  let activityFails = true
  await signInForConsole(page, true, undefined, (resource) => {
    if (resource === 'reporting_transaction_lines' && activityFails) {
      return { status: 503, json: { message: 'Fixture report unavailable' } }
    }
    if (['reporting_transaction_lines', 'net_worth_monthly'].includes(resource)) return { json: [] }
  })
  await enterConsole(page)
  const home = page.locator('.console-home')
  await expect(home.getByText('Recent activity unavailable.')).toBeVisible()
  await expect(home.locator('.console-hero-amount')).toContainText('$184,320')
  activityFails = false
  await home.getByRole('button', { name: 'Retry' }).click()
  await expect(home.getByText('No recent transactions yet.')).toBeVisible()
  await openOverview(page)
  await expect(page.getByText('No monthly history yet.')).toBeVisible()
  await expect(page.getByText('No transactions yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import a statement' })).toBeVisible()
})

test('Dashboard redaction keeps exact amounts out of accessible content and charts', async ({ page }) => {
  await signInForConsole(page)
  await enterConsole(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const privacy = page.getByRole('switch', { name: 'Redact balances' })
  await privacy.click()
  await expect(privacy).toBeChecked()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(page).toHaveURL(dashboard)
  const home = page.locator('.console-home')
  await expect(home.getByRole('heading', { name: 'Home' })).toBeAttached()
  await expect(home.locator('.console-hero-amount')).toHaveText('Hidden')
  await expect(home.getByRole('group', { name: 'Transaction cards' })).toContainText('Amount hidden')
  await expect(home).not.toContainText(/\$[\d,]+/)
  await expect(home.locator('.console-orb-line')).toHaveCount(0)

  await openOverview(page)
  const overview = page.locator('.console-designed-scroll')
  await expect(overview.getByText('Net worth values are hidden.')).toBeVisible()
  await expect(overview).not.toContainText(/\$[\d,]+/)
  await expect(overview.getByText('View chart values')).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(privacy).toBeChecked()
  await privacy.click()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(home.locator('.console-hero-amount')).toContainText('$184,320.00')
})

test('recent activity edits and reloads the full parent through the signed-in app', async ({ page }) => {
  const parentId = 'local-fixture-8'
  let category = 'Groceries'
  const edits: unknown[] = []
  await signInForConsole(page, true, undefined, (resource, request, body) => {
    if (resource === 'transactions_analytic') return { json: {
      id: parentId, date: '2026-11-21', merchant: 'Market grocer', merchant_key: 'market-grocer',
      kind: 'expense', pending: false, category, amount: -31500, account_id: '64ddbad1-3d5b-4840-a2c7-30192dc77993',
    } }
    if (resource === 'update-transaction-category') {
      const payload = request.postDataJSON()
      edits.push(payload)
      category = payload.category
      return { json: { category, subcategory: null, edit_id: 'fixture-edit' } }
    }
    if (resource === 'reporting_transaction_lines' && Array.isArray(body)) {
      return { json: body.map(row => row.parent_id === parentId ? { ...row, category } : row) }
    }
  })
  await enterConsole(page)
  await openOverview(page)
  const recent = page.getByRole('region', { name: 'Recent activity' })
  const row = recent.getByRole('button', { name: /Market grocer.*21 Nov/ })
  await row.evaluate(node => node.setAttribute('data-test-original-row', 'true'))
  await row.focus()
  await page.keyboard.press('Enter')
  const editor = page.getByRole('dialog', { name: 'Market grocer' })
  await expect(editor).toBeFocused()
  const field = editor.getByRole('combobox', { name: 'Transaction category' })
  await field.selectOption('Transport')
  await editor.getByRole('button', { name: 'Save correction' }).click()
  await expect(page.getByText('Transaction updated', { exact: true })).toBeVisible()
  await expect(row).toContainText('Transport')
  await expect(row).toHaveAttribute('data-test-original-row', 'true')
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Close transaction detail' }).click()
  await expect(editor).toHaveCount(0)
  await expect(row).toBeFocused()
  expect(edits).toEqual([{ action: 'edit', transaction_id: parentId, category: 'Transport', subcategory: null }])
})

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { auditConsoleChrome, collectConsoleChrome } from './fixtures/console-leftovers'
import { dashboard, signInForConsole } from './fixtures/console-review'

const hubs = [
  { name: 'Accounts', slug: 'accounts', module: 'Balance history' },
  { name: 'Income', slug: 'income', module: 'Cash flow pacing' },
  { name: 'Expenses', slug: 'expenses', module: 'Spending over time' },
] as const

function tile(page: Page, name: string) {
  return page.getByRole('toolbar', { name: 'Sections' }).getByRole('button', { name, exact: true })
}

async function open(page: Page, hub: typeof hubs[number]) {
  await tile(page, hub.name).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/${hub.slug}$`))
  await expect(page.locator('.console-home')).toHaveCount(0)
  await expect(page.getByRole('region', { name: hub.module })).toBeVisible()
}

async function checkAxe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach('axe', { body: JSON.stringify(results.violations), contentType: 'application/json' })
  expect.soft(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
}

for (const hub of hubs) {
  test(`${hub.name} expands, compacts, passes axe and restores Home focus`, async ({ page, hasTouch }) => {
    await signInForConsole(page)
    await page.getByRole('button', { name: 'Console', exact: true }).click()
    await open(page, hub)
    const surface = page.locator('.console-designed-scroll')
    await expect(surface).toHaveAttribute('data-hero-state', 'expanded')
    await expect(surface.getByRole('heading', { name: hub.name, exact: true, level: 1 })).toBeVisible()
    await expect(surface.getByText('View chart values')).toBeVisible()
    if (hasTouch) {
      const glass = surface.locator('[data-console-surface="hub"]')
      for (const module of await glass.all()) await expect(module).toHaveCSS('backdrop-filter', 'none')
    }
    if (hub.slug === 'income') {
      const filter = surface.getByRole('button', { name: '24 Oct – 22 Nov' })
      const title = surface.getByRole('heading', { name: 'Income', exact: true, level: 1 })
      if (hasTouch) expect((await filter.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y)
      else expect((await filter.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y)
    }
    await auditConsoleChrome(surface, `${hub.name} ${await surface.getAttribute('data-hero-state')}`)
    await checkAxe(page)
    await surface.evaluate(node => node.scrollTo(0, 600))
    await expect(surface).toHaveAttribute('data-hero-state', 'compact')
    await expect(surface.locator('.console-dock-material')).toHaveCSS('opacity', '1')
    await auditConsoleChrome(surface, `${hub.name} ${await surface.getAttribute('data-hero-state')}`)
    await checkAxe(page)
    await page.getByRole('button', { name: 'Back to Home' }).click()
    await expect(page).toHaveURL(dashboard)
    await expect(tile(page, hub.name)).toBeFocused()
  })
}

test('Accounts switches readings and closes each account dialog back to its opener', async ({ page }) => {
  await signInForConsole(page)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await open(page, hubs[0])
  for (const action of ['Add account', 'Edit account', 'Connect bank']) {
    const opener = page.getByRole('button', { name: action, exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: action })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: action })).toHaveCount(0)
    await expect(opener).toBeFocused()
  }
  const select = page.getByRole('combobox', { name: 'Select account' })
  await select.selectOption({ label: 'High-interest savings (Savings)' })
  await expect(page.locator('.console-hero-amount')).toContainText('$75,000.00')
  await expect(page.getByRole('img', { name: 'Monthly closing balances' })).toBeVisible()
})

test('Expenses allows keyboard range focus and Escape dismisses its date filter', async ({ page }) => {
  await signInForConsole(page)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await open(page, hubs[2])
  const dates = page.getByRole('button', { name: '24 Oct – 22 Nov' })
  await dates.click()
  await expect(dates).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(dates).toHaveAttribute('aria-expanded', 'false')
  await expect(page).toHaveURL(/\/expenses$/)
  await page.getByRole('combobox', { name: 'Focus spending period' }).selectOption('23')
  await expect(page.getByRole('combobox', { name: 'Focus spending period' })).toHaveValue('23')
  await page.getByRole('tab', { name: 'Recurring hub' }).click()
  await expect(page.getByText('Recurring commitments', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Analytics' }).click()
  await expect(page.getByRole('combobox', { name: 'Focus spending period' })).toHaveValue('23')
})

test('A Home account card opens the corresponding account and returns to Accounts', async ({ page }) => {
  await signInForConsole(page)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await tile(page, 'Overview').focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('group', { name: 'Account cards' }).getByRole('button', { name: /High-interest savings/ }).click()
  await expect(page).toHaveURL(/\/accounts$/)
  await expect(page.locator('.console-expanded-hero .console-hero-amount')).toContainText('$75,000.00')
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(tile(page, 'Accounts')).toBeFocused()
})

test('Expenses displays reconciled prior detail and nice-number money ticks', async ({ page }) => {
  await signInForConsole(page)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await open(page, hubs[2])
  const title = page.getByRole('region', { name: 'Period changes', exact: true })
  const movers = page.getByRole('region', { name: 'Category changes summary', exact: true })
  for (const module of [title, movers]) {
    const totals = await module.evaluate(node => ({
      rows: [...node.querySelectorAll('[data-comparison-prior]')].map(element => Number(element.getAttribute('data-comparison-prior'))),
      other: Number(node.querySelector('[data-comparison-prior-other]')?.getAttribute('data-comparison-prior-other') ?? 0),
      total: Number(node.querySelector('[data-comparison-prior-total]')?.getAttribute('data-comparison-prior-total')),
    }))
    expect(totals.total).toBe(349420)
    expect(totals.rows.some(amount => amount > 0)).toBe(true)
    expect(totals.rows.reduce((sum, amount) => sum + amount, 0) + totals.other).toBe(totals.total)
  }
  const chart = page.getByRole('region', { name: 'Spending over time' })
  for (const tab of ['Cumulative', 'Per period']) {
    await chart.getByRole('tab', { name: tab }).click()
    const ticks = chart.locator('[data-console-axis-tick]')
    await expect(ticks.first()).toBeVisible()
    const values = await ticks.evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-console-axis-tick'))))
    expect(values.length).toBeGreaterThan(1)
    for (const amount of values.filter(Boolean)) {
      const scale = 10 ** Math.floor(Math.log10(Math.abs(amount)))
      expect([1, 2, 2.5, 5]).toContain(Math.abs(amount) / scale)
    }
  }
})
test('the leftovers audit detects casing applied only in the rendered view', async ({ page }) => {
  await page.setContent(`<style>th::after { content: " status"; font-variant-caps: all-small-caps }</style>
    <main><table><thead><tr><th style="text-transform: uppercase">Item</th></tr></thead></table>
    <button><span style="font-variant-caps: small-caps">Planned</span></button>
    <div data-console-toast><p>MILESTONE REACHED</p></div>
    <p data-console-empty-state>no recurring series detected</p></main>`)
  expect((await collectConsoleChrome(page.locator('main'))).issues.casing)
    .toEqual(['ITEM', 'STATUS', 'PLANNED', 'MILESTONE REACHED', 'no recurring series detected'])
})

test('the leftovers audit detects unstyled browser controls and a default focus outline', async ({ page }) => {
  await page.setContent(`<main><select aria-label="Choose account"><option>Everyday</option></select>
    <label><input type="radio">This transaction</label>
    <aside tabindex="-1">Transaction details</aside></main>`)
  await page.locator('aside').focus()
  const { issues } = await collectConsoleChrome(page.locator('main'))
  expect(issues.controls).toContain('Native select: Choose account')
  expect(issues.defaultAccents).toEqual(['This transaction'])
  expect(issues.defaultOutlines).toEqual(['Transaction details'])
  expect(issues.focusRings).toEqual(['Transaction details'])
})

test('the rendered audit rejects an authored outline and US interface spellings', async ({ page }) => {
  await page.setContent(`<main>
    <button style="outline: 2px solid white; outline-offset: 3px; border-radius: 12px">Categorize</button>
    <p aria-label="Color">Cash-flow behavior</p><p data-console-record-label>Favorite Color Café</p>
    <p data-console-toast>Annualized results at the center</p>
    <p data-console-empty-state>Analyze expenses by color</p>
    <p>Categorise by colour · Analyse by centre · Resize</p></main>`)
  await page.keyboard.press('Tab')
  const { issues } = await collectConsoleChrome(page.locator('main'))
  expect(issues.defaultOutlines).toEqual([])
  expect(issues.focusRings).toEqual(['Categorize'])
  expect(issues.spelling).toEqual(['Categorize', 'Color', 'behavior', 'Annualized', 'center', 'Analyze', 'color'])
})

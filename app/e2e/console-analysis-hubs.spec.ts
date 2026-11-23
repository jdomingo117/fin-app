import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
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
    if (hub.slug === 'income') {
      const filter = surface.getByRole('button', { name: '24 Oct – 22 Nov' })
      const title = surface.getByRole('heading', { name: 'Income', exact: true, level: 1 })
      if (hasTouch) expect((await filter.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y)
      else expect((await filter.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y)
    }
    await checkAxe(page)
    await surface.evaluate(node => node.scrollTo(0, 600))
    await expect(surface).toHaveAttribute('data-hero-state', 'compact')
    await expect(surface.locator('.console-dock-material')).toHaveCSS('opacity', '1')
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

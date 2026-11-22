import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { dashboard, signInForConsole } from './fixtures/console-review'

function sections(page: Page) {
  return page.getByRole('toolbar', { name: 'Sections' })
}

function tile(page: Page, name: string) {
  return sections(page).getByRole('button', { name, exact: true })
}

async function enterConsole(page: Page) {
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
  await expect(page.getByText('Private Wealth Interface · v0.1')).toHaveCount(0)
  await expect(page.locator('.console-home .console-hero-amount')).toContainText('$184,320')
  await expect(page.locator('.console-preview')).toHaveCSS('opacity', '1')
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
}

async function checkAxe(page: Page, state: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach(`${state}-axe`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect.soft(result.violations.map(({ id, nodes }) =>
    ({ id, nodes: nodes.map(node => node.target) })), state).toEqual([])
}

async function stopDecorations(page: Page) {
  // Leave route transitions intact. Sample the looping ambient lights and focus adornments at rest.
  await page.addStyleTag({ content: `
    .console-rays, .console-beam,
    .console-focus-decoration::before, .console-focus-decoration::after { animation-play-state: paused !important; }
  ` })
}

async function takeCapture(page: Page, state: string) {
  await page.mouse.move(0, 0)
  const directory = process.env.CONSOLE_CAPTURE_DIR
  const name = `${page.viewportSize()?.width}-${state}.jpg`
  const path = directory ? resolve(directory, name) : test.info().outputPath(name)
  if (directory) await mkdir(directory, { recursive: true })
  await page.screenshot({ path, quality: 89 })
  await test.info().attach(state, { path, contentType: 'image/jpeg' })
}

async function openIncome(page: Page, touch: boolean) {
  const income = tile(page, 'Income')
  if (touch) {
    await income.tap()
    await expect(page).toHaveURL(dashboard)
  } else {
    await tile(page, 'Overview').focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
  }
  await expect(income).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.console-home .console-hero-amount')).toContainText('$7,080')
  await expect(page.locator('.console-ambient[data-section="income"]')).toHaveAttribute('data-current', 'true')
  if (touch) await income.tap()
  else await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/income(?:\?|$)/)
}

test('Home and hubs render from the signed-in entry and pass axe', async ({ page, hasTouch }) => {
  await signInForConsole(page)
  await enterConsole(page)
  await stopDecorations(page)
  await expect(page.locator('.console-route-layer')).toHaveCount(1)
  await checkAxe(page, 'home-overview')
  await takeCapture(page, 'home-overview')

  await openIncome(page, hasTouch ?? false)
  const hub = page.locator('.console-designed-scroll')
  await expect(hub).toHaveAttribute('data-hero-state', 'expanded')
  await expect(page.locator('.console-expanded-hero .console-hero-amount')).toContainText('$7,080.00')
  await expect(page.locator('.console-route-layer')).toHaveCount(1)
  await checkAxe(page, 'income-expanded')
  await takeCapture(page, 'income-expanded')

  await hub.evaluate(node => {
    const chart = node.querySelector('.console-module')
    const header = node.querySelector('.console-hub-dock')
    if (chart && header) {
      node.scrollTo(0, chart.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 20)
    }
  })
  await expect(hub).toHaveAttribute('data-hero-state', 'compact')
  const dock = page.locator('.console-dock-material')
  await expect(dock).toHaveCSS('opacity', '1')
  await expect(dock).toHaveCSS('background-image', /linear-gradient\(.*oklch\(0.185 0.03 85\) /)
  expect(await dock.evaluate(node => node.getBoundingClientRect().width)).toBe(page.viewportSize()?.width)
  await checkAxe(page, 'income-compact')
  await takeCapture(page, 'income-compact')

  await hub.evaluate(node => node.scrollTo(0, 0))
  await expect(hub).toHaveAttribute('data-hero-state', 'expanded')
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(page).toHaveURL(dashboard)
  await expect(tile(page, 'Income')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/dashboard\?hub=overview/)
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(page.locator('.console-route-layer')).toHaveCount(1)
  await expect(page.locator('.console-expanded-hero .console-hero-amount')).toContainText('$184,320.00')
  await expect(page.getByText('Gross assets', { exact: true })).toBeAttached()
  await expect(page.getByText('Explore category →', { exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)')
  await checkAxe(page, 'overview-expanded')
  await takeCapture(page, 'overview-expanded')
})

test('appearance persists, with a Classic render and navigation smoke check', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()) })
  await signInForConsole(page)
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Accounts', exact: true }).first().click()
  await expect(page).toHaveURL(/\/accounts$/)
  await page.goto(dashboard)
  await enterConsole(page)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
  await expect(tile(page, 'Overview')).toBeVisible()
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('a tab can switch appearance when preference storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const { getItem, setItem } = Storage.prototype
    const blocked = (key: string) => key === 'halcyon-appearance' || key === 'halcyon-theme'
    Storage.prototype.getItem = function (key) {
      if (blocked(key)) throw new DOMException('Preference storage is blocked', 'SecurityError')
      return getItem.call(this, key)
    }
    Storage.prototype.setItem = function (key, value) {
      if (blocked(key)) throw new DOMException('Preference storage is blocked', 'SecurityError')
      setItem.call(this, key, value)
    }
  })
  await signInForConsole(page)
  await enterConsole(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
})

test('the foundation demo shows disabled, full and reduced states', async ({ page }) => {
  await signInForConsole(page)
  await enterConsole(page)
  await page.goto(`${dashboard}?demo=foundation`)
  await expect(page.getByRole('heading', { name: 'Console foundation demo' })).toBeVisible()
  await expect(page.getByText('Motion: Full effects')).toBeVisible()
  const activity = page.getByRole('button', { name: 'Activity card', exact: true })
  await activity.focus()
  await expect(activity).toHaveCSS('box-shadow', /3px.*6px/)
  await page.keyboard.press('ArrowRight')
  const hub = page.getByRole('region', { name: 'Tinted hub surface' })
  await expect(hub).toBeFocused()
  await expect(hub).toHaveCSS('backdrop-filter', 'blur(24px) saturate(1.5)')
  await expect(page.getByRole('button', { name: 'Disabled activity card' })).toBeDisabled()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByText('Motion: 150 ms fades')).toBeVisible()
  await expect(hub).toHaveCSS('backdrop-filter', 'none')
  await page.getByRole('button', { name: 'Replay entrance' }).click()
  await expect(page.locator('.console-viewport')).toHaveCSS('--dur-reduced', '150ms')
  await expect(page.locator('.console-focus-decoration[data-layer="glow"]')).toHaveCSS('box-shadow', /26px/)
})

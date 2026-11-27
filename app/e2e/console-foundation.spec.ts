import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { dashboard, signInForConsole } from './fixtures/console-review'

function sections(page: Page) {
  return page.getByRole('toolbar', { name: 'Money sections' })
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
  expect(await page.evaluate(() => ({ locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })))
    .toEqual({ locale: 'en-AU', timezone: 'Australia/Sydney' })
  await enterConsole(page)
  await stopDecorations(page)
  await expect(page.locator('.console-route-layer')).toHaveCount(1)
  await checkAxe(page, 'home-overview')
  await takeCapture(page, 'home-overview')

  await openIncome(page, hasTouch ?? false)
  const hub = page.locator('.console-designed-scroll')
  await expect(hub).toHaveAttribute('data-hero-state', 'expanded')
  const filters = hub.locator('.console-hub-filters')
  await expect(filters.getByRole('button', { name: '24 Oct – 22 Nov' })).toBeVisible()
  await expect(filters).not.toContainText(/\b(?:Oct|Nov) \d{1,2}\b|\b20\d{2}-\d{2}/)
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
  const worthChart = page.getByRole('region', { name: 'Cumulative net worth' })
  const axis = worthChart.locator('svg text')
  await expect(axis.filter({ hasText: /^Apr$/ })).toHaveCount(1)
  await expect(axis.filter({ hasText: /\b20\d{2}-\d{2}\b/ })).toHaveCount(0)
  await expect(page.getByText('Gross assets', { exact: true })).toBeAttached()
  const allocation = page.getByRole('region', { name: 'Asset allocation' })
  const allocationTotals = await allocation.evaluate(node => {
    const cents = (text: string | null | undefined) => Number(text?.replace(/[^\d]/g, ''))
    const segments = [...node.querySelectorAll('.donut-legend-row')]
      .map(row => cents(row.lastElementChild?.lastElementChild?.lastElementChild?.textContent))
    return {
      segments,
      centre: cents(node.querySelector('.donut-center')?.textContent),
      grossAssets: cents(node.querySelector('.allocation-donut__legend')?.lastElementChild?.lastElementChild?.textContent),
    }
  })
  expect(allocationTotals.segments).toEqual([9644000, 8788000])
  expect(allocationTotals.centre).toBe(allocationTotals.segments.reduce((sum, cents) => sum + cents, 0))
  expect(allocationTotals.grossAssets).toBe(allocationTotals.centre)
  await expect(page.getByText('Explore category →', { exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)')
  await checkAxe(page, 'overview-expanded')
  await takeCapture(page, 'overview-expanded')
})

test('an explicit Classic choice persists, with a Classic render and navigation smoke check', async ({ page }) => {
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

test('appearance switch confirms before discarding a reported edit', async ({ page }) => {
  await signInForConsole(page)
  await enterConsole(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Edit callsign' }).click()
  const callsign = page.getByRole('textbox', { name: 'Callsign' })
  await callsign.fill('Unsubmitted review edit')
  const appearance = page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Classic', exact: true })
  let confirmation = ''
  page.once('dialog', async dialog => {
    confirmation = dialog.message()
    await dialog.dismiss()
  })
  await appearance.click()
  expect(confirmation).toMatch(/discard unsaved changes/i)
  await expect(callsign).toHaveValue('Unsubmitted review edit')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
  page.once('dialog', dialog => dialog.accept())
  await appearance.click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
})

test('a fresh profile opens Console and keeps an explicit Classic choice', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()) })
  await signInForConsole(page, true, undefined, undefined, 'fresh')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
  await expect(tile(page, 'Overview')).toBeVisible()
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('halcyon-appearance'))).toBeNull()

  await page.goto(new URL('/accounts', dashboard).href)
  await expect(page.getByRole('heading', { name: 'Accounts hub' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  expect(await page.evaluate(() => localStorage.getItem('halcyon-appearance'))).toBe('classic')
  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch to Console' })).toBeVisible()
  expect(errors).toEqual([])
})

test('signed-out entry keeps the Classic sign-in screen on a fresh profile', async ({ page }) => {
  await signInForConsole(page, true, undefined, undefined, 'fresh')
  await page.locator('.console-topbar').getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await page.goto(new URL('/accounts', dashboard).href)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
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
  await signInForConsole(page, true, undefined, undefined, 'fresh')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await page.goto(dashboard)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
  await expect(tile(page, 'Overview')).toBeVisible()
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
  await expect(hub).toHaveCSS('backdrop-filter', await page.locator('.console-viewport').getAttribute('data-effects-tier') === 'full'
    ? 'blur(24px) saturate(1.5)' : 'none')
  await expect(page.getByRole('button', { name: 'Disabled activity card' })).toBeDisabled()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByText('Motion: 150 ms fades')).toBeVisible()
  await expect(hub).toHaveCSS('backdrop-filter', 'none')
  await page.getByRole('button', { name: 'Replay entrance' }).click()
  await expect(page.locator('.console-viewport')).toHaveCSS('--dur-reduced', '150ms')
  await expect(page.locator('.console-focus-decoration[data-layer="glow"]')).toHaveCSS('box-shadow', /26px/)
})

test('Home reserves its hero and returns warm with zero layout shift or text overlap', async ({ page }) => {
  const reportNames = new Set(['portfolio_summary', 'cash_flow_report', 'net_worth_monthly', 'reporting_transaction_lines'])
  let count = 0
  let unblock!: () => void
  const cold = new Promise<void>(resolve => { unblock = resolve })
  await signInForConsole(page, true, resource => {
    if (!reportNames.has(resource)) return
    count++
    return cold
  })
  try {
    await page.getByRole('button', { name: 'Console', exact: true }).click()
    const home = page.locator('.console-home')
    const hero = home.locator('.console-hero-amount')
    await expect(hero).toHaveText('Unavailable')
    await expect(home.locator('.console-preview')).toHaveCSS('opacity', '1')
    const top = () => hero.evaluate(element => element.getBoundingClientRect().top)
    const coldTop = await top()
    unblock()
    await expect(hero.getByText('$184,320', { exact: true })).toBeVisible()
    await expect(home.getByRole('group', { name: 'Transaction cards' })).toBeVisible()
    expect(await top()).toBeCloseTo(coldTop, 0)

    const openingTile = page.getByRole('toolbar', { name: 'Money sections' }).getByRole('button', { name: 'Overview' })
    await openingTile.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL('**/dashboard?hub=overview')
    await expect(page.getByRole('region', { name: 'Cumulative net worth' })).toBeVisible()
    await expect(page.locator('.console-route-layer')).toHaveCount(1)
    const requestsBeforeBack = count

    await page.evaluate(() => {
      const shifts: number[] = []
      const overlaps: number[] = []
      let homeFrames = 0
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          // Include input-triggered shifts. CLS would ordinarily exclude these.
          shifts.push((entry as PerformanceEntry & { value: number }).value)
        }
      })
      observer.observe({ type: 'layout-shift' })
      let frame = 0
      function sample() {
        const home = document.querySelector('.console-route-layer:not([inert]) .console-home')
        const headline = home?.querySelector('[data-console-shared="figure"]')
        const strip = home?.querySelector('.console-figures')
        if (headline && strip) {
          homeFrames++
          const amount = headline.getBoundingClientRect()
          for (const text of strip.querySelectorAll('dt, dd')) {
            const box = text.getBoundingClientRect()
            if (amount.left < box.right && amount.right > box.left && amount.top < box.bottom && amount.bottom > box.top) {
              overlaps.push(homeFrames)
            }
          }
        }
        frame = requestAnimationFrame(sample)
      }
      frame = requestAnimationFrame(sample)
      Reflect.set(window, '__consoleReturn', () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
        return { shifts, overlaps, homeFrames }
      })
    })
    await page.getByRole('button', { name: 'Back to Home' }).click()
    await page.waitForURL('**/dashboard')
    await expect(hero.getByText('$184,320', { exact: true })).toBeVisible()
    await expect(home.locator('.console-preview')).toHaveCSS('opacity', '1')
    await expect(page.locator('.console-route-layer')).toHaveCount(1)
    const observed = await page.evaluate(() => Reflect.get(window, '__consoleReturn')() as {
      shifts: number[]; overlaps: number[]; homeFrames: number
    })
    expect(observed.homeFrames).toBeGreaterThan(2)
    expect(observed.shifts).toEqual([])
    expect(observed.overlaps).toEqual([])
    expect(count).toBe(requestsBeforeBack)
    expect(await top()).toBeCloseTo(coldTop, 0)
  } finally {
    unblock()
  }
})

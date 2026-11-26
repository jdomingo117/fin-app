import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { collectConsoleChrome } from './fixtures/console-leftovers'
import { workflowReplies } from './fixtures/console-workflow-replies'
import { dashboard, signInForConsole } from './fixtures/console-review'

const sections = (page: Page) => page.getByRole('toolbar', { name: 'Sections' })

const investmentOverview = {
  holding_id: 'fixture-investment', instrument_name: 'Example index fund', identifier: 'EXF',
  calculated_units: '12.5', confirmed_units: null, reconciliation_status: 'Confirmed',
  net_external_contributions_cents: 7820000, reinvested_distributions_cents: 14200,
  activity_count: 0, value_cents: 9644000, nav_price: '12.55', price_date: '2026-11-20',
  valuation_status: 'current', market_movement_cents: 84000, cash_distributions_cents: 1200,
}
const investmentReply = (resource: string) => resource === 'investment_account_overview' ? { json: investmentOverview } : undefined

async function openConsole(page: Page, override?: Parameters<typeof signInForConsole>[3]) {
  await signInForConsole(page, true, undefined, override)
  expect(await page.evaluate(() => ({ locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })))
    .toEqual({ locale: 'en-AU', timezone: 'Australia/Sydney' })
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(sections(page)).toBeVisible()
}

async function openSection(page: Page, name: string) {
  await sections(page).getByRole('button', { name, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(sections(page)).toHaveCount(0)
}

async function capture(page: Page, name: string) {
  const directory = process.env.CONSOLE_OWNER_CAPTURE_DIR
  if (!directory || test.info().project.name !== 'WebKit') return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: resolve(directory, `${name}.jpg`), quality: 83, animations: 'disabled' })
}

async function fitsInHome(item: Locator) {
  await expect.poll(() => item.evaluate(node => {
    const item = node.getBoundingClientRect()
    const home = node.closest('.console-home')!.getBoundingClientRect()
    return {
      focused: node === document.activeElement,
      top: Math.max(0, Math.floor(home.top - item.top)), bottom: Math.max(0, Math.floor(item.bottom - home.bottom)),
      left: Math.max(0, Math.floor(home.left - item.left)), right: Math.max(0, Math.floor(item.right - home.right)),
    }
  }), { message: `${item} at ${JSON.stringify(item.page().viewportSize())} should be focused and in view` })
    .toEqual({ focused: true, top: 0, bottom: 0, left: 0, right: 0 })
}

test('Home keeps its hero clear and every card reachable at high zoom', async ({ page }) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openConsole(page)
  const home = page.locator('.console-home')
  for (const [width, height] of [[756, 400], [1440, 780], [1152, 624], [960, 520], [720, 390], [1512, 801]]) {
    await page.setViewportSize({ width, height })
    const overview = sections(page).getByRole('button', { name: 'Overview' })
    await overview.focus()
    for (const [index, name] of ['Overview', 'Accounts', 'Income', 'Expenses', 'Budget'].entries()) {
      if (index) await page.keyboard.press('ArrowRight')
      const tile = sections(page).getByRole('button', { name, exact: true })
      await expect(tile).toHaveAttribute('aria-pressed', 'true')
      await fitsInHome(tile)
      await expect(home.locator('.console-preview')).toHaveCSS('opacity', '1')
      const cards = home.locator('.console-activity-card')
      if (index === 0) await expect(cards).toHaveCount(4)
      if (index === 1) await expect(cards).toHaveCount(3)
      if (width === 756 && index === 0) await capture(page, '01-home-zoom')
      const collisions = await home.evaluate(node => {
        const box = (selector: string) => node.querySelector(selector)?.getBoundingClientRect()
        const hero = box('.console-hero')!
        const copy = box('.console-summary') ?? box('.console-headline')!
        const art = box('.console-orb, .console-art-empty')
        const tiles = box('.console-switcher')!
        const activity = box('.console-activity')
        const intersects = (a: DOMRect, b?: DOMRect) => b && a.left < b.right - 1 && a.right > b.left + 1
          && a.top < b.bottom - 1 && a.bottom > b.top + 1
        return {
          summaryOutsideHero: copy.top < hero.top - 1 || copy.bottom > hero.bottom + 1,
          artOutsideHero: !!art && (art.top < hero.top - 1 || art.bottom > hero.bottom + 1),
          artIntersectsCopy: !!intersects(copy, art),
          tilesIntersectHero: !!intersects(tiles, hero),
          heroIntersectsActivity: !!intersects(hero, activity),
        }
      })
      expect.soft(Object.entries(collisions).filter(([, collision]) => collision), `${width}×${height} ${name}`).toEqual([])
      if (!await cards.count()) continue
      await page.keyboard.press('Tab')
      for (const [cardIndex, card] of (await cards.all()).entries()) {
        if (cardIndex) await page.keyboard.press('ArrowRight')
        await fitsInHome(card)
      }
      await tile.focus()
      await fitsInHome(tile)
    }
  }
})

test('Expanded hero text clears the sticky dock throughout collapse', async ({ page }) => {
  test.setTimeout(120_000)
  await openConsole(page)
  for (const [name, route] of [['Overview', '/dashboard?hub=overview'], ['Accounts', '/accounts'], ['Income', '/income'], ['Expenses', '/expenses']]) {
    await openSection(page, name)
    await expect(page).toHaveURL(new URL(route, dashboard).href)
    const scroll = page.locator('.console-route-layer:not([inert]) .console-designed-scroll')
    const hero = scroll.locator('.console-expanded-hero')
    await expect(hero).toHaveCSS('opacity', '1')
    await expect.poll(() => hero.evaluate(node => [...node.querySelectorAll('.console-handoff')].every(handoff => {
      const transform = getComputedStyle(handoff).transform
      return transform === 'none' || new DOMMatrix(transform).isIdentity
    }))).toBe(true)
    const end = Math.max(90, await hero.evaluate(node => Math.round(node.getBoundingClientRect().height)) - 26)
    const collisions = []
    for (let step = 0; step <= 20; step++) {
      const progress = step / 20
      const { overlap, fade } = await scroll.evaluate(async (node, top) => {
        node.scrollTop = top
        // Let the scroll event and Framer Motion's render pass settle.
        for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame)
        const hero = node.querySelector<HTMLElement>('.console-expanded-hero')!
        const dock = node.querySelector('.console-hub-dock')!
        const style = getComputedStyle(hero)
        const [start, end] = [...style.maskImage.matchAll(/(-?[\d.]+)px/g)].map(stop => Number(stop[1]))
        const edge = start === undefined ? -Infinity : hero.getBoundingClientRect().top + start
        const overlap = [...hero.querySelectorAll('h1, p, dt, dd')].filter(text => {
          if (+style.opacity <= .01) return false
          const range = document.createRange()
          range.selectNodeContents(text)
          return [...range.getClientRects()].some(box =>
            box.bottom > Math.max(edge, dock.getBoundingClientRect().top) + 1
            && Math.max(edge, box.top) < dock.getBoundingClientRect().bottom - 1)
        }).map(text => text.className || text.tagName)
        return { overlap, fade: end - start }
      }, step === 0 ? 0 : Math.round(20 + progress * end))
      if (step > 0) expect.soft(fade, `${route} at ${progress}`).toBeCloseTo(20, 1)
      if (route === '/income' && step === 5) await capture(page, '02-expanded-dock')
      if (overlap.length) collisions.push({ progress, overlap })
    }
    expect.soft(collisions, route).toEqual([])
    await expect(scroll).toHaveAttribute('data-hero-state', 'compact')
    await scroll.getByRole('button', { name: 'Back to Home' }).click()
    await expect(sections(page)).toBeVisible()
  }
})

test('Start does not reappear after a null token refresh or a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openConsole(page)
  await page.evaluate(() => localStorage.setItem('halcyon-console-preferences', JSON.stringify({ startScreen: true })))
  await page.reload()
  const start = page.getByRole('button', { name: 'Start Halcyon' })
  const home = page.locator('.console-home')
  async function expectHomeReady() {
    await expect(start).toHaveCount(0)
    await expect(sections(page)).toBeVisible()
    await expect(home.locator('.console-preview')).toHaveCSS('opacity', '1')
    await expect(home.locator('.console-hero-amount')).toBeInViewport()
    await expect(home.locator('.console-hero-amount')).toContainText('$184,320')
    await expect(home.locator('.console-orb')).toBeInViewport()
    const activity = home.getByRole('group', { name: 'Transaction cards' })
    await expect(activity).toBeInViewport()
    await expect(activity.getByRole('button')).toHaveCount(4)
  }
  await start.click()
  await expectHomeReady()

  const refresh = (withSession: boolean) => page.evaluate(withSession => {
    const key = Object.keys(localStorage).find(key => /^sb-.*-auth-token$/.test(key))!
    const channel = new BroadcastChannel(key)
    const session = withSession ? JSON.parse(localStorage.getItem(key)!) : null
    channel.postMessage({ event: 'TOKEN_REFRESHED', session })
    channel.close()
  }, withSession)
  await refresh(false)
  await expect(page).toHaveURL(/\/login$/)
  await refresh(true)
  await expect(page).toHaveURL(dashboard)
  await expectHomeReady()
  await capture(page, '03-start-refresh')
  await page.reload()
  await expectHomeReady()
  await capture(page, '03-start-reload')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.locator('input[type="email"]').fill('console-review@example.invalid')
  await page.locator('input[type="password"]').fill('fictional-password-not-a-credential')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.goto(dashboard)
  await expect(start).toBeVisible()
})

test('Date range picker follows its trigger and stays inside both desktop viewports', async ({ page }) => {
  await openConsole(page)
  for (const route of ['/income', '/expenses']) {
    await page.goto(new URL(route, dashboard).href)
    for (const [width, height] of [[1440, 900], [1024, 768]]) {
      await page.setViewportSize({ width, height })
      const trigger = page.locator('.console-hub-dock button[aria-haspopup="dialog"]').first()
      await trigger.click()
      const picker = page.getByRole('dialog', { name: 'Select date range' })
      await expect(picker).toHaveCSS('opacity', '1')
      if (route === '/income' && width === 1024) await capture(page, '04-date-range')
      const box = (await picker.boundingBox())!
      const anchor = (await trigger.boundingBox())!
      const left = Math.max(8, Math.min(anchor.x, width - box.width - 8))
      expect.soft(box.x, `${route} at ${width}`).toBeCloseTo(left, 0)
      expect.soft(box.y).toBeGreaterThanOrEqual(7.5)
      expect.soft(box.x + box.width).toBeLessThanOrEqual(width - 7.5)
      expect.soft(box.y + box.height).toBeLessThanOrEqual(height - 7.5)
      for (const name of ['Range start date', 'Range end date']) {
        await expect.soft(picker.getByLabel(name)).toBeInViewport({ ratio: .99, timeout: 1500 })
      }
      await page.keyboard.press('Escape')
      await expect(picker).toHaveCount(0)
    }
  }
})

test('Date range picker obscures high-contrast text beneath its surface', async ({ page }) => {
  await openConsole(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Effects tier' }).selectOption('full')
  await page.goto(new URL('/income', dashboard).href)
  await page.locator('.console-hub-dock button[aria-haspopup="dialog"]').first().click()
  const picker = page.getByRole('dialog', { name: 'Select date range' })
  await expect(picker).toHaveCSS('opacity', '1')
  const bounds = (await picker.boundingBox())!
  const clip = { x: Math.ceil(bounds.x) + 16, y: Math.ceil(bounds.y) + 16, width: 240, height: 80 }
  await page.evaluate(({ x, y, width, height }) => {
    const probe = document.createElement('div')
    probe.id = 'fixture-under-picker'
    probe.style.cssText = `position:fixed;z-index:54;left:${x}px;top:${y}px;width:${width}px;height:${height}px;`
      + 'background:#000;color:#fff;font:bold 48px/1.2 sans-serif;pointer-events:none'
    probe.textContent = 'Behind text'
    document.body.append(probe)
  }, clip)
  async function sample(style = '') {
    const picture = await page.screenshot({ clip, animations: 'disabled', scale: 'css', style })
    return picture.toString('base64')
  }
  const covered = await sample()
  const noText = await sample('#fixture-under-picker { color: transparent !important; }')
  const open = await sample('[data-console-date-picker] { visibility: hidden !important; }')
  const openNoText = await sample('[data-console-date-picker] { visibility: hidden !important; } #fixture-under-picker { color: transparent !important; }')
  const ratios = await page.evaluate(async ({ pictures, width, height }) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    context.canvas.width = width
    context.canvas.height = height
    const pixels = await Promise.all(pictures.map(async png => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, width, height).data
    }))
    const linear = (channel: number) => channel <= 10 ? channel / 3294.6 : ((channel / 255 + .055) / 1.055) ** 2.4
    const luminance = (rgb: Uint8ClampedArray, i: number) =>
      .2126 * linear(rgb[i]) + .7152 * linear(rgb[i + 1]) + .0722 * linear(rgb[i + 2])
    function maxContrast(a: Uint8ClampedArray, b: Uint8ClampedArray) {
      let max = 1
      for (let i = 0; i < a.length; i += 4) {
        const first = luminance(a, i) + .05, second = luminance(b, i) + .05
        max = Math.max(max, Math.max(first, second) / Math.min(first, second))
      }
      return max
    }
    return { covered: maxContrast(pixels[0], pixels[1]), uncovered: maxContrast(pixels[2], pixels[3]) }
  }, { ...clip, pictures: [covered, noText, open, openNoText] })
  expect(ratios.uncovered).toBeGreaterThan(7)
  expect(ratios.covered).toBeLessThan(1.03)
})

test('Graph controls and selected Recurring chips have readable Console contrast', async ({ page }) => {
  await openConsole(page)
  await page.goto(new URL('/expenses', dashboard).href)
  const graph = page.locator('.react-flow__controls')
  const zoom = graph.getByRole('button', { name: 'Zoom in' })
  await zoom.scrollIntoViewIfNeeded()
  await capture(page, '05-flow-controls')
  await expect.soft(zoom).toHaveCSS('background-color', 'rgb(17, 24, 36)', { timeout: 1500 })
  await expect.soft(zoom.locator('svg')).toHaveCSS('fill', 'rgb(255, 255, 255)')
  expect((await collectConsoleChrome(graph)).issues.controlContrast).toEqual([])
  await zoom.hover()
  await expect.soft(zoom).toHaveCSS('background-color', 'rgb(10, 13, 22)', { timeout: 1500 })
  await page.keyboard.press('Tab')
  await zoom.focus()
  await expect.soft(zoom).toHaveCSS('outline-style', 'solid', { timeout: 1500 })
  await page.getByRole('tab', { name: 'Recurring hub' }).click()
  const chips = page.getByRole('button', { name: /^all$/i })
  await expect(chips).toHaveCount(2)
  await chips.first().scrollIntoViewIfNeeded()
  await capture(page, '05-recurring-chips')
  expect((await collectConsoleChrome(chips.first().locator('../..'))).issues.controlContrast).toEqual([])
  for (const chip of await chips.all()) {
    const { minWidth, height, padding } = await chip.evaluate(node => {
      const style = getComputedStyle(node)
      return { minWidth: parseFloat(style.minInlineSize), height: node.getBoundingClientRect().height,
        padding: parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) }
    })
    expect.soft(minWidth).toBeGreaterThanOrEqual(height + padding)
    await expect.soft(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 1500 })
    await expect.soft(chip).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect.soft(chip).toHaveCSS('color', 'rgb(10, 13, 22)', { timeout: 1500 })
  }
})

test('Budget distinguishes disabled, unreachable and failed save states', async ({ page }) => {
  const fixture = workflowReplies()
  let saveAttempts = 0
  let denied = true
  await openConsole(page, (resource, request, fallback) => {
    if (resource === 'query-budget' && denied) return { status: 403, json: { error: 'denied' } }
    if (resource === 'manage-budget') {
      saveAttempts++
      return { status: 422, json: { message: 'The fixture rejected this change.' } }
    }
    return fixture.reply(resource, request, fallback)
  })
  await page.goto(new URL('/budget', dashboard).href)
  const unavailable = page.getByRole('alert')
  await expect(unavailable).toBeVisible()
  await capture(page, '06-budget-disabled')
  await expect.soft(unavailable).toContainText("Budget isn't available for this account yet.", { timeout: 1500 })
  await expect.soft(unavailable).not.toContainText(/your edits are still here/i, { timeout: 1500 })

  denied = false
  const unreachable = (route: Route) => route.request().method() === 'POST' ? route.abort('failed') : route.fallback()
  await page.route('**/functions/v1/query-budget', unreachable)
  await page.getByRole('button', { name: /refresh/i }).first().click()
  await expect(unavailable).toBeVisible()
  await capture(page, '06-budget-network')
  await expect.soft(unavailable).toContainText("Couldn't reach Budget. Check your connection, then refresh.", { timeout: 1500 })
  await expect.soft(unavailable).not.toContainText(/your edits are still here/i, { timeout: 1500 })
  await expect.soft(unavailable.getByRole('button', { name: 'Refresh', exact: true })).toHaveAttribute('data-shared-button', 'primary', { timeout: 1500 })
  await page.unroute('**/functions/v1/query-budget', unreachable)
  await page.getByRole('button', { name: /refresh/i }).first().click()
  await page.locator('summary').filter({ hasText: 'Income & allocations' }).click()
  await page.getByRole('button', { name: /Change my plan/ }).click()
  const form = page.getByRole('form', { name: 'Adjust allocation plan' })
  const amount = form.getByRole('textbox', { name: /Everyday spending/ })
  await amount.focus()
  await amount.fill('1030.00')
  await amount.blur()
  await form.getByRole('button', { name: 'Review my plan' }).click()
  await form.getByRole('button', { name: 'Save plan changes' }).click()
  await expect(unavailable).toHaveCount(1)
  const failureCopy = "Budget changes couldn't be saved. Your edits are still here."
  await expect(unavailable).toContainText(failureCopy)
  await expect(page.getByText(/Your edits are still here/)).toHaveCount(1)
  await expect(page.getByText('Budget update', { exact: true })).toHaveCount(0)
  await expect(form.getByRole('button', { name: 'Save plan changes' })).toHaveCount(0)
  const retry = unavailable.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeEnabled()
  await unavailable.scrollIntoViewIfNeeded()
  await capture(page, '06-budget-save')
  await retry.click()
  await expect.poll(() => saveAttempts).toBe(2)
  await expect(unavailable).toContainText(failureCopy)
  await expect(amount).toHaveValue('$1,030.00')
})

test('Control Centre keeps focus inside when Tab wraps or a focused control blurs', async ({ page }) => {
  await openConsole(page)
  const button = page.getByRole('button', { name: 'Control Centre', exact: true })
  await button.click()
  const dialog = page.getByRole('dialog', { name: 'Control Centre' })
  const close = dialog.getByRole('button', { name: 'Close Control Centre' })
  const last = dialog.getByRole('button', { name: 'Sign out' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
  let visitedQuickAction = false
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press('Tab')
    const location = await dialog.evaluate(node => ({
      inside: node.contains(document.activeElement),
      quick: !!document.activeElement?.closest('.console-centre-actions'),
    }))
    expect.soft(location.inside, `Tab ${step + 1}`).toBe(true)
    visitedQuickAction ||= location.quick
  }
  expect.soft(visitedQuickAction).toBe(true)
  await last.focus()
  await last.evaluate(node => node.blur())
  await capture(page, '07-centre-focus')
  await expect.soft(close).toBeFocused({ timeout: 1500 })
  await page.keyboard.press('Escape')
  await expect(button).toBeFocused()
})

test('Sound rows align and Master volume has a visible keyboard ring', async ({ page }) => {
  await openConsole(page)
  await page.goto(new URL('/settings', dashboard).href)
  const sound = page.getByRole('region', { name: 'Sound', exact: true })
  const slider = sound.getByRole('slider', { name: 'Master volume' })
  await slider.press('ArrowRight')
  await expect(slider).toBeFocused()
  await expect(slider).toHaveValue('56')
  await slider.scrollIntoViewIfNeeded()
  await capture(page, '08-volume-focus')
  const dimensions = await sound.evaluate(node => {
    const rows = [...node.querySelectorAll('[role="switch"], .console-volume')].map(row => row.getBoundingClientRect().height)
    const input = node.querySelector<HTMLInputElement>('input[type="range"]')!
    const track = input.parentElement!
    const ring = getComputedStyle(track).boxShadow
    const label = document.createRange()
    label.selectNodeContents(track.previousElementSibling!)
    const ringEdge = parseFloat(getComputedStyle(track).getPropertyValue('--console-ring-edge'))
    const gap = track.getBoundingClientRect().left - ringEdge - label.getBoundingClientRect().right
    return { difference: Math.max(...rows) - Math.min(...rows), ring, gap }
  })
  expect.soft(dimensions.difference).toBeLessThan(1)
  expect.soft(dimensions.gap).toBeCloseTo(8, 0)
  expect(dimensions.ring).toMatch(/0px 0px 0px 3px.*0px 0px 0px 6px/)
})

test('Investment orb compares history and pads the fallback value inside the ring', async ({ page }) => {
  let hasHistory = false
  await openConsole(page, (resource, request, payload) => {
    if (resource === 'accounts' && Array.isArray(payload)) return { json: [...payload, {
      id: '688ed674-9459-4f75-99c8-1c68efc1e101', name: 'Empty fixture holding', type: 'Invest', balance: 0, balance_source: 'manual',
    }] }
    const account = new URL(request.url()).searchParams.get('account_id')
    if (account?.includes('688ed674')) return undefined
    if (resource === 'investment_account_monthly' && hasHistory) return { json: [
      { valuation_date: '2026-11-01', value_cents: 9644000, cumulative_contributions_cents: 7820000 },
      { valuation_date: '2026-10-01', value_cents: 8580000, cumulative_contributions_cents: 7480000 },
      { valuation_date: '2026-09-01', value_cents: 7820000, cumulative_contributions_cents: 7200000 },
    ] }
    return investmentReply(resource)
  })
  await page.goto(new URL('/accounts', dashboard).href)
  const select = page.getByRole('combobox', { name: 'Select account' })
  await select.selectOption({ label: 'Investments (Invest)' })
  const hero = page.locator('.console-expanded-hero')
  await expect(hero.locator('.console-hero-amount')).toContainText('$96,440')
  await expect(hero.getByText(/Holdings appear here/)).toHaveCount(0)
  const fallback = hero.locator('.console-orb-value strong')
  await expect(fallback).toHaveText('$96,440')
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height })
    const padding = await fallback.evaluate(node => {
      const svg = node.closest('figure')!.querySelector('svg')!.getBoundingClientRect()
      const diameter = svg.width * 126 / 160
      const text = document.createRange()
      text.selectNodeContents(node)
      const { left, right, top, bottom } = text.getBoundingClientRect()
      const x = svg.left + svg.width / 2, y = svg.top + svg.height / 2
      return .5 - Math.max(x - left, right - x, y - top, bottom - y) / diameter
    })
    expect(padding, `inner-ring padding at ${width}px`).toBeGreaterThanOrEqual(.12)
    if (width === 1440) await capture(page, '09-investment-fallback')
  }
  await select.selectOption({ label: 'Empty fixture holding (Invest)' })
  await expect(hero.getByText(/Holdings appear here/)).toBeVisible()
  hasHistory = true
  await page.setViewportSize({ width: 1440, height: 900 })
  await select.selectOption({ label: 'Investments (Invest)' })
  const lines = hero.locator('.console-orb-line')
  await expect(lines).toHaveCount(2)
  await expect(fallback).toHaveCount(0)
  await expect(hero.locator('.console-orb figcaption')).toContainText('Investment value vs contributions')
  expect(await lines.first().getAttribute('points')).not.toBe(await lines.last().getAttribute('points'))
  await expect(page.getByText('Net contributions', { exact: true }).locator('..')).toContainText('$78,200.00')
  await expect(page.getByRole('region', { name: 'Value and contributions' })).toHaveCount(1)
  await capture(page, '09-investment-hero')
})

test('Rendered nested Console views, toasts and empty states use Australian sentence case', async ({ page }) => {
  let category = 'Groceries'
  await openConsole(page, (resource, request) => {
    if (resource === 'update-transaction-category') {
      category = request.postDataJSON().category
      return { json: { category, subcategory: null, edit_id: 'fixture-edit' } }
    }
    return investmentReply(resource)
  })
  const signedPositive = await page.locator('.console-activity-card [data-sign="positive"]').first()
    .evaluate(node => getComputedStyle(node).color)
  const hub = page.locator('.console-designed-scroll')
  async function check(root: Locator, name: string) {
    const report = await collectConsoleChrome(root)
    expect.soft(report.issues.casing, name).toEqual([])
    expect.soft(report.issues.spelling, name).toEqual([])
    expect.soft(report.issues.unsignedColour, name).toEqual([])
  }
  await page.goto(new URL('/income', dashboard).href)
  await page.getByRole('tab', { name: 'Strategic projections' }).click()
  const goals = page.getByText('Saved planning goals', { exact: true })
  await goals.scrollIntoViewIfNeeded()
  await capture(page, '10-projections-case')
  await check(hub, 'Strategic projections')

  await page.goto(new URL('/expenses', dashboard).href)
  await page.getByRole('tab', { name: 'Recurring hub' }).click()
  await expect(page.getByText('Annualised cash burn', { exact: true })).toBeVisible()
  await expect(page.getByText('No recurring series detected', { exact: true })).toHaveCount(3)
  const directory = page.getByText('Commitments directory', { exact: true })
  await directory.scrollIntoViewIfNeeded()
  await capture(page, '10-recurring-case')
  await check(hub, 'Recurring hub')
  await page.getByRole('tab', { name: 'Analytics' }).click()
  await page.locator('.console-hub-dock button[aria-haspopup="dialog"]').first().click()
  const picker = page.getByRole('dialog', { name: 'Select date range' })
  await expect(picker).toBeVisible()
  await capture(page, '10-date-case')
  await check(picker, 'Date range picker')

  await page.goto(new URL('/accounts', dashboard).href)
  await page.getByRole('combobox', { name: 'Select account' }).selectOption({ label: 'Investments (Invest)' })
  const price = page.getByRole('button', { name: 'Refresh price', exact: true })
  const investmentReturn = page.getByText('Investment return', { exact: true }).locator('..').locator('[data-sign="positive"]')
  await expect(investmentReturn).toHaveText(/^\+\$/)
  await expect(investmentReturn).toHaveCSS('color', signedPositive)
  await price.scrollIntoViewIfNeeded()
  await capture(page, '10-investment-case')
  await check(hub, 'Investment account')

  await page.getByRole('combobox', { name: 'Select account' }).selectOption({ label: 'Everyday (Liquid)' })
  await page.getByRole('region', { name: 'Account activity' }).getByRole('button', { name: /Market grocer/ }).first().click()
  const detail = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close transaction detail' }) })
  await expect(detail).toBeVisible()
  await capture(page, '10-detail-case')
  await check(detail, 'Transaction detail')
  await detail.evaluate(node => {
    const label = document.createElement('p')
    label.textContent = 'AUTHORED CAPS'
    node.appendChild(label)
  })
  expect((await collectConsoleChrome(detail)).issues.casing).toContain('AUTHORED CAPS')

  await detail.getByRole('combobox', { name: 'Transaction category' }).selectOption('Transport')
  await detail.getByRole('button', { name: 'Save correction' }).click()
  const toast = page.locator('[data-console-toast]')
  await expect(toast.getByText('Transaction updated', { exact: true })).toBeVisible()
  expect(category).toBe('Transport')
  await detail.getByRole('button', { name: 'Close transaction detail' }).click()
  await expect(detail).toHaveCount(0)
  await expect(toast.getByText('Milestone reached', { exact: true })).toHaveCSS('text-transform', 'none')
  await expect(toast).toHaveCSS('opacity', '1')
  await capture(page, '10-toast-case')
  await check(toast, 'Milestone toast')
})

test('Transaction detail aligns both selects and visibly fills the checked radio', async ({ page }) => {
  await openConsole(page)
  await page.goto(new URL('/accounts', dashboard).href)
  await page.getByRole('region', { name: 'Account activity' }).getByRole('button', { name: /Market grocer/ }).first().click()
  const detail = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close transaction detail' }) })
  const category = detail.getByRole('combobox', { name: 'Transaction category' })
  const subcategory = detail.getByRole('combobox', { name: 'Transaction subcategory' })
  await category.scrollIntoViewIfNeeded()
  await capture(page, '11-transaction-selects')
  const first = (await category.boundingBox())!
  const second = (await subcategory.boundingBox())!
  expect.soft(first.y).toBeCloseTo(second.y, 0)
  expect.soft(first.height).toBeCloseTo(second.height, 0)
  const current = detail.getByRole('radio', { name: /only this transaction/i })
  const merchant = detail.getByRole('radio', { name: /all matching past and future/i })
  const fill = (radio: Locator) => radio.evaluate(node => getComputedStyle(node, '::before').opacity)
  await expect(current).toBeChecked()
  await expect(merchant).not.toBeChecked()
  expect.soft(await fill(current)).toBe('1')
  expect.soft(await fill(merchant)).toBe('0')
  await expect(merchant).toBeEnabled({ timeout: 2500 })
  await merchant.check()
  await expect(current).not.toBeChecked()
  await expect(merchant).toBeChecked()
  expect.soft(await fill(current)).toBe('0')
  expect(await fill(merchant)).toBe('1')
})

test('Expenses transaction counts match the rendered rows before and after filtering', async ({ page }) => {
  await openConsole(page)
  await page.goto(new URL('/expenses', dashboard).href)
  const transactions = page.getByRole('region', { name: 'Transactions', exact: true })
  const rows = transactions.locator('.console-ledger-list > li')
  const count = transactions.getByText(/^Showing \d+ of \d+$/)
  const empty = transactions.getByText('No transactions match your filters.', { exact: true })
  await expect(rows).toHaveCount(6)
  await expect(count).toHaveText(`Showing ${await rows.count()} of 6`)
  await expect(empty).toHaveCount(0)
  await count.scrollIntoViewIfNeeded()
  await capture(page, '13-expense-transactions')

  const search = transactions.getByRole('textbox', { name: 'Search transactions' })
  await search.fill('Market grocer')
  await expect(rows).toHaveCount(2)
  await expect(count).toHaveText(`Showing ${await rows.count()} of 2`)
  await search.fill('No fixture merchant')
  await expect(rows).toHaveCount(0)
  await expect(count).toHaveText('Showing 0 of 0')
  await expect(empty).toBeVisible()
  const { casing, spelling } = (await collectConsoleChrome(empty)).issues
  expect({ casing, spelling }).toEqual({ casing: [], spelling: [] })
  await capture(page, '13-expense-empty')
})

test('Full effects masks particles behind each visible hero and signed figure', async ({ page }) => {
  await openConsole(page, investmentReply)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Effects tier' }).selectOption('full')
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(sections(page)).toBeVisible()
  for (const route of ['/dashboard', '/accounts']) {
    if (route === '/accounts') await openSection(page, 'Accounts')
    await expect(page).toHaveURL(new URL(route, dashboard).href)
    const particles = page.locator('.console-particles')
    await expect(particles).toHaveAttribute('data-particle-count', '55')
    const label = route === '/dashboard' ? 'home' : 'accounts'
    const hero = page.locator(route === '/dashboard' ? '.console-home .console-preview' : '.console-expanded-hero')
    await expect(hero).toHaveCSS('opacity', '1')
    await expect.poll(() => hero.evaluate(node => [node, ...node.querySelectorAll('.console-handoff')].every(part => {
      const transform = getComputedStyle(part).transform
      return transform === 'none' || new DOMMatrix(transform).isIdentity
    }))).toBe(true)
    await expect(page.locator('.console-hero-amount:visible')).toContainText('$')
    await capture(page, `12-particles-${label}`)
    await expect.soft(page.locator('.console-particle-mask')).not.toHaveCSS('mask-image', 'none', { timeout: 1500 })
    await expect.poll(() => particles.evaluate(node => {
      const viewport = node.closest('.console-viewport')!
      const paint = getComputedStyle(viewport.querySelector('.console-particle-mask')!)
      const sizes = paint.maskSize.split(',').map(size => size.trim().split(' ').map(parseFloat))
      const masks = paint.maskPosition.split(',').slice(1).map((position, index) => {
        const [x, y] = position.trim().split(' ').map(parseFloat)
        const [w, h] = sizes[index + 1]
        return { x, y, w, h }
      })
      const figures = [...viewport.querySelectorAll('.console-hero-amount, [data-sign]')].filter(figure => {
        const box = figure.getBoundingClientRect()
        return box.width && box.height && box.left >= 0 && box.top >= 0 && box.right <= innerWidth
          && box.bottom <= innerHeight && !figure.closest('[inert]')
      })
      return { multipleFigures: figures.length > 1, uncovered: figures.filter(figure => {
        const box = figure.getBoundingClientRect()
        const x = box.left + box.width / 2, y = box.top + box.height / 2
        return !masks.some(mask => x >= mask.x && x <= mask.x + mask.w && y >= mask.y && y <= mask.y + mask.h)
      }).map(node => node.getAttribute('data-sign') ?? 'hero') }
    })).toEqual({ multipleFigures: true, uncovered: [] })

    // Place a deliberately bright fixture sprite in the production mask layer.
    // The same sprite must paint in open space and disappear beneath a figure.
    const figure = route === '/dashboard' ? page.locator('.console-hero-amount:visible')
      : page.locator('.console-figures [data-sign]').first()
    const layer = page.locator('.console-particle-mask')
    const spriteDelta = async (x: number, y: number) => {
      const clip = { x, y, width: 8, height: 8 }
      const plain = await page.screenshot({ clip, animations: 'disabled', scale: 'css' })
      await layer.evaluate((node, { x, y }) => {
        const sprite = document.createElement('i')
        sprite.dataset.fixtureSprite = ''
        sprite.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:8px;height:8px;background:#ff00ff`
        node.append(sprite)
      }, clip)
      const trial = await page.screenshot({ clip, animations: 'disabled', scale: 'css' })
      await page.locator('[data-fixture-sprite]').evaluate(node => node.remove())
      return page.evaluate(async pictures => {
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
        const [plain, trial] = await Promise.all(pictures.map(async png => {
          const image = new Image()
          image.src = `data:image/png;base64,${png}`
          await image.decode()
          return image
        }))
        context.drawImage(plain, 0, 0)
        const baseline = context.getImageData(0, 0, 8, 8).data
        context.drawImage(trial, 0, 0)
        const pixels = context.getImageData(0, 0, 8, 8).data
        return Math.max(...pixels.map((channel, index) => Math.abs(channel - baseline[index])))
      }, [plain.toString('base64'), trial.toString('base64')])
    }
    expect(await spriteDelta(12, 12)).toBeGreaterThan(25)
    // Sample the protected point after the open-space control has painted.
    const box = (await figure.boundingBox())!
    expect(await spriteDelta(Math.floor(box.x + box.width / 2) - 4, Math.floor(box.y + box.height / 2) - 4)).toBeLessThan(3)
    if (route === '/accounts') {
      await page.getByRole('combobox', { name: 'Select account' }).selectOption({ label: 'Investments (Invest)' })
      const summary = page.getByRole('region', { name: 'Example index fund' })
      await expect(summary).toHaveCSS('opacity', '1')
      const investmentReturn = summary.getByText('Investment return', { exact: true }).locator('..').locator('.tabular-nums')
      await investmentReturn.scrollIntoViewIfNeeded()
      await expect(investmentReturn).toBeInViewport({ ratio: 1 })
      const investmentBox = (await investmentReturn.boundingBox())!
      expect(await spriteDelta(Math.floor(investmentBox.x + investmentBox.width / 2) - 4,
        Math.floor(investmentBox.y + investmentBox.height / 2) - 4)).toBeLessThan(3)
    }
  }
})

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { collectConsoleChrome } from './fixtures/console-leftovers'
import { workflowReplies } from './fixtures/console-workflow-replies'
import { dashboard, signInForConsole } from './fixtures/console-review'

const sections = (page: Page) => page.getByRole('toolbar', { name: 'Sections' })

async function openConsole(page: Page, override?: Parameters<typeof signInForConsole>[3]) {
  await signInForConsole(page, true, undefined, override)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(sections(page)).toBeVisible()
}

async function capture(page: Page, name: string) {
  const directory = process.env.CONSOLE_OWNER_CAPTURE_DIR
  if (!directory || test.info().project.name !== 'WebKit') return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: resolve(directory, `${name}.jpg`), quality: 83, animations: 'disabled' })
}

async function fitsInHome(item: Locator) {
  await expect(item).toBeFocused()
  await expect.poll(() => item.evaluate(node => {
    const item = node.getBoundingClientRect()
    const home = node.closest('.console-home')!.getBoundingClientRect()
    return {
      top: Math.max(0, Math.floor(home.top - item.top)), bottom: Math.max(0, Math.floor(item.bottom - home.bottom)),
      left: Math.max(0, Math.floor(home.left - item.left)), right: Math.max(0, Math.floor(item.right - home.right)),
    }
  }), { message: `Clipped focused item ${await item.innerText()} at ${JSON.stringify(item.page().viewportSize())}`, timeout: 2500 })
    .toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
}

test('Home keeps its hero clear and every card reachable at high zoom', async ({ page }) => {
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
  await openConsole(page)
  for (const route of ['/dashboard?hub=overview', '/accounts', '/income', '/expenses']) {
    await page.goto(new URL(route, dashboard).href)
    const scroll = page.locator('.console-designed-scroll')
    const hero = scroll.locator('.console-expanded-hero')
    await expect(hero).toHaveCSS('opacity', '1')
    const end = Math.max(90, await hero.evaluate(node => node.offsetHeight) - 26)
    const collisions = []
    for (let step = 0; step <= 20; step++) {
      const progress = step / 20
      const overlap = await scroll.evaluate(async (node, top) => {
        node.scrollTop = top
        // Let the scroll event and Framer Motion's render pass settle.
        for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame)
        const hero = node.querySelector<HTMLElement>('.console-expanded-hero')!
        const dock = node.querySelector('.console-hub-dock')!
        const style = getComputedStyle(hero)
        const clipTop = parseFloat(style.clipPath.match(/^inset\(([-\d.]+)px/)?.[1] ?? '0')
        const edge = clipTop ? hero.getBoundingClientRect().top + clipTop : -Infinity
        return [...hero.querySelectorAll('h1, p, dt, dd')].filter(text => {
          if (+style.opacity <= .01) return false
          const range = document.createRange()
          range.selectNodeContents(text)
          return [...range.getClientRects()].some(box =>
            box.bottom > Math.max(edge, dock.getBoundingClientRect().top) + 1
            && Math.max(edge, box.top) < dock.getBoundingClientRect().bottom - 1)
        }).map(text => text.className || text.tagName)
      }, step === 0 ? 0 : Math.round(20 + progress * end))
      if (route === '/income' && step === 5) await capture(page, '02-expanded-dock')
      if (overlap.length) collisions.push({ progress, overlap })
    }
    expect.soft(collisions, route).toEqual([])
    await expect(scroll).toHaveAttribute('data-hero-state', 'compact')
  }
})

test('Start does not reappear after a null token refresh or a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openConsole(page)
  await page.evaluate(() => localStorage.setItem('halcyon-console-preferences', JSON.stringify({ startScreen: true })))
  await page.reload()
  const start = page.getByRole('button', { name: 'Start Halcyon' })
  await start.click()
  await expect(sections(page)).toBeVisible()

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
  await expect(start.or(sections(page))).toBeVisible()
  await capture(page, '03-start-refresh')
  await expect.soft(start).toHaveCount(0, { timeout: 1500 })
  await page.reload()
  await expect.soft(start).toHaveCount(0, { timeout: 1500 })
  // Proceed through the baseline prompt too, to check explicit sign-out independently.
  if (await start.isVisible()) await start.click()
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
    await expect.soft(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 1500 })
    await expect.soft(chip).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect.soft(chip).toHaveCSS('color', 'rgb(10, 13, 22)', { timeout: 1500 })
  }
})

test('Budget distinguishes disabled, unreachable and failed save states', async ({ page }) => {
  const fixture = workflowReplies()
  let denied = true
  await openConsole(page, (resource, request, fallback) => {
    if (resource === 'query-budget' && denied) return { status: 403, json: { error: 'denied' } }
    if (resource === 'manage-budget') return { status: 422, json: { message: 'The fixture rejected this change.' } }
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
  await expect(unavailable).toBeVisible()
  await unavailable.scrollIntoViewIfNeeded()
  await capture(page, '06-budget-save')
  await expect.soft(unavailable).toContainText('Budget changes could not be saved.', { timeout: 1500 })
  await expect(page.getByText(/Your edits are still here/)).toBeVisible()
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
    const ring = getComputedStyle(input.parentElement!).boxShadow
    return { difference: Math.max(...rows) - Math.min(...rows), ring }
  })
  expect.soft(dimensions.difference).toBeLessThan(1)
  expect(dimensions.ring).toMatch(/0px 0px 0px 3px.*0px 0px 0px 6px/)
})

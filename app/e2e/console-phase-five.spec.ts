import AxeBuilder from '@axe-core/playwright'
import { chromium, expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { auditConsoleChrome } from './fixtures/console-leftovers'
import { dashboard, signInForConsole } from './fixtures/console-review'
import { workflowReplies } from './fixtures/console-workflow-replies'

const sectionRow = (page: Page) => page.getByRole('toolbar', { name: 'Sections' })
const tile = (page: Page, name: string) => sectionRow(page).getByRole('button', { name, exact: true })
const activeLayer = (page: Page) => page.locator('.console-route-layer:not([inert])')
const shell = (page: Page) => page.locator('.console-viewport')
const quickCentre = (page: Page) => page.getByRole('button', { name: 'Control Centre', exact: true })
const centre = (page: Page) => page.getByRole('dialog', { name: 'Control Centre' })
const longMerchant = 'Market Grocer and Kitchen Supplies at the Northern Harbour Terminal'
const routes = [
  ['dashboard?hub=overview', 'Overview', 'Cumulative net worth'],
  ['accounts', 'Accounts', 'Balance history'],
  ['income', 'Income', 'Cash flow pacing'],
  ['expenses', 'Expenses', 'Spending over time'],
  ['budget', 'Budget', 'Spending estimate unavailable'],
  ['ledger', 'Ledger review', 'Ledger transactions'],
  ['ingestion', 'Ingestion', 'Import into'],
  ['transfers', 'Transfers', 'How decisions work'],
  ['settings', 'Settings', 'Effects tier'],
] as const

test.describe.configure({ mode: 'parallel' })

async function openConsole(page: Page) {
  const fixture = workflowReplies()
  await signInForConsole(page, true, undefined, (resource, request, body) => {
    const reply = fixture.reply(resource, request, body)
    const payload = reply?.json ?? body
    const rename = (row: { merchant?: string }) => row.merchant === 'Market grocer' ? { ...row, merchant: longMerchant } : row
    if (resource === 'reporting_transaction_lines' && Array.isArray(payload)) return { ...reply, json: payload.map(rename) }
    if (resource === 'ledger_page' && payload && typeof payload === 'object' && 'rows' in payload && Array.isArray(payload.rows)) {
      return { ...reply, json: { ...payload, rows: payload.rows.map(rename) } }
    }
    return reply
  })
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(sectionRow(page)).toBeVisible()
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
}

async function capture(page: Page, label: string) {
  const base = process.env.CONSOLE_QUALIFICATION_CAPTURE_DIR
  if (!base) return
  const project = test.info().project.name === 'Phone' ? 'phone-' : ''
  const directory = resolve(base, project + test.info().titlePath.slice(1).join(' ').replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase())
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: resolve(directory, label + '.jpg'), quality: 85, animations: 'disabled' })
}

async function scan(page: Page, root: Locator, label: string) {
  await expect(root).toBeVisible()
  await expect.poll(() => root.evaluate(node => {
    const layers = [node, ...node.querySelectorAll('.console-workflow-hub,.workflow-surface')]
    return layers.every(element => Number(getComputedStyle(element).opacity) >= .999)
  })).toBe(true)
  const dimensions = await root.evaluate(node => {
    const scroller = node.matches('.console-designed-scroll') ? node : node.querySelector('.console-hub-scroll')
    return { viewport: innerWidth, document: document.documentElement.scrollWidth,
      inside: scroller ? scroller.scrollWidth - scroller.clientWidth : 0 }
  })
  expect.soft(dimensions.document - dimensions.viewport, label + ' page overflow').toBeLessThanOrEqual(1)
  expect.soft(dimensions.inside, label + ' sheet overflow').toBeLessThanOrEqual(1)
  await auditConsoleChrome(root, label)
  await capture(page, label)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  if (results.violations.length) {
    await test.info().attach(label + ' axe violations', {
      body: JSON.stringify(results.violations, null, 2), contentType: 'application/json',
    })
    console.log(label + ' axe', results.violations.map(({ id, nodes }) => ({ id, first: nodes[0].failureSummary })))
  }
  expect.soft(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })), label + ' axe').toEqual([])
}

async function matrix(page: Page, touch: boolean) {
  const activate = (locator: Locator) => touch ? locator.tap() : locator.click()
  await openConsole(page)
  const home = page.locator('.console-home')
  await tile(page, 'Overview').press('ArrowLeft')
  await scan(page, home, 'home-first-tile')
  const anchor = async () => home.locator('.console-track').evaluate(node => {
    const { x, y, height } = node.getBoundingClientRect()
    return { x, y, height }
  })
  const initial = await anchor()
  const names = ['Accounts', 'Income', 'Expenses', 'Budget']
  for (const name of names) {
    if (touch) await tile(page, name).tap()
    else await page.keyboard.press('ArrowRight')
    await expect(tile(page, name)).toHaveAttribute('aria-pressed', 'true')
  }
  // Re-enter the roving tab stop so the same audit also checks the touch-selected tile.
  if (touch) await tile(page, 'Budget').press('ArrowRight')
  await expect(tile(page, 'Budget').locator('[data-layer="edge"]')).toHaveCSS('opacity', '1')
  expect(await anchor()).toEqual(initial)
  await scan(page, home, 'home-last-tile')
  const back = () => activeLayer(page).getByRole('button', { name: 'Back to Home' })
  if (touch) {
    await tile(page, 'Budget').tap()
    await expect(page).toHaveURL(dashboard)
    await tile(page, 'Budget').tap()
  } else await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/budget$/)
  await activate(back())
  await expect(tile(page, 'Budget')).toBeFocused()
  await quickCentre(page).focus()
  if (touch) await quickCentre(page).tap()
  else await page.keyboard.press('Enter')
  const close = centre(page).getByRole('button', { name: 'Close Control Centre' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(centre(page).getByRole('button', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await scan(page, centre(page), 'control-centre')
  if (touch) await close.tap()
  else await page.keyboard.press('Escape')
  await expect(centre(page)).toHaveCount(0)
  await expect(quickCentre(page)).toBeFocused()

  for (const [path, title, ready] of routes) {
    await page.goto(new URL('/' + path, dashboard).href)
    const layer = activeLayer(page)
    const analysis = layer.locator('.console-designed-scroll')
    await expect(layer.getByRole('heading', { name: title, level: 1, exact: true }).first()).toBeVisible()
    if (ready === 'Import into' || ready === 'Effects tier') await expect(layer.getByRole('combobox', { name: ready })).toBeVisible()
    else if (ready === 'Ledger transactions') {
      await expect(layer.getByRole('list', { name: ready })).toBeVisible()
      await expect(layer.getByRole('button', { name: new RegExp(longMerchant) }).first()).toBeVisible()
    } else await expect(layer.getByRole('region', { name: ready })).toBeVisible()
    await back().focus()
    await scan(page, layer, title.toLowerCase().replaceAll(' ', '-'))
    if (await analysis.count()) {
      await analysis.evaluate(node => node.scrollTo(0, 650))
      await expect(analysis).toHaveAttribute('data-hero-state', 'compact')
      await scan(page, analysis, title.toLowerCase() + '-compact')
    }
    if (path !== 'settings') {
      if (touch) await back().tap()
      else await back().press('Enter')
      await expect(sectionRow(page)).toBeVisible()
    }
  }

  const settings = activeLayer(page)
  if (await page.evaluate(() => matchMedia('(forced-colors: active)').matches)) {
    const motion = settings.getByRole('switch', { name: 'Ambient motion' })
    const sound = settings.getByRole('switch', { name: 'Console sound', exact: true })
    await expect(motion).toHaveAttribute('aria-checked', 'true')
    await expect(sound).toHaveAttribute('aria-checked', 'false')
    const paint = (control: Locator) => control.locator('[data-switch-track]').evaluate(node => ({
      track: getComputedStyle(node).backgroundColor, thumb: getComputedStyle(node.firstElementChild!).backgroundColor,
    }))
    const on = await paint(motion)
    const off = await paint(sound)
    expect(on.track).not.toBe(on.thumb)
    expect(off.track).not.toBe(off.thumb)
    expect(on.track).not.toBe(off.track)
  }
  await activate(settings.getByRole('switch', { name: 'Show start screen' }))
  await page.goto(new URL('/', dashboard).href)
  const start = page.getByRole('dialog', { name: 'Halcyon start screen' })
  await expect(start.locator('.console-start-wide')).toHaveCSS('visibility', 'hidden')
  await scan(page, start, 'start')
  if (touch) await start.getByRole('button', { name: 'Start Halcyon' }).tap()
  else await page.keyboard.press('Enter')
  await expect(tile(page, 'Overview')).toBeFocused()
  await auditConsoleChrome(sectionRow(page), 'Home focus after start')
}

const sizes = [[320, 740], [390, 844], [768, 900], [1024, 900], [1440, 900]] as const
for (const [width, height] of sizes) {
  test.describe(width + 'px matrix', () => {
    const touch = width <= 768
    test.use({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 })
    test('all signed-in surfaces', async ({ page }, info) => {
      test.skip(info.project.name === 'Phone', 'The fixed viewport controls the input mode.')
      test.setTimeout(240_000)
      await matrix(page, touch)
    })
  })
}

test('200 percent browser zoom', async ({}, info) => {
  test.skip(info.project.name === 'Phone', 'Browser zoom uses a separate desktop profile.')
  test.setTimeout(240_000)
  const profile = await mkdtemp(resolve(tmpdir(), 'halcyon-chrome-zoom-'))
  try {
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome', viewport: null, args: ['--window-size=1440,900', '--force-device-scale-factor=1'],
      timezoneId: 'Australia/Sydney', serviceWorkers: 'block',
    })
    try {
      const settings = context.pages()[0]
      await settings.goto('chrome://settings/appearance')
      await settings.getByRole('combobox', { name: 'Page zoom' }).selectOption({ label: '200%' })
      const page = await context.newPage()
      await matrix(page, false)
      expect(await page.evaluate(() => ({ innerWidth, outerWidth, devicePixelRatio })))
        .toEqual({ innerWidth: 720, outerWidth: 1440, devicePixelRatio: 2 })
    } finally {
      await context.close()
    }
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
})

test('all signed-in surfaces in forced colours', async ({ page, hasTouch }) => {
  test.setTimeout(240_000)
  await page.emulateMedia({ forcedColors: 'active' })
  await matrix(page, !!hasTouch)
})

test('all signed-in surfaces with OS reduced motion', async ({ page, hasTouch }) => {
  test.setTimeout(240_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await matrix(page, !!hasTouch)
  await expect(shell(page)).toHaveAttribute('data-reduced', 'true')
  await expect(page.locator('.console-scene')).toHaveAttribute('data-static', 'true')
})

test('signed colours against section gradients and figure backgrounds', async ({ page }, info) => {
  test.skip(info.project.name === 'Phone', 'Sample the desktop Full scene consistently.')
  test.setTimeout(120_000)
  await openConsole(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Effects tier' }).selectOption('full')
  await page.goto(dashboard)
  await expect(shell(page)).toHaveAttribute('data-effects-tier', 'full')
  await tile(page, 'Overview').press('ArrowLeft')

  const signs = page.locator('.console-home [data-sign]')
  await expect(signs.filter({ hasText: /^\+/ }).first()).toBeAttached()
  await expect(signs.filter({ hasText: /^[-−]/ }).first()).toBeAttached()
  const scene = page.locator('.console-scene')
  const figure = '.console-home [data-sign], .console-home .console-hero-amount > span:not(.sr-only)'
  const findings: Record<string, { positive: number; negative: number; brightest: number; darkest: number }> = {}
  const style = await page.addStyleTag({ content: '/* Pixel samples */' })

  async function sample(label: string, isolatedGradient: boolean) {
    const ranges = isolatedGradient ? [] : await page.locator(figure).evaluateAll(elements => elements.flatMap(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return [...range.getClientRects()].map(({ top, left, bottom, right }) => ({ top, left, bottom, right }))
        .filter(box => box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight)
    }))
    if (!isolatedGradient) expect(ranges.length, label).toBeGreaterThan(0)
    await style.evaluate((node, rules) => { node.textContent = rules }, isolatedGradient
      ? '.console-topbar,.console-main { opacity:0 !important; } .console-light-plane,.console-ribbon-plane,.console-particles,.console-grain { visibility:hidden !important; }'
      : figure + ' { color:transparent !important; }')
    const screenshot = await page.screenshot({ scale: 'css' })
    findings[label] = await page.evaluate(async ({ png, ranges }) => {
      const picture = new Image()
      picture.src = 'data:image/png;base64,' + png
      await picture.decode()
      const canvas = document.createElement('canvas')
      canvas.width = picture.width
      canvas.height = picture.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const channel = (value: number) => {
        const v = value / 255
        return v < .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
      }
      const luminance = (r: number, g: number, b: number) => .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b)
      const swatch = (name: string) => {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name)
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        return luminance(r, g, b)
      }
      const positive = swatch('--color-console-pos')
      const negative = swatch('--color-console-neg')
      ctx.drawImage(picture, 0, 0)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const contrast = (a: number, b: number) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
      let minPositive = Infinity, minNegative = Infinity, darkest = 1, brightest = 0
      const areas = ranges.length ? ranges : [{ top: 0, left: 0, bottom: canvas.height, right: canvas.width }]
      for (const area of areas) {
        for (let y = Math.max(0, Math.floor(area.top)); y < Math.min(canvas.height, area.bottom); y++) {
          for (let x = Math.max(0, Math.floor(area.left)); x < Math.min(canvas.width, area.right); x++) {
            const offset = (y * canvas.width + x) * 4
            const l = luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2])
            minPositive = Math.min(minPositive, contrast(positive, l))
            minNegative = Math.min(minNegative, contrast(negative, l))
            brightest = Math.max(brightest, l)
            darkest = Math.min(darkest, l)
          }
        }
      }
      return { positive: minPositive, negative: minNegative, brightest, darkest }
    }, { png: screenshot.toString('base64'), ranges })
    await style.evaluate(node => { node.textContent = '' })
  }

  for (const [index, section] of ['dashboard', 'accounts', 'income', 'expenses', 'budget'].entries()) {
    if (index) {
      await page.keyboard.press('ArrowRight')
      await expect(scene).toHaveAttribute('data-section', section)
      await scene.evaluate(node => {
        const fades = node.getAnimations({ subtree: true }).filter((animation): animation is CSSTransition =>
          animation instanceof CSSTransition && animation.transitionProperty === 'opacity')
        if (fades.length !== 2) throw Error('Both section opacity transitions should be active.')
        for (const fade of fades) {
          fade.pause()
          fade.currentTime = Number(fade.effect!.getTiming().duration) / 2
        }
      })
      await sample(section + ' cross-fade · gradient', true)
      await sample(section + ' cross-fade · figure backgrounds', false)
      await scene.evaluate(node => {
        for (const fade of node.getAnimations({ subtree: true })) {
          if (fade instanceof CSSTransition && fade.transitionProperty === 'opacity') fade.finish()
        }
      })
    }
    await expect(page.locator('.console-preview')).toHaveCSS('opacity', '1')
    await sample(section + ' · gradient', true)
    await sample(section + ' · figure backgrounds', false)
  }
  console.log('Signed figure contrast', JSON.stringify(findings))
  await info.attach('signed-contrast', { body: JSON.stringify(findings, null, 2), contentType: 'application/json' })
  for (const [label, result] of Object.entries(findings)) {
    expect.soft(result.positive, label + ' positive').toBeGreaterThanOrEqual(4.5)
    expect.soft(result.negative, label + ' negative').toBeGreaterThanOrEqual(4.5)
  }
})

test('OS reduction and the in-app tier work independently and together', async ({ page }) => {
  await openConsole(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const tier = page.getByRole('combobox', { name: 'Effects tier' })
  const scene = page.locator('.console-scene')
  const particles = scene.locator('.console-particles')
  await tier.selectOption('full')
  await expect(particles).toHaveAttribute('data-particle-count', '55')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(scene).toHaveAttribute('data-static', 'true')
  await expect(scene.locator('.console-beam')).toHaveCSS('animation-name', 'none')
  const staticParticles = await particles.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await particles.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(staticParticles)
  await tier.selectOption('reduce')
  await expect(particles).toHaveCount(0)
  await expect(scene.locator('.console-beam')).toHaveCSS('filter', 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(scene).toHaveAttribute('data-static', 'true')
  await expect(particles).toHaveCount(0)
  await tier.selectOption('balanced')
  await expect(scene).toHaveAttribute('data-static', 'false')
  await expect(particles).toHaveAttribute('data-particle-count', '20')
})

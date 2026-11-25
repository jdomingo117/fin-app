import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
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

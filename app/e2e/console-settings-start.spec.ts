import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { auditConsoleChrome } from './fixtures/console-leftovers'
import { dashboard, signInForConsole } from './fixtures/console-review'

const layer = (page: Page) => page.locator('.console-route-layer:not([inert])')
const topbar = (page: Page) => page.locator('.console-topbar')
const sections = (page: Page) => page.getByRole('toolbar', { name: 'Sections' })
const settings = (page: Page) => topbar(page).getByRole('button', { name: 'Settings' })
const start = (page: Page) => page.getByRole('dialog', { name: 'Halcyon start screen' })

async function capture(page: Page, name: string) {
  const directory = process.env.CONSOLE_WORKFLOW_CAPTURE_DIR
  if (!directory) return
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: resolve(directory, `${page.viewportSize()?.width}-${name}.jpg`), quality: 89 })
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
}

async function openConsole(page: Page) {
  await signInForConsole(page)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(sections(page)).toBeVisible()
}

test('Settings applies, persists and reflects preferences across appearances', async ({ page }, testInfo) => {
  await openConsole(page)
  await capture(page, 'home-settings-entry')
  await settings(page).click()
  await expect(layer(page).getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(1)
  const effects = page.getByRole('combobox', { name: 'Effects tier' })
  await expect(effects).toHaveValue('')
  await expect(layer(page)).toHaveCSS('opacity', '1')
  await auditConsoleChrome(layer(page), 'Settings opening')
  await axe(page)
  await capture(page, 'settings')
  if (testInfo.project.name === 'Desktop' && process.env.CONSOLE_WORKFLOW_CAPTURE_DIR) {
    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(layer(page).locator('.console-settings-preferences')).toBeVisible()
      expect(await layer(page).locator('.console-settings-preferences').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await capture(page, 'settings')
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  if (testInfo.project.name === 'Desktop') {
    // Match the CSS dimensions of a 1440×900 window at 200% browser zoom.
    const viewport = page.viewportSize()!
    await page.setViewportSize({ width: 720, height: 450 })
    await expect(effects).toBeVisible()
    expect(await layer(page).locator('.console-settings-preferences').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await capture(page, 'settings-200-percent')
    await page.setViewportSize(viewport)
  }
  await page.emulateMedia({ forcedColors: 'active' })
  await effects.focus()
  await expect(effects).toHaveCSS('outline-style', 'solid')
  await expect(effects).toHaveCSS('outline-width', '2px')
  await page.emulateMedia({ forcedColors: null })

  await effects.selectOption('balanced')
  await expect(page.locator('.console-viewport')).toHaveAttribute('data-effects-tier', 'balanced')
  await effects.selectOption('reduce')
  await expect(page.locator('.console-viewport')).toHaveAttribute('data-effects-tier', 'reduce')
  const sound = page.getByRole('switch', { name: 'Console sound', exact: true })
  const music = page.getByRole('switch', { name: 'Ambient music' })
  const mute = page.getByRole('switch', { name: 'Mute sound and music' })
  const volume = page.getByRole('slider', { name: 'Master volume' })
  const shortcut = page.getByRole('switch', { name: 'Control Centre keyboard shortcut (C)' })
  await expect(volume).toHaveValue('55')
  await expect(music).toHaveAttribute('aria-checked', 'false')
  await expect(mute).toBeDisabled()
  await sound.click()
  await music.click()
  await mute.click()
  await expect(music).toHaveAttribute('aria-checked', 'true')
  await expect(topbar(page).getByRole('button', { name: 'Unmute Console sound' })).toBeVisible()
  await volume.press('Home')
  await expect(volume).toHaveValue('0')
  await shortcut.click()
  await page.keyboard.press('c')
  await expect(page.getByRole('dialog', { name: 'Control Centre' })).toHaveCount(0)
  await auditConsoleChrome(layer(page), 'Settings changed')
  await volume.scrollIntoViewIfNeeded()
  await capture(page, 'settings-sound')
  await page.reload()
  await expect(effects).toHaveValue('reduce')
  await expect(volume).toHaveValue('0')
  await expect(mute).toHaveAttribute('aria-checked', 'true')
  await expect(music).toHaveAttribute('aria-checked', 'true')
  await expect(shortcut).toHaveAttribute('aria-checked', 'false')
  await layer(page).getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'console')
  await page.getByRole('button', { name: 'Switch to Console' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'console')
  await expect(effects).toHaveValue('reduce')
  await expect(music).toHaveAttribute('aria-checked', 'true')
})

test('signed-in Landing starts Home once and preserves direct entry', async ({ page }, testInfo) => {
  await openConsole(page)
  await settings(page).click()
  await page.getByRole('switch', { name: 'Show start screen' }).click()
  await layer(page).getByRole('button', { name: 'Back to Home' }).click()
  await expect(sections(page)).toBeVisible()
  await expect(start(page)).toHaveCount(0)
  await page.goto(new URL('/', dashboard).href)
  await expect(start(page)).toBeVisible()
  await expect(page.locator('.console-home')).toHaveCount(0)
  const action = start(page).getByRole('button', { name: 'Start Halcyon' })
  await expect(action).toBeFocused()
  await auditConsoleChrome(start(page), 'Landing start prompt')
  await axe(page)
  await capture(page, 'start')
  if (testInfo.project.name === 'Phone') await action.tap()
  else await page.keyboard.press('Enter')
  await expect(start(page)).toHaveAttribute('data-leaving', 'true')
  await expect(page.locator('.console-home')).toHaveCount(0)
  await expect(page).toHaveURL(dashboard)
  await expect(sections(page).getByRole('button', { name: 'Overview', exact: true })).toBeFocused()
  await capture(page, 'home-after-start')
  await topbar(page).getByRole('button', { name: 'Console', exact: true }).click()
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(sections(page)).toBeVisible()
  await expect(start(page)).toHaveCount(0)

  await page.goto(new URL('/accounts', dashboard).href)
  await expect(page.getByRole('heading', { name: 'Accounts hub' })).toBeVisible()
  await expect(start(page)).toHaveCount(0)
  await layer(page).getByRole('button', { name: 'Back to Home' }).click()
  await expect(sections(page)).toBeVisible()
  await expect(start(page)).toHaveCount(0)

  await settings(page).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(start(page)).toHaveCount(0)
})

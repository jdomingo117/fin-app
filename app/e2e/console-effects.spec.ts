import { expect, test, type Page } from '@playwright/test'
import { dashboard, signInForConsole } from './fixtures/console-review'

const centreName = 'Control Centre'
const soundName = (action: 'Enable' | 'Mute' | 'Unmute') => `${action} Console sound`

async function switchToConsole(page: Page) {
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: 'Sections' })).toBeVisible()
}

async function startCountingContexts(page: Page) {
  await page.addInitScript(() => {
    let contexts = 0
    const NativeContext = window.AudioContext
    Object.defineProperty(window, 'AudioContext', {
      value: class extends NativeContext {
        constructor(options?: AudioContextOptions) {
          super(options)
          contexts++
          document.documentElement.dataset.reviewAudioContexts = String(contexts)
        }
      },
    })
  })
}

test('ambient layers pause underneath Control Centre and Reduce effects survives reload', async ({ page }) => {
  await signInForConsole(page)
  await switchToConsole(page)
  const scene = page.locator('.console-scene')
  await expect(scene.locator('.console-particles')).toHaveAttribute('data-particle-count', '55')
  await expect(scene.locator('.console-ribbon')).toHaveCount(4)
  await expect(scene.locator('.console-light-circles')).toHaveAttribute('data-light-count', '9')
  await expect(scene.locator('.console-beam')).toHaveCSS('animation-play-state', 'running')
  await page.getByRole('button', { name: centreName, exact: true }).click()
  await expect(page.getByRole('dialog', { name: centreName })).toBeVisible()
  await expect(scene.locator('.console-beam')).toHaveCSS('animation-play-state', 'paused')
  await page.getByRole('button', { name: 'Close Control Centre' }).click()
  await expect(scene.locator('.console-beam')).toHaveCSS('animation-play-state', 'running')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Reduce effects' }).click()
  await expect(page.locator('.console-viewport')).toHaveAttribute('data-reduce-effects', 'true')
  await page.goto(dashboard)
  await expect(scene).toHaveAttribute('data-static', 'true')
  await expect(scene.locator('.console-particles')).toHaveCount(0)
  await expect(scene.locator('.console-beam')).toHaveCSS('filter', 'none')
  await expect(scene.locator('.console-rays')).toHaveCSS('animation-name', 'none')
})

test('sound is opt-in, waits for a gesture after reload and honors the OS preference', async ({ page }) => {
  await startCountingContexts(page)
  await signInForConsole(page)
  await switchToConsole(page)
  const document = page.locator('html')
  const soundButton = (action: 'Enable' | 'Mute' | 'Unmute') =>
    page.getByRole('button', { name: soundName(action), exact: true })
  await page.getByRole('button', { name: centreName, exact: true }).click()
  await page.getByRole('button', { name: 'Close Control Centre' }).click()
  await expect(document).not.toHaveAttribute('data-review-audio-contexts')
  await soundButton('Enable').click()
  await expect(document).toHaveAttribute('data-review-audio-contexts', '1')
  await soundButton('Mute').click()
  await expect(soundButton('Unmute')).toBeVisible()
  await soundButton('Unmute').click()
  await expect(soundButton('Mute')).toBeVisible()
  await page.reload()
  await expect(soundButton('Mute')).toBeVisible()
  await expect(document).not.toHaveAttribute('data-review-audio-contexts')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(soundButton('Enable')).toBeVisible()
  await expect(document).not.toHaveAttribute('data-review-audio-contexts')
  await soundButton('Enable').click()
  await expect(document).toHaveAttribute('data-review-audio-contexts', '1')
  await expect(soundButton('Mute')).toBeVisible()
})

test('the optional startup unlocks sound and music is separately selectable', async ({ page }) => {
  await startCountingContexts(page)
  await signInForConsole(page)
  await switchToConsole(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Show start screen' }).click()
  await page.getByRole('switch', { name: 'Console sound', exact: true }).click()
  await page.goto(dashboard)
  const intro = page.getByRole('dialog', { name: 'Halcyon start screen' })
  await expect(intro).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-review-audio-contexts')
  await expect(page.locator('.console-scene')).toHaveAttribute('data-paused', 'true')
  await page.keyboard.press('Enter')
  await expect(intro).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-review-audio-contexts', '1')
  await expect(page.locator('.console-scene')).toHaveAttribute('data-paused', 'false')
  await page.getByRole('button', { name: centreName, exact: true }).click()
  const music = page.getByRole('button', { name: 'Ambient music', exact: true })
  await expect(music).toHaveAttribute('aria-pressed', 'false')
  await music.click()
  await expect(music).toHaveAttribute('aria-pressed', 'true')
})

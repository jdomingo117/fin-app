import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { dashboard, signInForConsole } from './fixtures/console-review'

const sections = (page: Page) => page.getByRole('toolbar', { name: 'Sections' })
const settings = (page: Page) => page.locator('.console-topbar').getByRole('button', { name: 'Settings' })
const trigger = (page: Page) => page.getByRole('button', { name: 'Control Centre', exact: true })
const centre = (page: Page) => page.getByRole('dialog', { name: 'Control Centre' })

async function openConsole(page: Page) {
  await signInForConsole(page)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(sections(page)).toBeVisible()
}

test('Control Centre is full width, traps focus and restores the keyboard opener', async ({ page, hasTouch }) => {
  await openConsole(page)
  const overview = sections(page).getByRole('button', { name: 'Overview' })
  await overview.focus()
  await page.keyboard.press('Shift+C')
  await expect(centre(page)).toHaveCount(0)
  await page.keyboard.press('c')
  const dialog = centre(page)
  await expect(dialog).toBeVisible()
  const closeButton = dialog.getByRole('button', { name: 'Close Control Centre' })
  const lastAction = dialog.getByRole('button', { name: 'Sign out' })
  await expect(closeButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(lastAction).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(closeButton).toBeFocused()
  const attention = dialog.getByRole('group', { name: 'Attention cards' })
  await page.keyboard.press('Tab')
  await expect(attention.getByRole('button', { name: /Ledger review/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(attention.getByRole('button', { name: /Transfers/ })).toBeFocused()
  const sheet = dialog.locator('.console-centre-sheet')
  expect(await sheet.evaluate(node => node.getBoundingClientRect().width)).toBe(page.viewportSize()?.width)
  if (hasTouch) await expect(lastAction.locator('span')).toHaveCSS('opacity', '1')
  const audit = await new AxeBuilder({ page }).include('.console-centre')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(audit.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) }))).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(overview).toBeFocused()
  await trigger(page).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('c')
  await expect(dialog).toHaveCount(0)
  await expect(trigger(page)).toBeFocused()
})

test('C ignores text entry and other modals, and its preference persists', async ({ page }) => {
  await openConsole(page)
  await settings(page).click()
  await page.getByRole('button', { name: 'Edit callsign' }).click()
  const edit = page.getByRole('textbox', { name: 'Callsign' })
  await edit.press('End')
  await edit.press('c')
  await expect(edit).toHaveValue('Reviewerc')
  await expect(centre(page)).toHaveCount(0)
  await edit.press('Escape')
  await page.evaluate(() => {
    const other = document.createElement('dialog')
    other.id = 'review-other-native-dialog'
    const button = document.createElement('button')
    button.textContent = 'Other dialog action'
    other.append(button)
    document.body.append(other)
    other.showModal()
  })
  await page.keyboard.press('c')
  await expect(centre(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.querySelector('#review-other-native-dialog')?.remove())
  const preference = page.getByRole('switch', { name: 'Control Centre keyboard shortcut (C)' })
  await preference.click()
  await expect(preference).not.toBeChecked()
  await page.goto(dashboard)
  await expect(sections(page)).toBeVisible()
  await page.keyboard.press('c')
  await expect(centre(page)).toHaveCount(0)
  await expect(trigger(page)).not.toHaveAttribute('aria-keyshortcuts')
  await trigger(page).click()
  await expect(centre(page)).toBeVisible()
})

test('the focused silhouette keeps a painted base during rapid focus changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openConsole(page)
  const overview = sections(page).getByRole('button', { name: 'Overview' })
  const accounts = sections(page).getByRole('button', { name: 'Accounts' })
  await expect(accounts.locator('.console-tile-active')).toHaveCSS('opacity', '0')
  await overview.focus()
  await accounts.evaluate(tile => {
    const rest = tile.querySelector('.console-tile-rest')!
    const active = tile.querySelector('.console-tile-active')!
    // Attach before the keypress and sample the actual CSS transition at
    // fixed times. Runner load cannot cause a missed animation window.
    const samples = new Promise<{ gradient: boolean; incoming: number; combined: number }[]>(resolve => {
      active.addEventListener('transitionrun', async () => {
        const transition = active.getAnimations().find(animation =>
          animation instanceof CSSTransition && animation.transitionProperty === 'opacity')
        const duration = Number(transition?.effect?.getTiming().duration)
        if (!transition || !duration) return resolve([])
        transition.pause()
        const frames = []
        for (const progress of [0.25, 0.5, 0.75]) {
          transition.currentTime = duration * progress
          await new Promise<number>(next => requestAnimationFrame(next))
          const under = getComputedStyle(rest)
          const over = getComputedStyle(active)
          frames.push({
            gradient: under.backgroundImage.startsWith('linear-gradient'),
            incoming: Number(over.opacity),
            combined: 1 - (1 - Number(under.opacity)) * (1 - Number(over.opacity)),
          })
        }
        transition.play()
        resolve(frames)
      }, { once: true })
      setTimeout(() => resolve([]), 5_000)
    })
    Reflect.set(tile, 'consolePaintSamples', samples)
  })
  await page.keyboard.press('ArrowRight')
  await expect(accounts).toBeFocused()
  const sampled = await accounts.evaluate(tile => Reflect.get(tile, 'consolePaintSamples') as
    Promise<{ gradient: boolean; incoming: number; combined: number }[]>)
  expect(sampled).toHaveLength(3)
  expect(sampled.some(sample => sample.incoming > 0 && sample.incoming < 1)).toBe(true)
  expect(sampled.every(sample => sample.gradient && sample.combined === 1)).toBe(true)
  await page.keyboard.press('ArrowLeft')
  await expect(overview).toBeFocused()
})

test('a low-core device defaults to Balanced and can force Full', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 4 }))
  await openConsole(page)
  const scene = page.locator('.console-scene')
  await expect(scene).toHaveAttribute('data-tier', 'balanced')
  await expect(scene.locator('.console-particles')).toHaveAttribute('data-particle-count', '20')
  await expect(scene.locator('.console-ribbon').first()).toHaveCSS('animation-name', 'none')
  await expect(scene.locator('.console-rays')).toHaveCSS('animation-play-state', 'running')
  await expect(scene.locator('.console-beam')).toHaveCSS('animation-play-state', 'running')
  await settings(page).click()
  const tiers = page.getByRole('combobox', { name: 'Effects tier' })
  await expect(tiers).toHaveValue('')
  await tiers.selectOption('full')
  await expect(scene).toHaveAttribute('data-tier', 'full')
  await expect(scene.locator('.console-particles')).toHaveAttribute('data-particle-count', '55')
  await page.goto(dashboard)
  await expect(scene).toHaveAttribute('data-tier', 'full')
})

test('the reduced startup uses a stable prompt and a 150ms fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openConsole(page)
  await settings(page).click()
  await page.getByRole('switch', { name: 'Show start screen' }).click()
  await page.goto(dashboard)
  const intro = page.getByRole('dialog', { name: 'Halcyon start screen' })
  const start = intro.getByRole('button', { name: 'Start Halcyon' })
  await expect(start).toHaveCSS('animation-name', 'none')
  const duration = await intro.evaluate(node => {
    const watching = new Promise<string>(resolve => {
      const observer = new MutationObserver(() => {
        if (node.getAttribute('data-leaving') !== 'true') return
        observer.disconnect()
        resolve(getComputedStyle(node).animationDuration)
      })
      observer.observe(node, { attributes: true, attributeFilter: ['data-leaving'] })
    })
    node.querySelector('button')!.click()
    return watching
  })
  expect(duration).toBe('0.15s')
  await expect(intro).toHaveCount(0)
  await expect(sections(page)).toBeVisible()
})

type AudioReviewWindow = Window & { readReviewPeak?: (milliseconds: number) => Promise<number> }

test('Master volume changes the live compressor output and zero silences it', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      const connected = Reflect.apply(connect, this, args)
      if (this instanceof DynamicsCompressorNode && args[0] instanceof AudioDestinationNode) {
        // Read consecutive audio buffers. Animation-frame snapshots can miss
        // the short attack on loaded CI runners.
        const probe = this.context.createScriptProcessor(2048, 2, 2)
        Reflect.apply(connect, this, [probe])
        Reflect.apply(connect, probe, [args[0]])
        ;(window as AudioReviewWindow).readReviewPeak = milliseconds => new Promise(resolve => {
          let peak = 0
          let frames = 0
          probe.onaudioprocess = event => {
            for (let channel = 0; channel < event.inputBuffer.numberOfChannels; channel++) {
              for (const value of event.inputBuffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(value))
            }
            frames += event.inputBuffer.length
            if (frames / event.inputBuffer.sampleRate * 1000 < milliseconds) return
            probe.onaudioprocess = null
            resolve(peak)
          }
        })
      }
      return connected
    } as typeof connect
  })
  await openConsole(page)
  await settings(page).click()
  const volume = page.getByRole('slider', { name: /Master volume/ })
  await expect(volume).toHaveValue('55')
  await page.getByRole('switch', { name: 'Console sound', exact: true }).click()
  async function sample(level: string) {
    await volume.fill(level)
    await expect(volume).toHaveValue(level)
    await page.waitForTimeout(3200) // Allow the 2.8-second reverb tail to finish.
    const peak = page.evaluate(() => (window as AudioReviewWindow).readReviewPeak!(1000))
    await trigger(page).click()
    const levelPeak = await peak
    await centre(page).getByRole('button', { name: 'Close Control Centre' }).click()
    await expect(centre(page)).toHaveCount(0)
    return levelPeak
  }
  const high = await sample('55')
  const low = await sample('15')
  const zero = await sample('0')
  await testInfo.attach('master-output-peaks', { body: JSON.stringify({ high, low, zero, differenceDb: 20 * Math.log10(low / high) }), contentType: 'application/json' })
  expect(high).toBeGreaterThan(.005)
  expect(low).toBeGreaterThan(.001)
  expect(low).toBeLessThan(high * .72)
  expect(zero).toBeLessThan(.0001)
})

test('Console navigation and sound preferences work without Web Audio', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'AudioContext', { value: undefined }))
  await openConsole(page)
  await page.getByRole('button', { name: 'Enable Console sound' }).click()
  await expect(page.getByRole('button', { name: 'Mute Console sound' })).toBeVisible()
  await trigger(page).click()
  await expect(centre(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(centre(page)).toHaveCount(0)
})

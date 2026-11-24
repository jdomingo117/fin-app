import { chromium } from 'playwright'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { dashboard, signInForConsole } from './fixtures/console-review.ts'
import { workflowReplies } from './fixtures/console-workflow-replies.ts'

const output = process.argv[2]
if (!output) throw new Error('Pass the output trace filename.')
const desktop = process.argv.includes('--desktop')
const headed = process.argv.includes('--headed')
const targets = process.argv.slice(3).filter(name => name !== '--desktop' && name !== '--headed')
if (!targets.length) targets.push('Accounts', 'Income', 'Expenses')
const quickActions = new Set(['Ledger review', 'Ingestion', 'Transfers', 'Settings'])
const workflows = targets.some(name => name === 'Budget' || quickActions.has(name))
const traceStartup = targets.includes('Landing')
const browser = await chromium.launch({ channel: 'chrome', headless: !headed })
const context = await browser.newContext({
  viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  isMobile: !desktop, hasTouch: !desktop, deviceScaleFactor: 1, serviceWorkers: 'block',
  timezoneId: 'Australia/Sydney',
})
const page = await context.newPage()
page.setDefaultTimeout(20_000)
const cdp = await context.newCDPSession(page)
const tile = name => page.getByRole('toolbar', { name: 'Sections' }).getByRole('button', { name, exact: true })
const mark = name => page.evaluate(name => performance.mark(name), 'console.proxy.' + name)
const events = []
const viewport = page.locator('.console-viewport')
const activeTier = desktop ? 'full' : 'balanced'
const back = page.getByRole('button', { name: 'Back to Home' })
const centre = page.getByRole('dialog', { name: 'Control Centre' })
const centreButton = page.getByRole('button', { name: 'Control Centre', exact: true })
const activate = locator => desktop ? locator.click() : locator.tap()
async function home() {
  await page.waitForURL(dashboard)
  await page.waitForFunction(() => {
    const current = document.querySelector('.console-route-layer:not([inert]) .console-preview')
    return current && getComputedStyle(current).opacity === '1'
  })
}
async function tier(tierName) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Effects tier' }).selectOption(tierName)
  await page.goto(dashboard)
  await home()
  if (await viewport.getAttribute('data-effects-tier') !== tierName) throw Error('Wrong effects tier.')
}
async function navigate() {
  for (const name of targets.filter(name => name !== 'Landing')) {
    if (quickActions.has(name)) {
      await activate(centreButton)
      await activate(centre.getByRole('group', { name: 'Quick actions' }).getByRole('button', { name, exact: true }))
    } else if (desktop) {
      await tile(name).focus()
      await page.keyboard.press('Enter')
    } else {
      const sections = ['Overview', 'Accounts', 'Income', 'Expenses', 'Budget']
      const target = tile(name)
      const selected = await page.locator('.console-section[data-active="true"]').getAttribute('aria-label')
      const from = sections.indexOf(selected)
      const to = sections.indexOf(name)
      if (from > to) {
        await tile(selected).focus()
        await page.keyboard.press('ArrowLeft')
        for (let index = from - 1; index > to; index--) await page.keyboard.press('ArrowLeft')
      }
      for (let index = from + 1; index <= to; index++) await tile(sections[index]).tap()
      if (from >= to) await target.tap()
      await activate(target)
    }
    await back.waitFor()
    const scroll = page.locator('.console-route-layer:not([inert])').locator('.console-designed-scroll, .console-workflow-hub .console-hub-scroll')
    await scroll.evaluate(node => node.scrollTo(0, 450))
    await page.waitForTimeout(180)
    await back.click()
    await home()
  }
  await activate(centreButton)
  await centre.waitFor()
  await page.keyboard.press('Escape')
  await centre.waitFor({ state: 'hidden' })
}
try {
  await signInForConsole(page, true, undefined, workflows ? workflowReplies().reply : undefined)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await home()
  // Warm Vite imports and the interaction path before collecting either lane.
  await navigate()
  if (!desktop) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  cdp.on('Tracing.dataCollected', part => events.push(...part.value))
  await cdp.send('Tracing.start', { categories:
    'toplevel,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,cc,viz,gpu' })
  for (const name of ['reduce', activeTier]) {
    await tier(name)
    await mark(name + '.start')
    if (desktop) {
      for (let step = 0; step < 40; step++) {
        const angle = step / 40 * Math.PI * 2
        await page.mouse.move(775 + Math.cos(angle) * 225, 360 + Math.sin(angle) * 90)
        await page.waitForTimeout(125)
      }
    } else {
      // Matched idle phone window. Touch keeps the pointer parallax centred.
      await page.waitForTimeout(5000)
    }
    await mark(name + '.end')
  }

  await mark('navigation.start')
  await tile('Overview').focus()
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) await page.keyboard.press(key)
  await page.waitForTimeout(420)
  await navigate()
  await mark('navigation.end')
  await mark('visibility.start')
  const other = await context.newPage()
  await other.bringToFront()
  await page.waitForTimeout(1000)
  const hiddenObserved = await page.evaluate(() => document.visibilityState === 'hidden')
  const hiddenPaused = await page.locator('.console-scene').getAttribute('data-paused')
  await page.bringToFront()
  await other.close()
  await page.waitForFunction(() =>
    document.visibilityState === 'visible' && document.querySelector('.console-scene')?.getAttribute('data-paused') === 'false')
  await mark('visibility.end')
  if (traceStartup) {
    await activate(page.getByRole('button', { name: 'Settings', exact: true }))
    await activate(page.getByRole('switch', { name: 'Show start screen' }))
    await page.goto(new URL('/', dashboard).href)
    const start = page.getByRole('button', { name: 'Start Halcyon' })
    await start.waitFor()
    await mark('startup.start')
    await activate(start)
    await home()
    await mark('startup.end')
  }
  const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.end')
  await complete
  // Foreground Chrome can produce more trace JSON than V8 can hold in one string.
  function* traceChunks() {
    yield '{"traceEvents":['
    for (let first = 0; first < events.length; first += 10_000) {
      if (first) yield ','
      yield JSON.stringify(events.slice(first, first + 10_000)).slice(1, -1)
    }
    yield ']}'
  }
  await pipeline(Readable.from(traceChunks()), createGzip(), createWriteStream(output))

  const marks = new Map(events.filter(event => event.name?.startsWith('console.proxy.')).map(event => [event.name, event]))
  const threads = new Map(events.filter(event => event.name === 'thread_name')
    .map(event => [`${event.pid}:${event.tid}`, event.args?.name]))
  const threadNames = new Set(['CrRendererMain', 'Compositor', 'VizCompositorThread', 'CrGpuMain'])
  function windowEvents(name) {
    const start = marks.get('console.proxy.' + name + '.start')
    const end = marks.get('console.proxy.' + name + '.end')
    if (!start || !end) throw Error('Missing trace marks for ' + name)
    const tasks = events.filter(event => event.name === 'RunTask' && event.ph === 'X' && event.dur
      && event.ts >= start.ts && event.ts < end.ts)
    return { start, end, tasks }
  }
  function perFrame(name, frameDuration = 1_000_000 / 60) {
    const { start, end, tasks } = windowEvents(name)
    const frames = Array(Math.floor((end.ts - start.ts) / frameDuration)).fill(0)
    const parentEnds = new Map()
    const wallTimeLanes = new Set()
    for (const task of tasks.sort((a, b) => a.ts - b.ts || b.dur - a.dur || (b.tdur ?? 0) - (a.tdur ?? 0))) {
      const key = `${task.pid}:${task.tid}`
      const thread = threads.get(key)
      if (!threadNames.has(thread) || (['CrRendererMain', 'Compositor'].includes(thread) && task.pid !== start.pid)) continue
      if (task.ts + task.dur <= (parentEnds.get(key) ?? 0)) continue
      parentEnds.set(key, task.ts + task.dur)
      const cpu = task.tdur ?? task.dur
      if (task.tdur === undefined) wallTimeLanes.add(thread)
      const first = Math.floor((task.ts - start.ts) / frameDuration)
      const last = Math.min(frames.length - 1, Math.floor((task.ts + task.dur - start.ts) / frameDuration))
      for (let i = first; i <= last; i++) {
        const overlap = Math.min(task.ts + task.dur, start.ts + (i + 1) * frameDuration)
          - Math.max(task.ts, start.ts + i * frameDuration)
        frames[i] += Math.max(0, overlap) / task.dur * cpu / 1000
      }
    }
    frames.sort((a, b) => a - b)
    return {
      samples: frames.length,
      mean: frames.reduce((sum, value) => sum + value, 0) / frames.length,
      p95: frames[Math.ceil(frames.length * 0.95) - 1],
      hasWallTimeEstimate: wallTimeLanes.size > 0,
      wallTimeLanes: [...wallTimeLanes].sort(),
    }
  }
  const active = perFrame(activeTier)
  const reduce = perFrame('reduce')
  const activeStart = marks.get(`console.proxy.${activeTier}.start`).ts
  const activeEnd = marks.get(`console.proxy.${activeTier}.end`).ts
  function cadence(name) {
    const timestamps = [...new Set(events.filter(event => event.name === name
      && event.ts >= activeStart && event.ts < activeEnd).map(event => event.ts))].sort((a, b) => a - b)
    const deltas = timestamps.slice(1).map((ts, index) => ts - timestamps[index]).sort((a, b) => a - b)
    return deltas.length ? { frames: timestamps.length, medianMs: deltas[Math.floor(deltas.length / 2)] / 1000,
      p95Ms: deltas[Math.ceil(deltas.length * .95) - 1] / 1000 } : undefined
  }
  const displayLink = cadence('ExternalBeginFrameSourceMac::OnDisplayLinkCallback')
  const presentedCadence = cadence('Display::DrawAndSwap')
  const observedFrameDuration = displayLink?.medianMs ?? presentedCadence?.medianMs
  const atDisplayCadence = observedFrameDuration !== undefined ? {
    [activeTier]: perFrame(activeTier, observedFrameDuration * 1000),
    reduce: perFrame('reduce', observedFrameDuration * 1000),
  } : undefined
  const navigation = windowEvents('navigation')
  function longestMainTask(window) {
    return Math.max(0, ...window.tasks.filter(task => task.pid === window.start.pid && task.tid === window.start.tid)
      .map(task => task.dur / 1000))
  }
  console.log(JSON.stringify({
    browser: browser.version(), desktop, headed, [activeTier]: active, reduce,
    added: { mean: active.mean - reduce.mean, p95: active.p95 - reduce.p95 },
    displayLink, presentedCadence,
    ...(atDisplayCadence ? { atDisplayCadence: { ...atDisplayCadence, added: {
      mean: atDisplayCadence[activeTier].mean - atDisplayCadence.reduce.mean,
      p95: atDisplayCadence[activeTier].p95 - atDisplayCadence.reduce.p95,
    } } } : {}),
    longestNavigationMs: longestMainTask(navigation),
    hiddenObserved, hiddenPaused, visibleResumed: true,
    ...(traceStartup ? { longestStartupMs: longestMainTask(windowEvents('startup')) } : {}),
  }, null, 2))
} finally {
  await browser.close()
}

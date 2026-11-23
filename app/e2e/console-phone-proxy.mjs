import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { dashboard, signInForConsole } from './fixtures/console-review.ts'
import { workflowReplies } from './fixtures/console-workflow-replies.ts'

const output = process.argv[2]
if (!output) throw new Error('Pass the output trace filename.')
const targets = process.argv.slice(3)
if (!targets.length) targets.push('Accounts', 'Income', 'Expenses')
const quickActions = new Set(['Ledger review', 'Ingestion', 'Transfers'])
const workflows = targets.some(name => name === 'Budget' || quickActions.has(name))
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block',
  timezoneId: 'Australia/Sydney',
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const tile = name => page.getByRole('toolbar', { name: 'Sections' }).getByRole('button', { name, exact: true })
const mark = name => page.evaluate(name => performance.mark(name), 'console.proxy.' + name)
const events = []
const viewport = page.locator('.console-viewport')
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
try {
  await signInForConsole(page, true, undefined, workflows ? workflowReplies().reply : undefined)
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await home()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  cdp.on('Tracing.dataCollected', part => events.push(...part.value))
  await cdp.send('Tracing.start', { categories:
    'toplevel,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,cc,viz,gpu' })
  for (const name of ['reduce', 'balanced']) {
    await tier(name)
    await mark(name + '.start')
    // Matched idle phone window. Touch devices keep the pointer parallax centred.
    await page.waitForTimeout(5000)
    await mark(name + '.end')
  }

  await mark('navigation.start')
  const back = page.getByRole('button', { name: 'Back to Home' })
  const centre = page.getByRole('dialog', { name: 'Control Centre' })
  const centreButton = page.getByRole('button', { name: 'Control Centre', exact: true })
  for (const name of targets) {
    if (quickActions.has(name)) {
      await centreButton.tap()
      await centre.getByRole('group', { name: 'Quick actions' }).getByRole('button', { name, exact: true }).tap()
    } else {
      // On touch, Budget enters the visible track after browsing its neighbours.
      if (name === 'Budget') {
        for (const section of ['Accounts', 'Income', 'Expenses']) {
          await tile(section).tap()
          await page.waitForTimeout(480)
        }
      }
      const target = tile(name)
      await target.tap()
      await page.waitForTimeout(480)
      await target.tap()
    }
    await back.waitFor()
    const scroll = page.locator('.console-route-layer:not([inert])').locator('.console-designed-scroll, .console-workflow-hub .console-hub-scroll')
    await scroll.evaluate(node => node.scrollTo(0, 450))
    await page.waitForTimeout(180)
    await back.click()
    await home()
  }
  await centreButton.click()
  await centre.waitFor()
  await page.keyboard.press('Escape')
  await centre.waitFor({ state: 'hidden' })
  await mark('navigation.end')
  const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.end')
  await complete
  await writeFile(output, gzipSync(JSON.stringify({ traceEvents: events })))

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
  function perFrame(name) {
    const { start, end, tasks } = windowEvents(name)
    const frameDuration = 1_000_000 / 60
    const frames = Array(Math.floor((end.ts - start.ts) / frameDuration)).fill(0)
    const parentEnds = new Map()
    let hasWallTimeEstimate = false
    for (const task of tasks.sort((a, b) => a.ts - b.ts || b.dur - a.dur || (b.tdur ?? 0) - (a.tdur ?? 0))) {
      const key = `${task.pid}:${task.tid}`
      const thread = threads.get(key)
      if (!threadNames.has(thread) || (['CrRendererMain', 'Compositor'].includes(thread) && task.pid !== start.pid)) continue
      if (task.ts + task.dur <= (parentEnds.get(key) ?? 0)) continue
      parentEnds.set(key, task.ts + task.dur)
      const cpu = task.tdur ?? task.dur
      hasWallTimeEstimate ||= task.tdur === undefined
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
      hasWallTimeEstimate,
    }
  }
  const balanced = perFrame('balanced')
  const reduce = perFrame('reduce')
  const navigation = windowEvents('navigation')
  const longestNavigationMs = Math.max(0, ...navigation.tasks
    .filter(task => task.pid === navigation.start.pid && task.tid === navigation.start.tid).map(task => task.dur / 1000))
  console.log(JSON.stringify({
    balanced, reduce, added: { mean: balanced.mean - reduce.mean, p95: balanced.p95 - reduce.p95 }, longestNavigationMs,
  }, null, 2))
} finally {
  await browser.close()
}

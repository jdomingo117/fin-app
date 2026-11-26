import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { auditConsoleChrome } from './fixtures/console-leftovers'
import { dashboard, signInForConsole } from './fixtures/console-review'
import { workflowReplies } from './fixtures/console-workflow-replies'

// Phase 6B: Control Centre notices, Quiet alerts and Rest. Every case starts from the Console default.
const sectionRow = (page: Page) => page.getByRole('toolbar', { name: 'Sections' })
const tile = (page: Page, name: string) => sectionRow(page).getByRole('button', { name, exact: true })
const preview = (page: Page) => page.locator('.console-route-layer:not([inert]) .console-preview')
const trigger = (page: Page) => page.getByRole('button', { name: 'Control Centre', exact: true })
const centre = (page: Page) => page.getByRole('dialog', { name: 'Control Centre' })
const notices = (page: Page) => centre(page).getByRole('group', { name: 'Notices' })
const status = (page: Page) => centre(page).locator('[data-console-notices]')
const note = (page: Page) => centre(page).locator('[data-console-notice-note]')
const quick = (page: Page, name: string) => centre(page).getByRole('group', { name: 'Quick actions' }).getByRole('button', { name, exact: true })
const back = (page: Page) => page.locator('.console-route-layer:not([inert])').getByRole('button', { name: 'Back to Home' })
const everyday = '64ddbad1-3d5b-4840-a2c7-30192dc77993'
const goal = { id: '9d0f3b55-6a87-4d43-8f6e-2c9c5c0f4e11', name: 'Holiday fund' }

// A fictional monthly bill, last charged 28 October, so it's next expected on 28 November.
const bill = ['05', '06', '07', '08', '09', '10'].map((month, index) => ({
  parent_id: `fixture-bill-${index}`, allocation_id: null, position: 0, account_id: everyday, date: `2026-${month}-28`,
  merchant: 'Streaming service', merchant_key: 'streaming service', category: 'Entertainment', subcategory: null,
  amount: -1_999, kind: 'expense',
})).reverse()

const attention = (count: number) => ({
  items: [
    { key: 'bill_unmatched:internet', kind: 'bill_unmatched', label: 'Internet', gap_cents: null, available_cents: null,
      threshold_cents: 0, due_date: '2026-11-28', priority: 1, issue_hash: 'fixture-a', state: 'active', reopened: false,
      reopen_reason: null, until: null },
    { key: 'uncategorized', kind: 'uncategorized', label: 'Other spending', gap_cents: null, available_cents: null,
      threshold_cents: 0, due_date: null, priority: 2, count: 3, issue_hash: 'fixture-b', state: 'active', reopened: false,
      reopen_reason: null, until: null },
  ].slice(0, count),
  total: count, active_count: count, version: '1', as_of: '2026-11-22', editable: true, undo_operation_id: null, forecast_available: false,
})

type Signals = { ledger?: number; transfers?: number; budget?: number; bill?: boolean; goalReached?: boolean; failGoals?: boolean; failCallsign?: boolean }

/** Workflow fixtures with each notice source set to a known signal. */
function replies(signals: Signals = {}) {
  const workflow = workflowReplies()
  const reads: string[] = []
  function reply(resource: string, request: Request, fallback: unknown) {
    reads.push(resource)
    const base = workflow.reply(resource, request, fallback)
    const body = request.method() === 'POST' ? request.postDataJSON() ?? {} : {}
    if (resource === 'portfolio_summary') return { json: { ...(fallback as object),
      attention_count: signals.ledger ?? 12, transfer_leg_count: signals.transfers ?? 3 } }
    if (resource === 'query-budget' && !body.action?.match(/^(draft|account_activity|sources|operation)$/) && base?.json) {
      (base.json as { details: Record<string, unknown> }).details.attention = attention(signals.budget ?? 0)
      return base
    }
    if (resource === 'reporting_transaction_lines' && signals.bill
      && new URL(request.url()).searchParams.get('select')?.includes('allocation_id,position')) {
      return { json: [...(fallback as { date: string }[]), ...bill].sort((a, b) => b.date.localeCompare(a.date)) }
    }
    if (resource === 'planning_goals') {
      if (signals.failGoals) return { status: 500, json: { message: 'Fixture planning failure' } }
      return { json: signals.goalReached ? [{ id: goal.id, name: goal.name, metric: 'cash', target_cents: 1_000_000,
        target_date: null, status: 'active', updated_at: '2026-11-01T00:00:00Z' }] : [] }
    }
    if (resource === 'planning_goal_accounts' && signals.goalReached) {
      return { json: [{ goal_id: goal.id, account_id: everyday, planning_goals: { tenant_id: 'fixture' } }] }
    }
    if (resource === 'update-callsign' && signals.failCallsign) return { status: 500, json: { error: 'Fixture save failure' } }
    return base
  }
  return { reply, reads }
}

async function openConsole(page: Page, fixture = replies(), preferences?: Record<string, unknown>) {
  if (preferences) await page.addInitScript(value => {
    try {
      if (localStorage.getItem('halcyon-console-preferences') === null) localStorage.setItem('halcyon-console-preferences', JSON.stringify(value))
    } catch { /* Blocked storage leaves the defaults. */ }
  }, preferences)
  await signInForConsole(page, true, undefined, fixture.reply, 'fresh')
  await expect(sectionRow(page)).toBeVisible()
  await expect(preview(page)).toHaveCSS('opacity', '1')
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
  return fixture
}

async function press(target: Locator, hasTouch: boolean) {
  if (hasTouch) await target.tap()
  else await target.click()
}

async function openCentre(page: Page, hasTouch = false) {
  await press(trigger(page), hasTouch)
  await expect(centre(page)).toBeVisible()
  await expect(status(page).or(notices(page))).toBeVisible()
  await expect(status(page).filter({ hasText: 'Checking' })).toHaveCount(0)
}

async function loadBudget(page: Page) {
  const names = ['Overview', 'Accounts', 'Income', 'Expenses', 'Budget']
  await tile(page, 'Overview').focus()
  for (const name of names.slice(1)) {
    await page.keyboard.press('ArrowRight')
    await expect(tile(page, name)).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(preview(page)).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await page.waitForURL('**/budget')
  await expect(page.locator('.console-route-layer:not([inert])').getByText('Spending estimate unavailable').first()).toBeVisible()
  await back(page).click()
  await page.waitForURL(dashboard)
  await expect(preview(page)).toHaveCSS('opacity', '1')
}

async function capture(page: Page, label: string) {
  const base = process.env.CONSOLE_PHASE6_CAPTURE_DIR
  if (!base) return
  await mkdir(resolve(base), { recursive: true })
  await page.mouse.move(0, page.viewportSize()!.height - 1)
  await page.screenshot({ path: resolve(base, `${label}.jpg`), quality: 85, animations: 'disabled' })
}

async function scan(page: Page, root: Locator, label: string) {
  await expect(root).toBeVisible()
  await auditConsoleChrome(root, label)
  const results = await new AxeBuilder({ page }).include('.console-centre').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  console.log(`${label} axe ${JSON.stringify(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })))}`)
  expect.soft(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })), label + ' axe').toEqual([])
}

test.describe.configure({ mode: 'parallel' })

test('Notices read bills and goals only after the first open, and never read Budget', async ({ page }) => {
  const fixture = await openConsole(page)
  expect(fixture.reads).not.toContain('planning_goals')
  expect(fixture.reads).not.toContain('merchant_recurrence_hints')
  await openCentre(page)
  expect(fixture.reads).toContain('planning_goals')
  expect(fixture.reads).toContain('merchant_recurrence_hints')
  expect(fixture.reads).not.toContain('query-budget')
  const cards = notices(page).getByRole('button')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toHaveText('Ledger review12 to reviewUncategorised or flagged transactions')
  await expect(cards.nth(1)).toHaveText('Transfers3 to reviewPossible transfers to confirm')
  await expect(note(page)).toHaveText('Budget is checked once you open it.')
  await scan(page, centre(page), 'centre-two-notices')

  await cards.nth(0).click()
  await page.waitForURL('**/ledger')
  await expect(centre(page)).toBeHidden()
})

test('Three notices rank Budget, bills and Ledger first, and each opens its hub with the matching state', async ({ page, hasTouch }) => {
  await openConsole(page, replies({ budget: 2, bill: true, goalReached: true }))
  await loadBudget(page)
  await openCentre(page, hasTouch)
  const cards = notices(page).getByRole('button')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toHaveText('Budget2 checksNeed attention this period')
  await expect(cards.nth(1)).toHaveText('Bills1 dueNext: Streaming service, 28 Nov')
  await expect(cards.nth(2)).toHaveText('Ledger review12 to reviewUncategorised or flagged transactions')
  await expect(note(page)).toHaveText('Showing 3 of 5 notices.')
  await scan(page, centre(page), 'centre-three-notices')

  await press(cards.nth(1), hasTouch)
  await page.waitForURL('**/expenses')
  await expect(page.getByRole('tab', { name: 'Recurring hub' })).toHaveAttribute('aria-selected', 'true')
  await back(page).click()
  await page.waitForURL(dashboard)

  await openCentre(page, hasTouch)
  await press(cards.nth(0), hasTouch)
  await page.waitForURL('**/budget')
})

test('One goal notice opens Strategic projections', async ({ page }) => {
  await openConsole(page, replies({ ledger: 0, transfers: 0, goalReached: true }))
  await loadBudget(page)
  await openCentre(page)
  const cards = notices(page).getByRole('button')
  await expect(cards).toHaveCount(1)
  await expect(cards.nth(0)).toHaveText('GoalsTarget reachedHoliday fund')
  await expect(note(page)).toHaveCount(0)
  await scan(page, centre(page), 'centre-one-notice')
  await cards.nth(0).click()
  await page.waitForURL('**/income')
  await expect(page.getByRole('tab', { name: 'Strategic projections' })).toHaveAttribute('aria-selected', 'true')
})

test('No signals show all caught up, and a failed source never counts as clear', async ({ page }) => {
  await openConsole(page, replies({ ledger: 0, transfers: 0 }))
  await openCentre(page)
  await expect(notices(page)).toHaveCount(0)
  await expect(status(page)).toHaveAttribute('data-console-notices', 'clear')
  await expect(status(page)).toHaveText('All caught upNothing needs your attention right now. Budget is checked once you open it.')
  await scan(page, centre(page), 'centre-clear-budget-unopened')
  await page.keyboard.press('Escape')
  await expect(centre(page)).toBeHidden()
  await loadBudget(page)
  await openCentre(page)
  await expect(status(page)).toHaveText('All caught upNothing needs your attention right now.')
  await scan(page, centre(page), 'centre-clear')
})

test('A failed goals read is named instead of counting as no goals', async ({ page }) => {
  await openConsole(page, replies({ ledger: 0, transfers: 0, failGoals: true }))
  await loadBudget(page)
  await openCentre(page)
  await expect(status(page)).toHaveAttribute('data-console-notices', 'incomplete')
  await expect(status(page)).toHaveText('Nothing to showNothing needs attention in what could be checked. Couldn’t check goals.')
})

test('Notices keep the focus trap, roving arrows and focus return', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'Keyboard walkthrough')
  await openConsole(page)
  const overview = tile(page, 'Overview')
  await overview.focus()
  await page.keyboard.press('c')
  await expect(centre(page)).toBeVisible()
  await expect(notices(page).getByRole('button')).toHaveCount(2)
  await expect(centre(page).getByRole('button', { name: 'Close Control Centre' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(quick(page, 'Sign out')).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(notices(page).getByRole('button', { name: /Ledger review/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(notices(page).getByRole('button', { name: /Transfers/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(quick(page, 'Ledger review')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(centre(page)).toBeHidden()
  await expect(overview).toBeFocused()
})

test('Quiet alerts mutes Console toasts for the session', async ({ page }) => {
  await openConsole(page, replies({ failCallsign: true }))
  await openCentre(page)
  const quiet = quick(page, 'Quiet alerts')
  await expect(quiet).toHaveAttribute('aria-pressed', 'false')
  await quiet.click()
  await expect(quiet).toHaveAttribute('aria-pressed', 'true')
  await scan(page, centre(page), 'centre-quiet-on')
  await page.keyboard.press('Escape')

  async function saveCallsign() {
    await expect(centre(page)).toBeHidden()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Edit callsign' }).click()
    const edit = page.getByRole('textbox', { name: 'Callsign' })
    await edit.fill('Reviewer two')
    await edit.press('Enter')
  }
  await saveCallsign()
  await page.waitForTimeout(800)
  await expect(page.getByText('Error updating callsign')).toHaveCount(0)

  await openCentre(page)
  await quiet.click()
  await expect(quiet).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Escape')
  await expect(centre(page)).toBeHidden()
  const edit = page.getByRole('textbox', { name: 'Callsign' })
  await expect(edit, 'a failed save keeps the edit open').toBeVisible()
  await edit.press('Enter')
  await expect(page.getByText('Error updating callsign')).toBeVisible()
})

test('Rest is offered only while the start screen is on', async ({ page, hasTouch }) => {
  await openConsole(page)
  await openCentre(page, hasTouch)
  await expect(quick(page, 'Rest')).toHaveCount(0)
  await expect(quick(page, 'Quiet alerts')).toBeVisible()
})

async function enableStartScreen(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Show start screen' }).click()
  await expect(page.getByRole('switch', { name: 'Show start screen' })).toHaveAttribute('aria-checked', 'true')
  await back(page).click()
  await page.waitForURL(dashboard)
  await expect(preview(page)).toHaveCSS('opacity', '1')
}

test('Rest returns to the start screen and Start brings Home back', async ({ page, hasTouch }) => {
  await openConsole(page)
  await enableStartScreen(page)
  await openCentre(page, hasTouch)
  await press(quick(page, 'Rest'), hasTouch)
  const start = page.getByRole('dialog', { name: 'Halcyon start screen' })
  await expect(start).toBeVisible()
  await expect(centre(page)).toBeHidden()
  await press(start.getByRole('button', { name: 'Start Halcyon' }), hasTouch)
  await expect(start).toBeHidden()
  await expect(sectionRow(page)).toBeVisible()

  await tile(page, 'Overview').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForURL('**/accounts')
  await openCentre(page, hasTouch)
  await press(quick(page, 'Rest'), hasTouch)
  await page.waitForURL(dashboard)
  await expect(start).toBeVisible()
  await press(start.getByRole('button', { name: 'Start Halcyon' }), hasTouch)
  await expect(sectionRow(page)).toBeVisible()
})

const captureStates: [string, Signals][] = [
  ['zero', { ledger: 0, transfers: 0 }],
  ['one', { ledger: 0, transfers: 0, goalReached: true }],
  ['three', { budget: 2, bill: true, goalReached: true }],
]
for (const [label, signals] of captureStates) {
  test(`Phase 6B captures, ${label} notices`, async ({ page }, info) => {
    test.skip(!process.env.CONSOLE_PHASE6_CAPTURE_DIR || info.project.name === 'WebKit', 'Capture run only')
    test.setTimeout(180_000)
    const widths = info.project.name === 'Phone' ? [[320, 700], [390, 844]] : [[768, 1024], [1024, 768], [1440, 900]]
    // The three-notice state also shows Rest, so the eight-action row is captured too.
    await openConsole(page, replies(signals))
    if (label !== 'zero') await loadBudget(page)
    if (label === 'three') await enableStartScreen(page)
    for (const [width, height] of widths) {
      await page.setViewportSize({ width, height })
      await openCentre(page)
      await capture(page, `${width}-centre-${label}`)
      await page.keyboard.press('Escape')
      await expect(centre(page)).toBeHidden()
    }
  })
}

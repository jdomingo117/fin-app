import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { auditConsoleChrome } from './fixtures/console-leftovers'
import { dashboard, signInForConsole } from './fixtures/console-review'
import { workflowReplies } from './fixtures/console-workflow-replies'

// Phase 6C: Money, Plan and Import rows, and the Goals and Bills hubs. Default-path cases start from the Console default.
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Home rows' })
const rowTab = (page: Page, name: string) => tabs(page).getByRole('tab', { name, exact: true })
const row = (page: Page, name: string) => page.getByRole('toolbar', { name: `${name} sections` })
const tile = (page: Page, rowName: string, name: string) => row(page, rowName).getByRole('button', { name, exact: true })
const layer = (page: Page) => page.locator('.console-route-layer:not([inert])')
const home = (page: Page) => layer(page).locator('.console-home')
const preview = (page: Page) => layer(page).locator('.console-preview')
const back = (page: Page) => layer(page).getByRole('button', { name: 'Back to Home' })
const hub = (page: Page) => layer(page).locator('.console-designed-scroll')
const hero = (page: Page) => hub(page).locator('.console-expanded-hero')

const ids = {
  everyday: '64ddbad1-3d5b-4840-a2c7-30192dc77993',
  savings: '2b36ecb2-2ade-4b81-b26a-cb73d95d829b',
  investments: 'c64afd81-a4c3-44ea-84a8-0bbc501042e3',
}
// Fictional goals. Everyday and savings hold $87,880.00 of cash; net worth is $184,320.00.
const goals = [
  { id: '5f1d6a0e-0b4e-4f7b-9a51-1c0d4f1f0a01', name: 'Emergency fund', metric: 'cash', target_cents: 12_000_000, target_date: '2027-06-30',
    status: 'active', updated_at: '2026-11-20T00:00:00Z', accounts: [ids.everyday, ids.savings] },
  { id: '5f1d6a0e-0b4e-4f7b-9a51-1c0d4f1f0a02', name: 'House deposit', metric: 'net_worth', target_cents: 30_000_000, target_date: null,
    status: 'active', updated_at: '2026-11-18T00:00:00Z', accounts: [ids.everyday, ids.savings, ids.investments] },
  { id: '5f1d6a0e-0b4e-4f7b-9a51-1c0d4f1f0a03', name: 'New car', metric: 'cash', target_cents: 4_000_000, target_date: null,
    status: 'active', updated_at: '2026-11-10T00:00:00Z', accounts: [ids.everyday, 'a-closed-account'] },
  { id: '5f1d6a0e-0b4e-4f7b-9a51-1c0d4f1f0a04', name: 'Weekend away', metric: 'cash', target_cents: 500_000, target_date: null,
    status: 'paused', updated_at: '2026-10-01T00:00:00Z', accounts: [ids.everyday] },
]
// Two fictional monthly bills: one due on 28 November, one on 10 December. The fixture clock reads 22 November 2026.
const charge = (merchant: string, day: string, amount: number) => (month: string, index: number) => ({
  parent_id: `fixture-${merchant.replaceAll(' ', '-')}-${index}`, allocation_id: null, position: 0, account_id: ids.everyday,
  date: `2026-${month}-${day}`, merchant, merchant_key: merchant.toLowerCase(), category: 'Bills', subcategory: null, amount, kind: 'expense',
})
const bills = [
  ...['05', '06', '07', '08', '09', '10'].map(charge('Streaming service', '28', -1_999)),
  ...['06', '07', '08', '09', '10', '11'].map(charge('Gym membership', '10', -4_500)),
]

type Setup = { goals?: boolean; bills?: boolean; failGoals?: boolean; failBills?: boolean }

function replies(setup: Setup = {}) {
  const workflow = workflowReplies()
  const reads: string[] = []
  const writes: { name: string; body: Record<string, unknown> }[] = []
  function reply(resource: string, request: Request, fallback: unknown) {
    reads.push(resource)
    if (resource === 'manage-planning' || resource === 'manage-recurring-series') {
      writes.push({ name: resource, body: request.postDataJSON() })
      return { json: { event_id: `fixture-${resource}-event` } }
    }
    if (resource === 'planning_goals') {
      if (setup.failGoals) return { status: 500, json: { message: 'Fixture planning failure' } }
      return { json: setup.goals ? goals.map(({ accounts: _accounts, ...goal }) => goal) : [] }
    }
    if (resource === 'planning_goal_accounts') {
      return { json: setup.goals ? goals.flatMap(goal => goal.accounts.map(account_id => ({ goal_id: goal.id, account_id, planning_goals: { tenant_id: 'fixture' } }))) : [] }
    }
    if (resource === 'recurrence_scope_summary' && setup.failBills) return { status: 500, json: { message: 'Fixture recurrence failure' } }
    if (resource === 'reporting_transaction_lines' && setup.bills
      && new URL(request.url()).searchParams.get('select')?.includes('allocation_id,position')) {
      return { json: [...(fallback as { date: string }[]), ...bills].sort((a, b) => b.date.localeCompare(a.date)) }
    }
    return workflow.reply(resource, request, fallback)
  }
  const count = (resource: string) => reads.filter(item => item === resource).length
  return { reply, reads, writes, count }
}

async function openConsole(page: Page, fixture = replies()) {
  await signInForConsole(page, true, undefined, fixture.reply, 'fresh')
  await expect(tabs(page)).toBeVisible()
  await settle(page)
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
  return fixture
}

async function settle(page: Page) {
  await expect(preview(page)).toHaveCSS('opacity', '1')
}

async function press(target: Locator, hasTouch: boolean) {
  if (hasTouch) await target.tap()
  else await target.click()
}

async function showRow(page: Page, name: string, hasTouch = false) {
  if (await rowTab(page, name).getAttribute('aria-selected') !== 'true') await press(rowTab(page, name), hasTouch)
  await expect(row(page, name)).toBeVisible()
  await settle(page)
}

/** Opens a tile the way each input does: Enter on its tab stop, or a second tap once it's selected. */
async function openTile(page: Page, rowName: string, name: string, hasTouch: boolean) {
  await showRow(page, rowName, hasTouch)
  const target = tile(page, rowName, name)
  if (hasTouch) {
    // The first tap selects the tile, or arms it if it's already selected. The second opens it.
    await target.tap()
    await expect(target).toHaveAttribute('aria-pressed', 'true')
    await target.tap()
  } else {
    await target.focus()
    await page.keyboard.press('Enter')
  }
}

async function goHome(page: Page, hasTouch: boolean) {
  await press(back(page), hasTouch)
  await page.waitForURL(dashboard)
  await settle(page)
}

async function capture(page: Page, label: string) {
  const base = process.env.CONSOLE_PHASE6_CAPTURE_DIR
  if (!base) return
  await mkdir(resolve(base), { recursive: true })
  await page.mouse.move(0, page.viewportSize()!.height - 1)
  await page.screenshot({ path: resolve(base, `${label}.jpg`), quality: 85, animations: 'disabled' })
}

/** Waits for finite entry and colour transitions so axe never measures a half-faded colour. */
async function settled(root: Locator) {
  await root.evaluate(node => Promise.all(node.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => undefined))))
}

async function scan(page: Page, root: Locator, label: string) {
  await expect(root).toBeVisible()
  await settled(root)
  await auditConsoleChrome(root, label)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach(label + ' axe', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  console.log(`${label} axe ${JSON.stringify(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })))}`)
  expect.soft(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })), label + ' axe').toEqual([])
}

async function redact(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Redact balances' }).click()
  await back(page).click()
  await page.waitForURL(dashboard)
  await settle(page)
}

test.describe.configure({ mode: 'parallel' })

test('Home rows switch from a visible tab control, each with its own tab stop and remembered tile', async ({ page, hasTouch }) => {
  const fixture = await openConsole(page)
  await expect(tabs(page).getByRole('tab')).toHaveText(['Money', 'Plan', 'Import'])
  await expect(rowTab(page, 'Money')).toHaveAttribute('aria-selected', 'true')
  await expect(row(page, 'Money').getByRole('button')).toHaveCount(5)
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', await rowTab(page, 'Money').getAttribute('id') ?? '')

  if (hasTouch) {
    await rowTab(page, 'Plan').tap()
    await expect(row(page, 'Plan').getByRole('button')).toHaveCount(2)
    await tile(page, 'Plan', 'Bills').tap()
    await expect(tile(page, 'Plan', 'Bills')).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(dashboard)
    await rowTab(page, 'Import').tap()
    await expect(tile(page, 'Import', 'Ingestion')).toHaveAttribute('aria-pressed', 'true')
  } else {
    // The tablist and each row are single tab stops. Arrows move within each.
    await tile(page, 'Money', 'Overview').focus()
    await page.keyboard.press('Shift+Tab')
    await expect(rowTab(page, 'Money')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(rowTab(page, 'Plan')).toBeFocused()
    await expect(rowTab(page, 'Plan')).toHaveAttribute('aria-selected', 'true')
    await expect(row(page, 'Money')).toHaveCount(0)
    await expect(row(page, 'Plan').getByRole('button')).toHaveCount(2)
    await page.keyboard.press('Tab')
    await expect(tile(page, 'Plan', 'Goals')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(tile(page, 'Plan', 'Bills')).toBeFocused()
    await expect(tile(page, 'Plan', 'Bills')).toHaveAttribute('aria-pressed', 'true')
    await expect(tile(page, 'Plan', 'Goals')).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('Shift+Tab')
    await expect(rowTab(page, 'Plan')).toBeFocused()
    await page.keyboard.press('End')
    await expect(rowTab(page, 'Import')).toHaveAttribute('aria-selected', 'true')
    await expect(row(page, 'Import').getByRole('button')).toHaveCount(1)
    await page.keyboard.press('Home')
    await expect(rowTab(page, 'Money')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(rowTab(page, 'Money')).toBeFocused()
  }
  // Each row returns to the tile it last had selected.
  await press(rowTab(page, 'Money'), hasTouch)
  await expect(tile(page, 'Money', 'Overview')).toHaveAttribute('aria-pressed', 'true')
  await press(rowTab(page, 'Plan'), hasTouch)
  await expect(tile(page, 'Plan', 'Bills')).toHaveAttribute('aria-pressed', 'true')

  // Previewing the Plan tiles starts no read and never shows a zero.
  await expect(preview(page)).toContainText('Open to see what’s due')
  await expect(preview(page)).toContainText('Open Bills to see what’s due in the next 14 days.')
  // Tiles before the selected one are hidden by design, so step back with the arrow key.
  await tile(page, 'Plan', 'Bills').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(tile(page, 'Plan', 'Goals')).toHaveAttribute('aria-pressed', 'true')
  await settle(page)
  await expect(preview(page)).toContainText('Open to see your goals')
  await expect(preview(page)).not.toContainText('$0')
  expect(fixture.count('planning_goals')).toBe(0)
  expect(fixture.count('recurrence_scope_summary')).toBe(0)
})

test('Goals hub reads planning once, shows progress in exact cents and Back returns to the Goals tile', async ({ page, hasTouch }) => {
  const fixture = await openConsole(page, replies({ goals: true }))
  await openTile(page, 'Plan', 'Goals', hasTouch)
  await page.waitForURL('**/goals')
  await expect(layer(page).getByRole('heading', { name: 'Goals', level: 1 })).toBeVisible()
  await expect(hero(page).locator('.console-hero-label')).toHaveText('Emergency fund · current value')
  await expect(hero(page).locator('.console-hero-amount .sr-only')).toHaveText('$87,880.00')
  await expect(hero(page).locator('.console-figures')).toHaveText(/Target\$120,000\.00To go\$32,120\.00/)
  await expect(hero(page).locator('.console-orb-stat')).toHaveText('73%Emergency fund')
  const active = hub(page).getByRole('region', { name: 'Active goals' })
  await expect(active.locator('[data-plan-goal]')).toHaveCount(3)
  await expect(active.locator('[data-plan-goal]').nth(0)).toContainText('Cash holdings · by 30 Jun 2027')
  await expect(active.locator('[data-plan-goal]').nth(0)).toContainText('$87,880.00 of $120,000.00 · 73%')
  await expect(active.locator('[data-plan-goal]').nth(1)).toContainText('$184,320.00 of $300,000.00 · 61%')
  await expect(active.locator('[data-plan-goal]').nth(2)).toContainText('Progress unavailable · target $40,000.00')
  await expect(active.locator('[data-plan-goal]').nth(2).locator('.console-card-meter')).toHaveCount(0)
  await expect(hub(page).getByRole('region', { name: 'Paused and archived' })).toContainText('Weekend away')
  await expect(hub(page).getByRole('region', { name: 'Paused and archived' })).toContainText('$12,880.00 of $5,000.00 · target reached')
  expect(fixture.count('planning_goals')).toBe(1)

  await goHome(page, hasTouch)
  await expect(rowTab(page, 'Plan')).toHaveAttribute('aria-selected', 'true')
  await expect(tile(page, 'Plan', 'Goals')).toBeFocused()
  // Home now shows the goals the session already holds, without another read.
  const cards = home(page).getByRole('group', { name: 'Goal cards' })
  await expect(cards.getByRole('button')).toHaveCount(3)
  await expect(cards.getByRole('button').first()).toContainText('$87,880.00')
  await expect(cards.getByRole('button').first()).toContainText('of $120,000.00 · 73%')
  await openTile(page, 'Plan', 'Goals', hasTouch)
  await page.waitForURL('**/goals')
  await expect(hub(page).getByRole('region', { name: 'Active goals' }).locator('[data-plan-goal]')).toHaveCount(3)
  expect(fixture.count('planning_goals')).toBe(1)
})

test('Goal edits go only through manage-planning, with Undo', async ({ page, hasTouch }) => {
  const fixture = await openConsole(page, replies({ goals: true }))
  await page.goto(new URL('/goals', dashboard).href)
  const edit = hub(page).getByRole('button', { name: 'Edit Emergency fund' })
  await press(edit, hasTouch)
  const dialog = page.getByRole('dialog', { name: 'Edit goal' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/goals$/)
  await expect(edit).toBeFocused()
  await press(edit, hasTouch)
  await dialog.getByRole('textbox', { name: 'Target amount (AUD)' }).fill('125000')
  await press(dialog.getByRole('button', { name: 'Save goal' }), hasTouch)
  await expect(dialog).toHaveCount(0)
  await expect(hub(page).getByRole('status').filter({ hasText: 'Goal saved.' })).toBeVisible()
  await press(hub(page).getByRole('button', { name: 'Undo', exact: true }), hasTouch)
  await expect(hub(page).getByText('Goal saved.')).toHaveCount(0)
  expect(fixture.writes.map(({ name, body }) => [name, body.action, body.target_cents ?? body.event_id])).toEqual([
    ['manage-planning', 'save_goal', 12_500_000],
    ['manage-planning', 'undo', 'fixture-manage-planning-event'],
  ])
})

test('Bills hub lists what’s due, manages a bill only through manage-recurring-series and keeps its read', async ({ page, hasTouch }) => {
  const fixture = await openConsole(page, replies({ bills: true }))
  await openTile(page, 'Plan', 'Bills', hasTouch)
  await page.waitForURL('**/bills')
  await expect(layer(page).getByRole('heading', { name: 'Bills', level: 1 })).toBeVisible()
  await expect(hero(page).locator('.console-hero-label')).toHaveText('Due in the next 14 days')
  await expect(hero(page).locator('.console-hero-amount .sr-only')).toHaveText('$19.99')
  await expect(hub(page).locator('.console-period')).toHaveText('22 Nov – 5 Dec 2026')
  const due = hub(page).getByRole('region', { name: 'Due in the next 14 days' })
  await expect(due.locator('[data-plan-bill]')).toHaveCount(1)
  await expect(due.locator('[data-plan-bill]')).toContainText('Streaming service')
  await expect(due.locator('[data-plan-bill]')).toContainText('Due 28 Nov · Monthly · Everyday')
  await expect(due.locator('[data-plan-bill]')).toContainText('$19.99')
  const later = hub(page).getByRole('region', { name: 'Later' })
  await expect(later.locator('[data-plan-bill]')).toContainText('Gym membership')
  await expect(later.locator('[data-plan-bill]')).toContainText('Due 10 Dec')
  expect(fixture.count('recurrence_scope_summary')).toBe(1)

  await goHome(page, hasTouch)
  await expect(tile(page, 'Plan', 'Bills')).toBeFocused()
  const cards = home(page).getByRole('group', { name: 'Bill cards' })
  await expect(cards.getByRole('button')).toHaveCount(2)
  await expect(cards.getByRole('button').first()).toContainText('Due 28 Nov')
  await openTile(page, 'Plan', 'Bills', hasTouch)
  await page.waitForURL('**/bills')
  expect(fixture.count('recurrence_scope_summary')).toBe(1)

  const manage = hub(page).getByRole('button', { name: 'Manage Streaming service' })
  await press(manage, hasTouch)
  const dialog = page.getByRole('dialog', { name: 'Streaming service' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('next 28 Nov 2026')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/bills$/)
  await expect(manage).toBeFocused()
  await press(manage, hasTouch)
  await press(dialog.getByRole('button', { name: 'Save changes' }), hasTouch)
  await expect(hub(page).getByRole('status').filter({ hasText: 'Bill updated.' })).toBeVisible()
  await press(dialog.getByRole('button', { name: 'Close', exact: true }).last(), hasTouch)
  await press(hub(page).getByRole('button', { name: 'Undo', exact: true }), hasTouch)
  await expect(hub(page).getByText('Bill updated.')).toHaveCount(0)
  expect(fixture.writes.map(({ name, body }) => [name, body.action])).toEqual([
    ['manage-recurring-series', 'save'], ['manage-recurring-series', 'undo'],
  ])
})

test('Deep links open the Plan hubs and Ingestion, and Back returns to their row and tile', async ({ page, hasTouch }) => {
  await openConsole(page, replies({ goals: true, bills: true }))
  for (const [path, rowName, name] of [['goals', 'Plan', 'Goals'], ['bills', 'Plan', 'Bills'], ['ingestion', 'Import', 'Ingestion']] as const) {
    await page.goto(new URL('/' + path, dashboard).href)
    await expect(layer(page).getByRole('heading', { name, level: 1 }).first()).toBeVisible()
    await goHome(page, hasTouch)
    await expect(rowTab(page, rowName)).toHaveAttribute('aria-selected', 'true')
    await expect(tile(page, rowName, name)).toBeFocused()
  }
  // The Import row's card opens the same hub.
  await press(home(page).locator('[data-import-home-card]'), hasTouch)
  await page.waitForURL('**/ingestion')
})

test('Goals and Bills show empty and error states without a made-up zero', async ({ page }) => {
  await openConsole(page)
  await page.goto(new URL('/goals', dashboard).href)
  await expect(hub(page).getByRole('region', { name: 'Active goals' })).toContainText('No goals yet.')
  await expect(hero(page).locator('.console-hero-amount')).toHaveText('No active goals')
  await expect(hub(page)).not.toContainText('$0')
  await page.goto(new URL('/bills', dashboard).href)
  await expect(hub(page).getByRole('region', { name: 'Due in the next 14 days' })).toContainText('No recurring bills detected yet.')
  await expect(hero(page).locator('.console-hero-amount')).toHaveText('No bills detected')
  await expect(hub(page)).not.toContainText('$0')
  await goHome(page, false)
  await expect(preview(page)).toContainText('No bills detected')
  await expect(preview(page)).not.toContainText('$0')
})

test('Goals and Bills say when their data couldn’t load', async ({ page }) => {
  await openConsole(page, replies({ failGoals: true, failBills: true }))
  await page.goto(new URL('/goals', dashboard).href)
  await expect(hub(page).getByRole('region', { name: 'Active goals' })).toContainText('Goals unavailable. Retry')
  await expect(hero(page).locator('.console-hero-amount')).toHaveText('Unavailable')
  await page.goto(new URL('/bills', dashboard).href)
  await expect(hub(page).getByRole('region', { name: 'Due in the next 14 days' })).toContainText('Bills unavailable. Retry')
  await expect(hero(page).locator('.console-hero-amount')).toHaveText('Unavailable')
  await expect(hub(page)).not.toContainText('$0')
  await goHome(page, false)
  await expect(preview(page)).toContainText('Recurring bills couldn’t load. Open Bills to try again.')
})

test('Redaction hides Plan amounts, bars and progress', async ({ page }) => {
  await openConsole(page, replies({ goals: true, bills: true }))
  await redact(page)
  // Redaction lasts for the visit, so stay in the app rather than reload.
  await openTile(page, 'Plan', 'Goals', false)
  await page.waitForURL('**/goals')
  await expect(hub(page).getByRole('region', { name: 'Active goals' }).locator('[data-plan-goal]')).toHaveCount(3)
  await expect(hub(page)).not.toContainText(/\$[\d,]+/)
  await expect(hub(page).locator('.console-card-meter, .console-orb-stat')).toHaveCount(0)
  await expect(hub(page).getByRole('region', { name: 'Active goals' })).toContainText('Amounts hidden')
  await goHome(page, false)
  await expect(home(page).getByRole('group', { name: 'Goal cards' })).not.toContainText(/\$[\d,]+/)
  await expect(home(page).locator('.console-card-meter, .console-orb-stat')).toHaveCount(0)
  await scan(page, home(page), 'goals-home-redacted')
  await openTile(page, 'Plan', 'Bills', false)
  await page.waitForURL('**/bills')
  await expect(hub(page).getByRole('region', { name: 'Due in the next 14 days' }).locator('[data-plan-bill]')).toHaveCount(1)
  await expect(hub(page)).not.toContainText(/\$[\d,]+/)
  await scan(page, hub(page), 'bills-hub-redacted')
})

test('Classic sends the Plan links to their existing views', async ({ page }, info) => {
  test.skip(info.project.name !== 'Desktop', 'One appearance check is enough.')
  await signInForConsole(page, true, undefined, replies().reply, 'classic')
  await page.goto(new URL('/goals', dashboard).href)
  await page.waitForURL('**/income')
  await expect(page.getByRole('tab', { name: 'Strategic projections' }).or(page.getByRole('button', { name: 'Strategic projections' })).first()).toBeVisible()
  await page.goto(new URL('/bills', dashboard).href)
  await page.waitForURL('**/expenses')
  await expect(page.getByText('Recurring commitments', { exact: true })).toBeVisible()
})

test('Phase 6C rendered audit and axe', async ({ page, hasTouch }) => {
  test.setTimeout(120_000)
  await openConsole(page, replies({ goals: true, bills: true }))
  await showRow(page, 'Plan', hasTouch)
  await scan(page, home(page), 'home-plan-cold')
  await showRow(page, 'Import', hasTouch)
  await scan(page, home(page), 'home-import')
  await page.goto(new URL('/goals', dashboard).href)
  await expect(hub(page).getByRole('region', { name: 'Active goals' }).locator('[data-plan-goal]')).toHaveCount(3)
  await scan(page, hub(page), 'goals-hub')
  await hub(page).evaluate(node => node.scrollTo(0, 650))
  await expect(hub(page)).toHaveAttribute('data-hero-state', 'compact')
  await scan(page, hub(page), 'goals-hub-compact')
  await press(hub(page).getByRole('button', { name: 'Edit Emergency fund' }), hasTouch)
  await scan(page, page.getByRole('dialog', { name: 'Edit goal' }), 'goals-edit-dialog')
  await page.keyboard.press('Escape')
  await page.goto(new URL('/bills', dashboard).href)
  await expect(hub(page).getByRole('region', { name: 'Later' })).toContainText('Gym membership')
  await scan(page, hub(page), 'bills-hub')
  await hub(page).evaluate(node => node.scrollTo(0, 650))
  await expect(hub(page)).toHaveAttribute('data-hero-state', 'compact')
  await scan(page, hub(page), 'bills-hub-compact')
  await press(hub(page).getByRole('button', { name: 'Manage Streaming service' }), hasTouch)
  await scan(page, page.getByRole('dialog', { name: 'Streaming service' }), 'bills-manage-dialog')
  await page.keyboard.press('Escape')
  await goHome(page, hasTouch)
  await scan(page, home(page), 'home-bills-cards')
})

test('Phase 6C captures at each gate width', async ({ page }, info) => {
  test.skip(!process.env.CONSOLE_PHASE6_CAPTURE_DIR || info.project.name === 'WebKit', 'Capture run only')
  test.setTimeout(240_000)
  const touch = info.project.name === 'Phone'
  const widths = touch ? [[320, 700], [390, 844]] : [[768, 1024], [1024, 768], [1440, 900]]
  await openConsole(page, replies({ goals: true, bills: true }))
  for (const [width, height] of widths) {
    await page.setViewportSize({ width, height })
    await page.goto(dashboard)
    await settle(page)
    await capture(page, `${width}-home-money`)
    await showRow(page, 'Plan', touch)
    await capture(page, `${width}-home-plan-cold`)
    await openTile(page, 'Plan', 'Goals', touch)
    await expect(hub(page).getByRole('region', { name: 'Active goals' }).locator('[data-plan-goal]')).toHaveCount(3)
    await settled(hub(page))
    await capture(page, `${width}-goals-hub`)
    await hub(page).evaluate(node => node.scrollTo(0, 650))
    await expect(hub(page)).toHaveAttribute('data-hero-state', 'compact')
    await capture(page, `${width}-goals-hub-compact`)
    await goHome(page, touch)
    await capture(page, `${width}-home-goals`)
    await openTile(page, 'Plan', 'Bills', touch)
    await expect(hub(page).getByRole('region', { name: 'Later' })).toContainText('Gym membership')
    await settled(hub(page))
    await capture(page, `${width}-bills-hub`)
    await hub(page).evaluate(node => node.scrollTo(0, 650))
    await capture(page, `${width}-bills-hub-compact`)
    await goHome(page, touch)
    await capture(page, `${width}-home-bills`)
    await showRow(page, 'Import', touch)
    await capture(page, `${width}-home-import`)
  }
})

test('Phase 6C walkthrough across both rows', async ({ page }, info) => {
  test.skip(!process.env.CONSOLE_WORKFLOW_CAPTURE_DIR || info.project.name !== 'Desktop', 'Walkthrough recording only')
  test.setTimeout(180_000)
  await openConsole(page, replies({ goals: true, bills: true }))
  await tile(page, 'Money', 'Overview').focus()
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) await page.keyboard.press(key)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.waitForURL('**/goals')
  await page.waitForTimeout(2000)
  await hub(page).evaluate(node => node.scrollTo({ top: 650, behavior: 'smooth' }))
  await page.waitForTimeout(2000)
  await back(page).click()
  await page.waitForURL(dashboard)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForURL('**/bills')
  await page.waitForTimeout(2000)
  await hub(page).getByRole('button', { name: 'Manage Streaming service' }).click()
  await page.waitForTimeout(1500)
  await page.keyboard.press('Escape')
  await back(page).click()
  await page.waitForURL(dashboard)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1800)
  await page.keyboard.press('Home')
  await page.waitForTimeout(1800)
  // Money remembers Expenses from the start of the walkthrough.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.waitForURL('**/expenses')
  await page.waitForTimeout(1800)
  await back(page).click()
  await page.waitForURL(dashboard)
  await page.waitForTimeout(2500)
})

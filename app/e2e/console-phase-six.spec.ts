import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { auditConsoleChrome } from './fixtures/console-leftovers'
import { dashboard, signInForConsole } from './fixtures/console-review'
import { workflowReplies } from './fixtures/console-workflow-replies'

// Phase 6A: Home cards, the Overview goal ring and key hints. Every case starts from the Console default.
const sectionRow = (page: Page) => page.getByRole('toolbar', { name: 'Money sections' })
const tile = (page: Page, name: string) => sectionRow(page).getByRole('button', { name, exact: true })
const home = (page: Page) => page.locator('.console-home')
const preview = (page: Page) => page.locator('.console-route-layer:not([inert]) .console-preview')
const centre = (page: Page) => page.getByRole('dialog', { name: 'Control Centre' })
const back = (page: Page) => page.locator('.console-route-layer:not([inert])').getByRole('button', { name: 'Back to Home' })
const everyday = '64ddbad1-3d5b-4840-a2c7-30192dc77993'
const savings = '2b36ecb2-2ade-4b81-b26a-cb73d95d829b'

type Limit = { id: string; name: string; amount: number; used?: number }
const limits: Limit[] = [
  { id: 'groceries', name: 'Groceries', amount: 80_000, used: 55_550 },
  { id: 'dining', name: 'Dining out', amount: 30_000, used: 31_240 },
  { id: 'transport', name: 'Transport', amount: 25_000, used: 6_200 },
  { id: 'household', name: 'Household supplies and repairs for the whole apartment', amount: 15_000, used: 12_000 },
  { id: 'gifts', name: 'Gifts', amount: 10_000, used: 1_000 },
]
const goal = { id: '4c5ad5f6-0b9f-4f5f-9a37-6c0bb3c9ad10', name: 'Emergency fund' }

/** Workflow fixtures plus Budget category limits and one planning goal over Everyday and savings. */
function replies(budgetLimits: Limit[] = limits) {
  const workflow = workflowReplies()
  const reads: string[] = []
  function reply(resource: string, request: Request, fallback: unknown) {
    reads.push(resource)
    const base = workflow.reply(resource, request, fallback)
    const body = request.method() === 'POST' ? request.postDataJSON() ?? {} : {}
    if (resource === 'query-budget' && !body.action?.match(/^(draft|account_activity|sources|operation)$/) && base?.json) {
      const snapshot = base.json as { details: Record<string, unknown> }
      snapshot.details.taxonomy = budgetLimits.map(({ id, name }) => ({ id, name }))
      snapshot.details.limits = budgetLimits.map(({ id, amount, used }) => ({ id: 'limit-' + id, category_id: id, subcategory_id: null,
        custom_subcategory_id: null, amount_cents: amount, used_cents: used, remaining_cents: used === undefined ? null : amount - used, opening_carry_cents: 0 }))
      return base
    }
    if (resource === 'planning_goals') return { json: [{ id: goal.id, name: goal.name, metric: 'cash', target_cents: 15_000_000,
      target_date: null, status: 'active', updated_at: '2026-11-01T00:00:00Z' }] }
    if (resource === 'planning_goal_accounts') return { json: [everyday, savings].map(account_id => ({ goal_id: goal.id, account_id, planning_goals: { tenant_id: 'fixture' } })) }
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
  await settle(page)
  await expect(page.getByText('Session secured', { exact: true })).toHaveCount(0)
  return fixture
}

async function settle(page: Page) {
  await expect(preview(page)).toHaveCSS('opacity', '1')
}

async function select(page: Page, name: string) {
  const names = ['Overview', 'Accounts', 'Income', 'Expenses', 'Budget']
  const active = sectionRow(page).locator('.console-section[data-active="true"]')
  const from = names.indexOf((await active.getAttribute('aria-label'))!)
  await active.focus()
  const to = names.indexOf(name)
  for (let index = from; index !== to; index += to > from ? 1 : -1) await page.keyboard.press(to > from ? 'ArrowRight' : 'ArrowLeft')
  await expect(tile(page, name)).toHaveAttribute('aria-pressed', 'true')
  await settle(page)
}

async function loadBudget(page: Page) {
  await select(page, 'Budget')
  await page.keyboard.press('Enter')
  await page.waitForURL('**/budget')
  await expect(page.locator('.console-route-layer:not([inert])').getByText('Spending estimate unavailable').first()).toBeVisible()
  await back(page).click()
  await page.waitForURL(dashboard)
  await expect(tile(page, 'Budget')).toHaveAttribute('aria-pressed', 'true')
  await settle(page)
}

async function capture(page: Page, label: string) {
  const base = process.env.CONSOLE_PHASE6_CAPTURE_DIR
  if (!base) return
  await mkdir(resolve(base), { recursive: true })
  // Sign-in leaves the pointer mid-page. Park it so a card under it doesn't show its hover ring.
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
  if (await root.evaluate(node => node.matches('.console-home'))) await settle(page)
  else await expect(root).toHaveCSS('opacity', '1')
  await settled(root)
  await auditConsoleChrome(root, label)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach(label + ' axe', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  console.log(`${label} axe ${JSON.stringify(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })))}`)
  expect.soft(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })), label + ' axe').toEqual([])
}

test.describe.configure({ mode: 'parallel' })

test('Budget Home stays cold without a Budget read, then shows four category limits in exact cents', async ({ page }) => {
  const fixture = await openConsole(page)
  await select(page, 'Budget')
  await expect(home(page).locator('[data-budget-home-state="cold"]')).toHaveText('Open Budget to see this period’s category limits.')
  await expect(home(page).locator('.console-activity-spacer')).toHaveCount(0)
  expect(fixture.reads.filter(read => read === 'query-budget')).toEqual([])
  await scan(page, home(page), 'budget-home-cold')

  await loadBudget(page)
  const cards = home(page).getByRole('group', { name: 'Budget category cards' }).getByRole('button')
  await expect(cards).toHaveCount(4)
  // Budget's own order: the first four limits, with Gifts left for the Budget hub.
  await expect(cards.nth(0)).toContainText('Groceries$555.50of $800.00 · 69%')
  await expect(cards.nth(1)).toContainText('Dining out$312.40of $300.00 · over the limit')
  await expect(cards.nth(1)).toHaveAttribute('data-over', 'true')
  await expect(cards.nth(2)).toContainText('Transport$62.00of $250.00 · 24%')
  await expect(cards.nth(3)).toContainText('$120.00of $150.00 · 80%')
  await expect(home(page).getByText('Showing 4 of 5 categories, in Budget’s order.')).toBeVisible()
  expect(await cards.nth(0).locator('.console-card-meter > span').evaluate(node => node.style.inlineSize)).toBe('69%')
  await scan(page, home(page), 'budget-home-cards')

  await cards.nth(1).click()
  await page.waitForURL('**/budget')
  await back(page).click()
  await expect(tile(page, 'Budget')).toHaveAttribute('aria-pressed', 'true')
})

test('Budget Home shows missing usage and a pool-only plan without a zero', async ({ page }) => {
  await openConsole(page, replies([{ id: 'groceries', name: 'Groceries', amount: 80_000 }]))
  await loadBudget(page)
  const card = home(page).getByRole('group', { name: 'Budget category cards' }).getByRole('button')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('GroceriesUnavailable')
  await expect(card).not.toContainText('$0.00')
  await expect(card.locator('.console-card-meter')).toHaveCount(0)
})

test('Budget Home explains a plan without category limits', async ({ page }) => {
  await openConsole(page, replies([]))
  await loadBudget(page)
  await expect(home(page).locator('[data-budget-home-state="no-limits"]'))
    .toHaveText('This budget tracks everyday spending as one amount, without category limits.')
})

test('Expenses Home category shares reconcile with the Expenses hub', async ({ page }) => {
  await openConsole(page)
  await select(page, 'Expenses')
  const row = home(page).getByRole('group', { name: 'Category and transaction cards' })
  const summary = row.locator('[data-expense-home-categories]')
  await expect(summary).toBeVisible()
  const shares = await summary.locator('[data-expense-category]').evaluateAll(nodes => nodes.map(node => ({
    category: node.getAttribute('data-expense-category'), cents: Number(node.getAttribute('data-expense-category-cents')),
    text: node.textContent,
  })))
  expect(shares).toEqual([
    { category: 'Housing', cents: 163_500, text: 'Housing$1,635.00 · 52%' },
    { category: 'Transport', cents: 62_000, text: 'Transport$620.00 · 20%' },
    { category: 'Groceries', cents: 55_500, text: 'Groceries$555.00 · 18%' },
  ])
  await expect(row.getByRole('button')).toHaveCount(5)
  await scan(page, home(page), 'expenses-home-categories')

  await summary.click()
  await page.waitForURL('**/expenses')
  const hub = page.locator('.console-route-layer:not([inert])')
  // The hub's gross outflow is the shared denominator, and its category flow lists the same totals.
  await expect(hub.locator('.console-hero-amount')).toContainText('$3,140')
  const flow = hub.getByRole('region', { name: 'Category flow' })
  for (const { cents } of shares) await expect(flow).toContainText(new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100))
  await back(page).click()
  await expect(tile(page, 'Expenses')).toHaveAttribute('aria-pressed', 'true')
})

test('Overview ring tracks a chosen goal and the trend stays the default', async ({ page }) => {
  const fixture = await openConsole(page)
  await expect(home(page).locator('.console-orb-line')).toHaveCount(1)
  expect(fixture.reads.filter(read => read.startsWith('planning_'))).toEqual([])

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const ring = page.getByRole('combobox', { name: 'Overview ring' })
  await expect(ring).toHaveValue('')
  await expect(ring.locator('option')).toHaveText(['Net worth trend', 'Emergency fund'])
  await scan(page, page.locator('.console-route-layer:not([inert])'), 'settings-overview-ring')
  await ring.selectOption(goal.id)
  await back(page).click()
  await page.waitForURL(dashboard)
  await settle(page)
  const orb = home(page).locator('.console-orb')
  await expect(orb.locator('.console-orb-stat')).toHaveText('58%Emergency fund')
  await expect(orb.locator('figcaption')).toHaveText('Progress toward Emergency fund, $87,880.00 of $150,000.00: 58%')
  await expect(orb.locator('.console-orb-progress')).toHaveAttribute('stroke-dasharray', '58 100')
  await scan(page, home(page), 'overview-goal-ring')

  // The Overview hub still draws the net worth trend.
  await tile(page, 'Overview').focus()
  await page.keyboard.press('Enter')
  await page.waitForURL('**/dashboard?hub=overview')
  await expect(page.locator('.console-route-layer:not([inert]) .console-orb-line')).toHaveCount(1)
  await back(page).click()
  await page.waitForURL(dashboard)

  await page.reload()
  await expect(home(page).locator('.console-orb-stat')).toHaveText('58%Emergency fund')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Overview ring' }).selectOption('')
  await back(page).click()
  await expect(home(page).locator('.console-orb-line')).toHaveCount(1)
})

test('Overview ring falls back to the trend when the chosen goal is gone', async ({ page }) => {
  const fixture = replies()
  const gone = (resource: string, request: Request, body: unknown) =>
    resource === 'planning_goals' ? { json: [] } : fixture.reply(resource, request, body)
  await openConsole(page, { ...fixture, reply: gone }, { overviewGoal: goal.id })
  await expect(home(page).locator('.console-orb-line')).toHaveCount(1)
  await expect(home(page).locator('.console-orb-stat')).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('The chosen goal isn’t active any more, so the ring shows the net worth trend.')).toBeVisible()
})

test('Redaction hides the new card amounts, bars and goal progress', async ({ page }) => {
  await openConsole(page, replies(), { overviewGoal: goal.id })
  await expect(home(page).locator('.console-orb-stat')).toHaveText('58%Emergency fund')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Redact balances' }).click()
  await back(page).click()
  await page.waitForURL(dashboard)
  await settle(page)
  await expect(home(page).locator('.console-orb-stat')).toHaveCount(0)
  await select(page, 'Expenses')
  const shares = home(page).locator('[data-expense-home-categories]')
  await expect(shares).toContainText('Housing')
  await expect(shares).not.toContainText(/\$[\d,]+/)
  await loadBudget(page)
  const cards = home(page).getByRole('group', { name: 'Budget category cards' })
  await expect(cards.getByRole('button')).toHaveCount(4)
  await expect(cards).not.toContainText(/\$[\d,]+/)
  await expect(cards.locator('.console-card-meter')).toHaveCount(0)
  await scan(page, home(page), 'budget-home-redacted')
})

test('Key hints match the Home bindings and follow the C shortcut preference', async ({ page, hasTouch }) => {
  await openConsole(page)
  const hints = home(page).locator('[data-console-key-hints]')
  if (hasTouch) {
    await expect(hints).toBeHidden()
    return
  }
  await expect(hints).toBeVisible()
  await expect(hints).toHaveText('← →Left and right arrow keys NavigateEnter OpenC Control Centre')
  await tile(page, 'Overview').focus()
  await page.keyboard.press('ArrowRight')
  await expect(tile(page, 'Accounts')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('c')
  await expect(centre(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(centre(page)).toBeHidden()
  await page.keyboard.press('Enter')
  await page.waitForURL('**/accounts')
  await back(page).click()
  await scan(page, home(page), 'home-key-hints')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Control Centre keyboard shortcut (C)' }).click()
  await back(page).click()
  await expect(hints).toContainText('Control Centre shortcut off')
  await expect(hints.locator('kbd', { hasText: 'C' })).toHaveCount(0)
  await tile(page, 'Accounts').focus()
  await page.keyboard.press('c')
  await expect(centre(page)).toBeHidden()
})

test('Phase 6A captures at each gate width', async ({ page }, info) => {
  test.skip(!process.env.CONSOLE_PHASE6_CAPTURE_DIR || info.project.name === 'WebKit', 'Capture run only')
  test.setTimeout(240_000)
  const widths = info.project.name === 'Phone' ? [[320, 700], [390, 844]] : [[768, 1024], [1024, 768], [1440, 900]]
  await openConsole(page, replies(), { overviewGoal: goal.id })
  for (const [width, height] of widths) {
    await page.setViewportSize({ width, height })
    await select(page, 'Overview')
    await expect(home(page).locator('.console-orb-stat')).toHaveText('58%Emergency fund')
    await capture(page, `${width}-overview-goal`)
    await select(page, 'Expenses')
    await capture(page, `${width}-expenses`)
    await select(page, 'Budget')
    if (width === widths[0][0]) await capture(page, `${width}-budget-cold`)
    if (width === widths[0][0]) await loadBudget(page)
    await capture(page, `${width}-budget-cards`)
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Overview ring' })).toHaveValue(goal.id)
  await page.getByRole('combobox', { name: 'Overview ring' }).scrollIntoViewIfNeeded()
  await capture(page, `${widths.at(-1)![0]}-settings-overview-ring`)
})

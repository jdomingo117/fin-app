import { categoryDisplayName, type Account } from '../data'
import type { BudgetReadState } from './budgetWorkspace'
import type { BudgetPresentation, BudgetValue } from './budgetPresentation'
import type { PlanningGoal } from './planning'
import { goalProgress } from './consolePlan'

/* Console Home preview derivations. Each one reuses data a Home read or the
 * Budget session already holds, and returns an explicit state instead of a zero
 * when that data is missing. */

type CategoryFacet = { period: string; category: string; gross_cents: number }
export type ExpenseCategoryShare = { category: string; name: string; cents: number; share: number }

/**
 * Mirrors the Expenses hub: current-period facets with gross outflow, summed by
 * category and ranked by amount, as a share of the period's gross outflow.
 * Returns undefined while the report has no figures to share.
 */
export function topExpenseCategories(facets: CategoryFacet[] | undefined, grossCents: number | undefined, limit = 3) {
  if (!facets || grossCents === undefined) return undefined
  if (grossCents <= 0) return []
  const totals = new Map<string, number>()
  for (const facet of facets) {
    if (facet.period === 'current' && facet.gross_cents > 0) totals.set(facet.category, (totals.get(facet.category) ?? 0) + facet.gross_cents)
  }
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([category, cents]): ExpenseCategoryShare => ({ category, name: categoryDisplayName(category), cents, share: cents / grossCents }))
}

export type BudgetHomeCard = {
  id: string
  categoryId: string
  name: string
  planned: BudgetValue
  spent: BudgetValue
  /** Whole percent of the allocation spent, 0 to 100. Undefined without both amounts or an allocation. */
  progress?: number
  over: boolean
}

export type BudgetHomeCards =
  | { state: 'cold' | 'loading' | 'failed' | 'no-plan' | 'unsupported' | 'other-period' | 'no-limits' | 'unavailable' | 'refreshing' }
  | { state: 'cards'; cards: BudgetHomeCard[]; total: number }

/** Never starts a Budget read. A session that hasn't opened Budget stays `cold`. */
export function budgetHomeCards(loaded: boolean, readState: BudgetReadState, preview: BudgetPresentation | undefined, limit = 4): BudgetHomeCards {
  if (!loaded) return { state: readState === 'failed' ? 'failed' : readState === 'idle' ? 'cold' : 'loading' }
  if (!preview || preview.state === 'empty') return { state: 'no-plan' }
  if (preview.state === 'unsupported') return { state: 'unsupported' }
  if (preview.categoryMode === 'unavailable') return { state: 'unavailable' }
  if (preview.phase !== 'current') return { state: 'other-period' }
  if (readState === 'failed') return { state: 'failed' }
  if (readState !== 'ready') return { state: 'refreshing' }
  if (preview.categoryMode === 'pool' || !preview.categories.length) return { state: 'no-limits' }
  // Budget's own order, matching its category table, so a card is easy to find on the hub.
  const cards = preview.categories.map((row): BudgetHomeCard => {
    const { planned, spent } = row
    const measured = planned.availability === 'known' && spent.availability === 'known' && planned.cents > 0
    const progress = measured ? Math.max(0, Math.min(100, Math.floor(spent.cents * 100 / planned.cents))) : undefined
    return { id: row.id, categoryId: row.categoryId, name: categoryDisplayName(row.name), planned, spent, progress,
      over: measured && spent.cents > planned.cents }
  })
  return { state: 'cards', cards: cards.slice(0, limit), total: cards.length }
}

export type GoalRing = { goalId: string; name: string; percent: number; valueCents: number; targetCents: number }

/**
 * Progress toward the nominated planning goal, using the same current value as
 * Strategic projections. Missing, inactive or unmeasurable goals return
 * undefined so the ring keeps its trend art.
 */
export function goalRing(goals: PlanningGoal[] | undefined, goalId: string | null | undefined, accounts: Account[]): GoalRing | undefined {
  if (!goalId || !goals) return undefined
  const goal = goals.find(candidate => candidate.id === goalId)
  // A goal whose accounts aren't all in the directory can't be measured honestly.
  const progress = goal?.status === 'active' ? goalProgress(goal, accounts) : undefined
  if (!goal || !progress) return undefined
  const { valueCents, percent } = progress
  return { goalId: goal.id, name: goal.name, percent, valueCents, targetCents: goal.targetCents }
}

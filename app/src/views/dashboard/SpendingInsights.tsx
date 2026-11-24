import type { ReactNode } from 'react'
import Tile from '../../components/Tile'
import { categoryDisplayName, fmt, fmtCents, type Glow } from '../../data'
import type { cashFlow } from '../../lib/reports'
import { useView } from '../../router'

type CategoryAmount = { category: string; amount: number }
type CategoryChange = CategoryAmount & { delta: number }

export function dashboardAllocation(liquid: number, invested: number) {
  const allocation: { label: string; value: number; glow: Glow }[] = []
  if (invested > 0) allocation.push({ label: 'Investments', value: invested, glow: 'green' })
  if (liquid > 0 || !allocation.length) allocation.push({ label: 'Cash', value: Math.max(0, liquid), glow: 'cyan' })
  return allocation
}

export function SpendingInsights({ flow, from, to, period }: {
  flow: Awaited<ReturnType<typeof cashFlow>>
  from: string
  to: string
  period?: string
}) {
  const { go } = useView()
  const inc = flow.periods.current.earned_cents
  const spend = flow.periods.current.expense_cents
  const savings = inc === 0 ? 0 : Math.round(((inc - spend) / inc) * 100)
  // Spending insights use settled, real outflows only.  Unlike the old
  // capacity tile, they don't invent a budget baseline when the person has
  // not actually configured one.
  const catSpending: Record<string, number> = Object.create(null)
  const priorCatSpending: Record<string, number> = Object.create(null)
  for (const facet of flow.categories) {
    if (!facet.gross_cents) continue
    const totals = facet.period === 'current' ? catSpending : priorCatSpending
    totals[facet.category] = (totals[facet.category] ?? 0) + facet.gross_cents
  }
  const rankedCategories = Object.entries(catSpending)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
  const topCategory = rankedCategories[0] ?? null
  const topCategoryShare = spend > 0 && topCategory ? Math.round((topCategory.amount / spend) * 100) : 0

  const largestCategoryChange = Array.from(new Set([...Object.keys(catSpending), ...Object.keys(priorCatSpending)]))
    .map((category) => ({
      category,
      amount: catSpending[category] ?? 0,
      delta: (catSpending[category] ?? 0) - (priorCatSpending[category] ?? 0),
    }))
    .filter((change) => change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null
  const reviewCount = flow.periods.current.expense_attention_count
  return <SpendingReadout
    topCategory={topCategory}
    topCategoryShare={topCategoryShare}
    largestCategoryChange={largestCategoryChange}
    savings={savings}
    income={inc}
    reviewCount={reviewCount}
    onExploreExpenses={() => go('expenses', { state: { source: 'dashboard-insight', from, to } })}
    onExploreCategory={category => go('expenses', { state: { source: 'dashboard-insight', category, from, to } })}
    onReviewLedger={() => go('ledger', { state: { source: 'dashboard-insight', review: 'needs-review' } })}
    onExploreIncome={() => go('income')}
    period={period}
  />
}

function SpendingReadout({
  topCategory,
  topCategoryShare,
  largestCategoryChange,
  savings,
  income,
  reviewCount,
  onExploreExpenses,
  onExploreCategory,
  onReviewLedger,
  onExploreIncome,
  period,
}: {
  topCategory: CategoryAmount | null
  topCategoryShare: number
  largestCategoryChange: CategoryChange | null
  savings: number
  income: number
  reviewCount: number
  onExploreExpenses: () => void
  onExploreCategory: (category: string) => void
  onReviewLedger: () => void
  onExploreIncome: () => void
  period?: string
}) {
  const { theme } = useView()
  const consoleStyle = theme === 'console'
  const money = consoleStyle ? fmtCents : fmt
  const panel = (content: ReactNode, tag: ReactNode) => consoleStyle ? content : (
    <Tile title="Spending insights" tag={tag} span={2} className="flex min-h-[300px] flex-col overflow-hidden">
      {content}
    </Tile>
  )
  if (!topCategory) {
    return panel(
        <div className={`flex flex-1 flex-col items-start justify-center rounded-[14px] border border-dashed border-[var(--hair)] bg-[var(--hair-soft)] px-5 ${consoleStyle ? 'py-5' : ''}`}>
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">No settled outflows yet</span>
          <p className="mt-2 max-w-md text-[15px] leading-6 text-muted">Insights appear once spending activity has settled. Importing a statement or reviewing recent activity will make this panel useful.</p>
          <button type="button" onClick={onReviewLedger} className="mt-5 text-[14px] font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            Review transactions →
          </button>
        </div>,
        'last 30 days',
    )
  }

  const changeDirection = (largestCategoryChange?.delta ?? 0) >= 0 ? 'increased' : 'decreased'
  const changeTone = changeDirection === 'increased' ? 'text-neg' : 'text-pos'

  return panel(<>
      <div className="flex flex-1 flex-col gap-3.5">
        <button
          type="button"
          onClick={() => onExploreCategory(topCategory.category)}
          aria-label={consoleStyle ? undefined : `Explore ${categoryDisplayName(topCategory.category)} spending for ${period ?? "the last 30 days"}`}
          className="group w-full rounded-[14px] border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--hair))] bg-[var(--accent-wash)] px-4 py-3.5 text-left transition hover:border-accent/60 hover:bg-[color-mix(in_srgb,var(--accent-wash)_72%,var(--surface))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Largest outflow</p>
              <p className="mt-1.5 max-w-xl text-[17px] font-semibold leading-6 tracking-tight text-ink">
                <span className={consoleStyle ? undefined : 'text-accent-ink'}>{categoryDisplayName(topCategory.category)}</span> was your largest outflow: {money(topCategory.amount)} ({topCategoryShare}% of spending).
              </p>
              <p className="mt-2 body-copy">Explore this category in the Expenses analysis <span className="font-semibold text-accent-ink group-hover:underline">→</span></p>
            </div>
            <span aria-hidden="true" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-accent/30 bg-[var(--surface)] text-[16px] font-bold tabular-nums text-accent-ink">{topCategoryShare}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, topCategoryShare)}%` }} />
          </div>
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          {largestCategoryChange ? (
            <InsightAction
              eyebrow="Period change"
              sentence={`${categoryDisplayName(largestCategoryChange.category)} ${changeDirection} by ${money(Math.abs(largestCategoryChange.delta))} versus ${period ? "the preceding period" : "the prior 30 days"}.`}
              tone={consoleStyle ? 'text-ink' : changeTone}
              action="Explore category →"
              onClick={() => onExploreCategory(largestCategoryChange.category)}
            />
          ) : (
            <InsightSentence eyebrow="Period change" sentence="A comparison will appear once a prior 30-day period is available." />
          )}
          {reviewCount > 0 ? (
            <InsightAction
              eyebrow="Needs attention"
              sentence={`${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need${reviewCount === 1 ? 's' : ''} review before this period is fully classified.`}
              tone={consoleStyle ? 'text-ink' : 'text-warn'}
              action="Review transactions →"
              onClick={onReviewLedger}
            />
          ) : (
            <InsightAction
              eyebrow="Cash flow"
              sentence={income > 0 ? `You saved ${savings}% of settled inflow after spending this period.` : 'A savings insight will appear once settled inflow is recorded.'}
              tone={!consoleStyle && income > 0 ? (savings >= 0 ? 'text-pos' : 'text-neg') : 'text-muted'}
              action="Explore income →"
              onClick={onExploreIncome}
            />
          )}
        </div>
      </div>
      <p className="mt-4 border-t border-[var(--hair-soft)] pt-3.5 text-[11.5px] text-muted">Based on settled activity {period ? `for ${period}` : 'from the last 30 days'}.</p>
    </>,
    <button type="button" onClick={onExploreExpenses} className="font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">View all spending →</button>,
  )
}

function InsightAction({ eyebrow, sentence, tone, action, onClick }: { eyebrow: string; sentence: string; tone: string; action: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-[12px] border border-[var(--hair-soft)] bg-[var(--input-bg)] px-3.5 py-3 text-left transition hover:border-accent/50 hover:bg-[var(--hair-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
      <p className={`mt-1.5 text-[14px] font-medium leading-5 ${tone}`}>{sentence}</p>
      <p className="mt-2 text-[12.5px] font-semibold text-accent-ink group-hover:underline">{action}</p>
    </button>
  )
}

function InsightSentence({ eyebrow, sentence }: { eyebrow: string; sentence: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--hair-soft)] bg-[var(--input-bg)] px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
      <p className="mt-1.5 text-[14px] leading-5 text-muted">{sentence}</p>
    </div>
  )
}

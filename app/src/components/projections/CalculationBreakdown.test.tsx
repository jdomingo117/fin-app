import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { buildProjection, buildProjectionBreakdown, type ProjectionMetric } from '../../lib/projections'
import { CalculationBreakdown } from './CalculationBreakdown'

it.each<ProjectionMetric>(['cash', 'netWorth'])('%s reconciles with positive, negative, and no planned events', metric => {
  for (const amount of [10_000, -10_000, 0]) {
    const growth = metric === 'netWorth' ? 5_000 : 0
    const inputs = {
      metric, currentValue: 250_000, investmentBalance: 100_000,
      monthlyFlow: 2_000, monthlyInvestmentContribution: 0,
      annualReturnPct: (1.05 ** 12 - 1) * 100, months: 2,
      startDate: new Date(2026, 0, 1),
      events: amount ? [{ id: 'evt', name: 'Fixture', amountCents: amount, cadence: 'once' as const, startDate: '2026-02-01', endDate: null }] : [],
    }
    const [month] = buildProjectionBreakdown(inputs)
    const projectedValue = buildProjection(inputs)[1].value
    expect(month.plannedMovement).toBe(amount)
    expect(month.investmentGrowth).toBe(growth)
    expect(projectedValue).toBe(250_000 + 2_000 + amount + growth)
    const html = renderToStaticMarkup(<CalculationBreakdown metric={metric} currentValue={250_000} projectedValue={projectedValue}
      monthlyFlow={2_000} months={1} plannedMovement={month.plannedMovement} investmentGrowth={month.investmentGrowth}
      investmentBalance={100_000} investmentContribution={0} annualReturn={inputs.annualReturnPct}
      historyMonths={0} historyFrom={null} historyTo={null} scenarioAdjustment={null} scenarioValue={projectedValue}
      scenarioLabel="" scenarioStartLabel="" scenarioActiveMonths={0} />)
    const observed = metric === 'cash' ? '($20 × 1)' : '$20'
    const eventTerm = amount > 0 ? ' + $100' : amount < 0 ? ' − $100' : ''
    const growthTerm = growth ? ' + $50' : ''
    expect(html.replace(/<[^>]+>/g, '')).toContain(`$2,500 + ${observed}${eventTerm}${growthTerm} = $${(projectedValue / 100).toLocaleString('en-AU')}`)
    expect(html.includes('Planned events')).toBe(amount !== 0)
    if (amount) expect(html.replace(/<[^>]+>/g, '')).toContain(`Planned events${amount > 0 ? '+' : '−'}$100`)
    if (growth) expect(html.replace(/<[^>]+>/g, '')).toContain('Estimated investment growth$50')
  }
})

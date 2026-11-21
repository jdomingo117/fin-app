import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabaseClient',()=>({supabase:{}}))
import { historyBaseline, historyReview, type MovementHistory, type MovementMonth } from './projectionHistory'
import { buildProjection, buildProjectionBreakdown } from './projections'

function month(date:string, movement:number, contribution=0):MovementMonth {
  return {month:date,run_rate_movement_cents:movement,investment_contribution_cents:contribution,
    observed_in_cents:0,observed_out_cents:0,residual_cents:0,cash_balance_cents:0,account_balance_cents:0}
}
describe('scoped projection history',()=>{
  it('uses every complete month including empty months, excluding current-month movement',()=>{
    const history:MovementHistory={baseline_from:'2026-05-01',baseline_until:'2026-11-01',months:[
      month('2026-05-01',10001,1000),month('2026-06-01',0),month('2026-07-01',-2000),
      month('2026-08-01',0),month('2026-09-01',3000),month('2026-10-01',0),month('2026-11-01',999999),
    ]}
    const baseline=historyBaseline(history)
    expect(baseline).toEqual({monthlyFlow:1834,monthlyInvestmentContribution:167,monthsUsed:6,fromMonth:'2026-05',toMonth:'2026-10'})
    const inputs={metric:'netWorth' as const,currentValue:500000,investmentBalance:100000,monthlyFlow:baseline.monthlyFlow,
      monthlyInvestmentContribution:baseline.monthlyInvestmentContribution,annualReturnPct:5,months:24,
      events:[{id:'event',name:'Bill',amountCents:-1001,cadence:'monthly' as const,startDate:'2026-12-01'}],startDate:new Date('2026-11-21')}
    const breakdown=buildProjectionBreakdown(inputs)
    expect(buildProjection(inputs).slice(1).map(p=>p.value)).toEqual(breakdown.map(m=>m.closingValue))
    for(const m of breakdown)expect(m.openingValue+m.observedRunRate+m.adjustment+m.plannedMovement+m.investmentGrowth).toBe(m.closingValue)
  })
  it('reconciles review components from uncapped SQL facts',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-21'))
    const row={...month('2026-10-01',7000),observed_in_cents:10000,observed_out_cents:-3000,residual_cents:-500}
    const review=historyReview({baseline_from:'2026-10-01',baseline_until:'2026-11-01',months:[row]},6000,
      [{id:'holiday',name:'Holiday',amountCents:-1000,cadence:'once',startDate:'2026-10-15'}])
    expect(review.actualMovement).toBe(7000)
    expect(review.variance).toBe(2000)
    expect(review.observedRunRateDifference+review.plannedEventDifference+review.recurringTimingDifference+review.uncategorisedResidual).toBe(review.variance)
    vi.useRealTimers()
  })
})

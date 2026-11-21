import { supabase } from './supabaseClient'
import { safeInteger } from './reports'
import type { ProjectionEvent, ProjectionMetric } from './projections'
import { latestCompletedMonth, type PlanningMonthReview } from './planningReview'

export interface MovementMonth {
  month:string; run_rate_movement_cents:number; investment_contribution_cents:number
  observed_in_cents:number; observed_out_cents:number; residual_cents:number
  cash_balance_cents:number; account_balance_cents:number
}
export interface MovementHistory {baseline_from:string|null;baseline_until:string;months:MovementMonth[]}
export async function projectionHistory(tenant:string, asOf:string, accounts:string[], metric:ProjectionMetric, excluded:string[]):Promise<MovementHistory> {
  const {data,error} = await supabase.rpc('movement_history',{p_tenant:tenant,p_as_of:asOf,p_account_ids:accounts,
    p_metric:metric,p_exclude_charge_ids:excluded})
  if (error) throw error
  if (!data || !Array.isArray(data.months)) throw Error('Missing movement history')
  return {...data,months:data.months.map((row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row)
    .map(([key,value])=>[key,key.endsWith('_cents') ? safeInteger(value) : value])))}
}
export function historyBaseline(history:MovementHistory|null) {
  const months = history?.baseline_from ? history.months.filter(m=>m.month >= history.baseline_from! && m.month < history.baseline_until) : []
  return {monthlyFlow:Math.round(months.reduce((n,m)=>n+m.run_rate_movement_cents,0)/Math.max(months.length,1)),
    monthlyInvestmentContribution:Math.round(months.reduce((n,m)=>n+m.investment_contribution_cents,0)/Math.max(months.length,1)),
    monthsUsed:months.length,fromMonth:months[0]?.month.slice(0,7) ?? null,toMonth:months.at(-1)?.month.slice(0,7) ?? null}
}
export function historyReview(history:MovementHistory|null, monthlyRunRate:number, events:ProjectionEvent[]):PlanningMonthReview {
  const month = latestCompletedMonth()
  const row = history?.months.find(row=>row.month.slice(0,7) === month)
  const observedIncome = row?.observed_in_cents ?? 0, observedSpend = row?.observed_out_cents ?? 0
  const actualMovement = observedIncome + observedSpend, uncategorisedResidual = row?.residual_cents ?? 0
  const plannedMovement = events.filter(e=>e.cadence === 'once' ? e.startDate.slice(0,7) === month
    : e.startDate.slice(0,7) <= month && (!e.endDate || e.endDate.slice(0,7) >= month)).reduce((sum,e)=>sum+e.amountCents,0)
  return {month,actualMovement,plannedMovement,expectedMovement:monthlyRunRate+plannedMovement,
    variance:actualMovement-monthlyRunRate-plannedMovement,observedIncome,observedSpend,
    observedRunRateDifference:actualMovement-uncategorisedResidual-monthlyRunRate,plannedEventDifference:-plannedMovement,
    recurringTimingDifference:0,uncategorisedResidual}
}

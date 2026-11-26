import { useReport } from './useReport'
import { supabase } from '../lib/supabaseClient'
import { completePages, SCOPE_PAGE_SIZE } from '../lib/scopedPages'
import type { PlanningGoal, PlanningScenario, PlanningEvent } from '../lib/planning'

export async function readPlanning(tenant: string) {
  async function byId(table: string, columns: string) {
    return completePages(async (cursor: string | null) => {
      let query = supabase.from(table).select(columns).eq('tenant_id',tenant).order('id').limit(SCOPE_PAGE_SIZE)
      if (cursor) query = query.gt('id',cursor)
      const {data,error} = await query
      if (error) throw error
      return {rows:data as unknown as Record<string, unknown>[],next:data.length === SCOPE_PAGE_SIZE ? (data.at(-1) as unknown as {id:string}).id : null}
    })
  }
  const [goals, scenarios, events, memberships] = await Promise.all([
    byId('planning_goals','id,name,metric,target_cents,target_date,status,updated_at'),
    byId('planning_scenarios','id,goal_id,name,is_baseline,annual_return_bps,include_recurring,status'),
    byId('planning_events','id,scenario_id,name,amount_cents,cadence,start_date,end_date'),
    completePages(async (cursor: {goal:string;account:string} | null) => {
      let query = supabase.from('planning_goal_accounts').select('goal_id,account_id,planning_goals!inner(tenant_id)')
        .eq('planning_goals.tenant_id',tenant).order('goal_id').order('account_id').limit(SCOPE_PAGE_SIZE)
      if (cursor) query = query.or(`goal_id.gt.${cursor.goal},and(goal_id.eq.${cursor.goal},account_id.gt.${cursor.account})`)
      const {data,error} = await query
      if (error) throw error
      const last = data.at(-1)
      return {rows:data,next:data.length === SCOPE_PAGE_SIZE && last ? {goal:last.goal_id as string,account:last.account_id as string} : null}
    }),
  ])
  const accountsByGoal = new Map<string,string[]>()
  for (const row of memberships) {
    const ids = accountsByGoal.get(row.goal_id) ?? []
    ids.push(row.account_id); accountsByGoal.set(row.goal_id,ids)
  }
  return {
    planningGoals:goals.map(g=>({id:g.id,name:g.name,metric:g.metric,targetCents:g.target_cents,targetDate:g.target_date,
      status:g.status,updatedAt:g.updated_at,accountIds:accountsByGoal.get(g.id as string) ?? []}) as PlanningGoal)
      .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
    planningScenarios:scenarios.map(s=>({id:s.id,goalId:s.goal_id,name:s.name,isBaseline:s.is_baseline,
      annualReturnBps:s.annual_return_bps,includeRecurring:s.include_recurring,status:s.status}) as PlanningScenario),
    planningEvents:events.map(e=>({id:e.id,scenarioId:e.scenario_id,name:e.name,amountCents:e.amount_cents,
      cadence:e.cadence,startDate:e.start_date,endDate:e.end_date}) as PlanningEvent),
  }
}
export function usePlanning(enabled = true) { return useReport('planning',readPlanning,enabled) }

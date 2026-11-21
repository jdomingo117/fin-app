import type { Account, Txn } from '../data'
import { supabase } from './supabaseClient'
import { completePages, SCOPE_PAGE_SIZE } from './scopedPages'
import { buildRecurring, type RecurrenceHint, type RecurringSeriesOverride, type RecurringFacts } from './recurring'
import { safeInteger } from './reports'
import type { Cadence } from './cadence'

export type RecurrenceGrain = 'parent' | 'reporting'
export const recurrenceKey = (account:string,merchant:string) => JSON.stringify([account,merchant])
export const shiftedDay = (day:string, offset:number) => new Date(Date.parse(day+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10)
export interface ProposalKey { account_id:string;merchant_key:string }
export async function recurrenceSummary(tenant:string,today:string,accounts:string[],grain:RecurrenceGrain,proposals:ProposalKey[] = []) {
  const {data,error} = await supabase.rpc('recurrence_scope_summary',{p_tenant:tenant,p_as_of:today,p_account_ids:accounts,p_grain:grain,p_proposals:proposals})
  if (error) throw error
  if (!data || !Array.isArray(data.groups) || !Array.isArray(data.names)) throw Error('Missing recurrence summary')
  const groups = new Map<string,{trailing:number;pressure:number}>()
  for (const row of data.groups) groups.set(recurrenceKey(row.account_id,row.merchant_key),{
    trailing:safeInteger(row.trailing_cents),pressure:safeInteger(row.pressure_cents)})
  return {facts:{groups,totalPressure:safeInteger(data.total_pressure_cents)} as RecurringFacts,
    names:new Map<string,string>(data.names.map((n:ProposalKey & {merchant:string})=>[recurrenceKey(n.account_id,n.merchant_key),n.merchant]))}
}

export async function readRecurrence(tenant:string,accounts:Account[],today:string,grain:RecurrenceGrain) {
  const ids = accounts.map(a=>a.id)
  const names = new Map(accounts.map(a=>[a.id,a.name]))
  // A complete extended evidence scope supplies both independent windows. The
  // shared detector alone admits Annual results from the older evidence.
  const observations = ids.length ? completePages(async (cursor:{date:string;id:string;position:number}|null)=>{
    const reporting = grain === 'reporting'
    let q = supabase.from(reporting ? 'reporting_transaction_lines' : 'transactions_analytic')
      .select(reporting ? 'parent_id,allocation_id,position,account_id,date,amount,merchant,merchant_key,category,subcategory,kind' : 'id,account_id,date,amount,merchant,merchant_key,category,subcategory,kind')
      .eq('tenant_id',tenant).in('account_id',ids).eq('kind','expense').lt('amount',0).eq('pending',false).eq('is_transfer',false)
      .gte('date',shiftedDay(today,-3*366)).lte('date',today).order('date',{ascending:false})
      .order(reporting ? 'parent_id' : 'id',{ascending:false})
    if (reporting) q = q.order('position')
    if (cursor) q = q.or(reporting
      ? `date.lt.${cursor.date},and(date.eq.${cursor.date},parent_id.lt.${cursor.id}),and(date.eq.${cursor.date},parent_id.eq.${cursor.id},position.gt.${cursor.position})`
      : `date.lt.${cursor.date},and(date.eq.${cursor.date},id.lt.${cursor.id})`)
    const {data,error} = await q.limit(SCOPE_PAGE_SIZE)
    if (error) throw error
    const rows = data as unknown as {id?:string;parent_id?:string;allocation_id?:string;position?:number;account_id:string;date:string;amount:number;merchant:string;merchant_key:string;category:string;subcategory:string;kind:'expense'}[]
    const last = rows.at(-1)
    return {rows:rows.map(t=>({id:t.allocation_id ? `allocation:${t.allocation_id}` : (t.id ?? t.parent_id!),parentTransactionId:t.allocation_id ? t.parent_id : undefined,
      account_id:t.account_id,account:names.get(t.account_id),date:t.date,amount:safeInteger(t.amount),merchant:t.merchant,merchantKey:t.merchant_key,
      cat:t.category,subcat:t.subcategory,kind:t.kind,pending:false,isTransfer:false}) as Txn),
      next:rows.length === SCOPE_PAGE_SIZE && last ? {date:last.date,id:(last.id ?? last.parent_id)!,position:last.position ?? 0} : null}
  }) : Promise.resolve([] as Txn[])
  async function directory(table:string,columns:string) {
    return completePages(async (cursor:string|null)=>{
      let q=supabase.from(table).select(columns).eq('tenant_id',tenant).order('id').limit(SCOPE_PAGE_SIZE)
      if(cursor)q=q.gt('id',cursor)
      if(table==='recurring_series_overrides')q=q.in('account_id',ids)
      const {data,error}=await q
      if(error)throw error
      return {rows:data as unknown as Record<string,unknown>[],next:data.length===SCOPE_PAGE_SIZE ? (data.at(-1) as unknown as {id:string}).id : null}
    })
  }
  const [transactions,hints,overrides,summary] = await Promise.all([observations,
    directory('merchant_recurrence_hints','id,merchant_key,is_recurring,suggested_cadence,confidence'),
    ids.length ? directory('recurring_series_overrides','id,merchant_key,account_id,state,cadence_override,expected_amount_override,next_expected_override,reminder_days_before') : Promise.resolve([]),
    recurrenceSummary(tenant,today,ids,grain),
  ])
  const recurrenceHints = new Map<string,RecurrenceHint>(hints.map(h=>[h.merchant_key as string,{isRecurring:h.is_recurring as boolean,
    suggestedCadence:h.suggested_cadence as Cadence|null,confidence:h.confidence as number}]))
  const recurrenceOverrides = overrides.map(o=>({id:o.id,merchantKey:o.merchant_key,accountId:o.account_id,state:o.state,
    cadenceOverride:o.cadence_override,expectedAmountOverride:o.expected_amount_override,nextExpectedOverride:o.next_expected_override,
    reminderDaysBefore:o.reminder_days_before}) as RecurringSeriesOverride)
  return buildRecurring(transactions,accounts,today,recurrenceHints,recurrenceOverrides,summary.facts)
}

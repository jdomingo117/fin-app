import { supabase } from './supabaseClient'
import type { Txn } from '../data'

export function safeInteger(value: unknown): number {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+$/.test(value))) throw Error('Expected integer cents')
  const n = Number(value)
  if (!Number.isSafeInteger(n)) throw RangeError('Report integer exceeds safe precision or is fractional')
  return n
}

interface Period { earned_cents: number; gross_cents: number; expense_cents: number; expense_attention_count: number }
export interface Facet {
  period: 'current' | 'prior'; category: string; subcategory: string | null
  earned_cents: number; gross_cents: number; expense_count: number; deposit_count: number
  largest_deposit_cents: number; latest_deposit: string | null
}
interface Flow {
  periods: {current: Period; prior: Period}
  buckets: (Pick<Period,'earned_cents'|'gross_cents'|'expense_cents'> & {bucket:string})[]
  categories: Facet[]
  top_merchant: {merchant:string; gross_cents:number} | null
}
interface Portfolio {
  net_worth_cents:number; cash_asset_cents:number; investment_asset_cents:number
  net_movement_30d_cents:number; attention_count:number; transfer_leg_count:number
}
function parseTotals(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(parseTotals)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, field]) =>
    [key, key.endsWith('_cents') || key.endsWith('_count') ? safeInteger(field) : parseTotals(field)]))
}
async function report<T>(read:PromiseLike<{data:unknown;error:unknown}>):Promise<T> {
  const {data,error} = await read
  if (error) throw error
  if (!data) throw Error('Missing report')
  return parseTotals(data) as T
}
export const portfolio = (tenant:string, date:string) => report<Portfolio>(supabase.rpc('portfolio_summary',{p_tenant:tenant,p_as_of:date}))
export interface FlowParams {
  p_from:string; p_to:string; p_account_ids?:string[]; p_grain?:'parent'|'reporting'; p_bucket?:'day'|'week'|'month'
  p_categories?:string[]; p_subcategories?:string[]; p_focus_from?:string; p_focus_to?:string
}
export const cashFlow = (tenant:string, params:FlowParams) => report<Flow>(supabase.rpc('cash_flow_report',{p_tenant:tenant,...params}))
export const movements = (tenant:string, date:string, account:string) =>
  report<{months:{month:string;account_balance_cents:number}[]}>(supabase.rpc('movement_history',{p_tenant:tenant,p_as_of:date,p_account_ids:[account]}))

export async function monthlyWorth(tenant:string) {
  const {data,error} = await supabase.from('net_worth_monthly').select('month,value_cents::text').eq('tenant_id',tenant)
    .order('month',{ascending:false}).limit(12)
  if (error) throw error
  return data.reverse().map(row => ({month:row.month as string,value:safeInteger(row.value_cents)}))
}
export async function latestLines(tenant:string, limit:number, deposits?:{accounts:string[];from:string;to:string;source?:string}) {
  let query = lineQuery(tenant)
  if (deposits) {
    if (!deposits.accounts.length) return []
    query = query.in('account_id',deposits.accounts).gte('date',deposits.from).lte('date',deposits.to)
      .eq('pending',false).eq('is_transfer',false).gt('amount',0)
      .or('kind.eq.income,and(kind.eq.transfer,kind_source.eq.derived,transfer_state.eq.rejected)')
    if (deposits.source) query = query.eq('category',deposits.source)
  }
  const {data,error} = await query.order('date',{ascending:false}).order('parent_id',{ascending:false}).order('position').limit(limit)
  if (error) throw error
  return data.map(mapLine)
}
type Line = NonNullable<Awaited<ReturnType<typeof lineQuery>>['data']>[number]
function lineQuery(tenant: string) {
  return supabase.from('reporting_transaction_lines').select('*').eq('tenant_id',tenant)
}
function mapLine(row: Line): Txn {
  return {
    id:row.allocation_id ? 'allocation:'+row.allocation_id : row.parent_id, parentTransactionId:row.allocation_id ? row.parent_id : undefined,
    isAllocation:!!row.allocation_id, allocationNote:row.allocation_note, amount:safeInteger(row.amount), account_id:row.account_id,
    date:row.date,merchant:row.merchant,merchantKey:row.merchant_key,originalDescription:row.original_description,kind:row.kind,
    kindSource:row.kind_source,cat:row.category,subcat:row.subcategory,pending:row.pending,isTransfer:row.is_transfer,
    transferState:row.transfer_state,needsReview:row.needs_review,
  }
}

// All Time includes future-dated rows. Resolve both edges on the server so
// the provider's bounded activity list cannot truncate the report window.
export async function accountFlow(tenant:string,account:string,range:{from:string;to:string}|null,today:string) {
  if (!range) {
    const edge = async (ascending:boolean) => {
      const {data,error} = await supabase.from('transactions').select('date').eq('tenant_id',tenant)
        .eq('account_id',account).order('date',{ascending}).limit(1)
      if (error) throw error
      return data[0]?.date ?? today
    }
    const [from,to] = await Promise.all([edge(true),edge(false)])
    range = {from,to}
  }
  return cashFlow(tenant,{p_account_ids:[account],p_grain:'parent',p_bucket:'month',p_from:range.from,p_to:range.to})
}

export interface LineCursor { date: string; parent_id: string; position: number }
export interface ExpenseFilter {
  accounts: string[]; from: string; to: string; categories: string[]; subcats: string[]
  query: string; lo: number | null; hi: number | null
}
export async function expensePage(tenant: string, filter: ExpenseFilter, cursor: LineCursor | null) {
  const filtered = () => {
    let q = supabase.from('reporting_transaction_lines').select('*', { count: 'exact' }).eq('tenant_id',tenant)
      .in('account_id',filter.accounts).gte('date',filter.from).lte('date',filter.to)
      .eq('pending',false).eq('is_transfer',false).lt('amount',0)
      .or('kind.eq.expense,and(kind.eq.transfer,kind_source.eq.derived,transfer_state.eq.rejected)')
    if (filter.categories.length) q = q.in('category',filter.categories)
    if (filter.subcats.length) q = q.in('subcategory',filter.subcats)
    if (filter.lo !== null) q = q.lte('amount',-filter.lo)
    if (filter.hi !== null) q = q.gte('amount',-filter.hi)
    if (filter.query.trim()) q = q.ilike('merchant','%' + filter.query.trim().replace(/[\\%_]/g,'\\$&') + '%')
    return q
  }
  let query = filtered()
  if (cursor) {
    const { date, parent_id, position } = cursor
    query = query.or(`date.lt.${date},and(date.eq.${date},parent_id.lt.${parent_id}),and(date.eq.${date},parent_id.eq.${parent_id},position.gt.${position})`)
  }
  const [page, total] = await Promise.all([
    query.order('date',{ascending:false}).order('parent_id',{ascending:false}).order('position').limit(16),
    cursor ? filtered().limit(0) : null,
  ])
  if (page.error) throw page.error
  if (total?.error) throw total.error
  const rows = page.data.slice(0,15)
  const last = rows.at(-1)
  return { rows: rows.map(mapLine), matching: (total ?? page).count ?? 0,
    next: page.data.length > 15 && last ? { date:last.date,parent_id:last.parent_id,position:last.position } : null }
}

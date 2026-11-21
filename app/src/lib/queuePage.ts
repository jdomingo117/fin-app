import { supabase } from './supabaseClient'
import { useKeysetPage } from '../hooks/useKeysetPage'

const projections = {
  transfer_links: 'id,state,score,reasons,ambiguous,from_txn:transactions!transfer_links_from_txn_id_fkey(id,date,amount,original_description,account_id),to_txn:transactions!transfer_links_to_txn_id_fkey(id,date,amount,original_description,account_id)',
  transactions_analytic: 'id,date,amount,original_description,account_id',
  transfer_match_overflow: 'amount_cents,leg_count',
  investment_cash_links: 'id,state,score,reasons,ambiguous,transaction:transactions!investment_cash_links_transaction_id_fkey(id,date,amount,original_description,account_id),activity:investment_activities!investment_cash_links_activity_id_fkey(id,trade_date,activity_type,value_cents,account_id)',
  investment_activities: 'id,trade_date,activity_type,quantity_delta,unit_price,value_cents,brokerage_cents,source_label',
} as const

type Table = keyof typeof projections
type Cursor = { value: number | string; id: string; seen: number }
export function useQueuePage<T>(table: Table, order: 'score' | 'date' | 'trade_date' | 'amount_cents', filters: Record<string,string>, revision = 0) {
  return useKeysetPage([table, filters, revision], async (tenant, cursor: Cursor | null) => {
    const base = () => supabase.from(table).select(projections[table],{ count: 'exact' }).eq('tenant_id',tenant).match(filters)
    let query = base().order(order,{ascending:false})
    if (order !== 'amount_cents') query = query.order('id',{ascending:false})
    if (cursor) query = order === 'amount_cents' ? query.lt(order,cursor.value)
      : query.or(`${order}.lt.${cursor.value},and(${order}.eq.${cursor.value},id.lt.${cursor.id})`)
    const [page, total] = await Promise.all([query.limit(51), cursor ? base().limit(0) : null])
    if (page.error) throw page.error
    if (total?.error) throw total.error
    const rows = page.data.slice(0,50) as unknown as T[]
    const last = rows.at(-1) as Record<string, string | number> | undefined
    const seen = (cursor?.seen ?? 0) + rows.length
    const next = last && page.data.length > 50 && (table !== 'transactions_analytic' || seen < 500)
      ? { value:last[order], id:String(last.id ?? ''), seen } : null
    return { rows, next, count:(total ?? page).count ?? 0 }
  })
}

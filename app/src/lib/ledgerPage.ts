import type { Txn } from '../data'
import { mapParent } from './reportParent'
import { supabase } from './supabaseClient'

export interface LedgerCursor { date: string; id: string }
export interface LedgerPage {
  rows: Txn[]
  before: LedgerCursor | null
  matching_count: number
  attention_count: number
  has_more: boolean
}
export async function ledgerPage(tenant: string, params: Record<string, unknown>, cursor: LedgerCursor | null = null): Promise<LedgerPage> {
  const { data, error } = await supabase.rpc('ledger_page', {
    ...params, p_tenant: tenant, p_before_date: cursor?.date, p_before_id: cursor?.id,
  })
  if (error) throw error
  type Parent = Parameters<typeof mapParent>[0] & { account_name: string; allocations: Txn['allocations'] }
  return { ...data, rows: data.rows.map((p: Parent) => ({ ...mapParent(p, p.account_name), allocations: p.allocations })) }
}
export async function hydrateParents(tenant: string, ids: string[]) {
  if (!ids.length) return []
  return (await ledgerPage(tenant, { p_ids: ids, p_limit: ids.length })).rows
}

async function readValue<T>(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export function reviewIds(tenant: string, scope: 'eligible' | 'unresolved') {
  return readValue<string[]>(supabase.rpc('ledger_review_ids', { p_tenant: tenant, p_scope: scope }))
}

export function selectionIds(tenant: string, params: Record<string, unknown>) {
  return readValue<string[]>(supabase.rpc('ledger_selection_ids', { ...params, p_tenant: tenant }))
}

export function activityCategories(tenant: string, account: string) {
  return readValue<string[]>(supabase.rpc('account_activity_categories', { p_tenant: tenant, p_account: account }))
}

export interface TransferBatch {
  selectedIds: string[]
  ambiguousCount: number
  deferredCount: number
  amount: number
  total: number
}
export function transferBatch(tenant: string, queue: 'suggested' | 'unmatched', group: string, deselected: string[]) {
  return readValue<TransferBatch>(supabase.rpc('transfer_group_batch', {
    p_tenant: tenant, p_queue: queue, p_group: group, p_deselected: deselected,
  }))
}
export function overflowSummary(tenant: string) {
  return readValue<{ bucketCount: number; legCount: number }>(supabase.rpc('transfer_overflow_summary', { p_tenant: tenant }))
}

import React, { useContext, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import { AuthContext } from '../../src/contexts/AuthContext'
import { BudgetContext, type Workspace } from '../../src/contexts/BudgetContext'
import { DataContext } from '../../src/contexts/DataContext'
import { supabase } from '../../src/lib/supabaseClient'
import LedgerView from '../../src/views/LedgerView'
import '../../src/index.css'

// The fixture is fully in-memory. Every Supabase read and write the Ledger makes is
// answered below, so this page never sends a request or touches a database.

const TENANT = 'fixture-tenant'
const ACCOUNT = { id: 'test-account', name: 'Test account' }

// Rows in `transactions_analytic` shape. Array order is the canonical
// `date DESC, id DESC` order that `ledger_page` returns.
type Row = {
  id: string; date: string; merchant: string; merchant_key: string; original_description: string
  category: string; category_id: string | null; subcategory: string | null; subcategory_id: string | null
  kind: string; kind_source: string; category_source: string | null; category_confidence: number | null
  needs_review: boolean; amount: number; account_id: string; is_recurring: boolean; is_subscription: boolean
  is_reimbursable: boolean; is_tax_related: boolean; is_transfer: boolean; pending: boolean
  spending_nature: string | null; transfer_state: string | null
}
const rows: Row[] = new URLSearchParams(window.location.search).has('empty') ? [] : Array.from({ length: 570 }, (_, index) => ({
  id: `txn-${index}`, date: '2026-09-01', merchant: `Merchant ${String(index).padStart(3, '0')}`,
  merchant_key: 'fixture-merchant', original_description: `MERCHANT ${index}`,
  category: index === 1 ? 'Uncategorized' : 'Food & drink', category_id: null,
  subcategory: index === 1 ? null : 'Coffee', subcategory_id: null, kind: 'expense', kind_source: 'derived',
  category_source: 'ai', category_confidence: 0.8, needs_review: index === 0, amount: -1000, account_id: ACCOUNT.id,
  is_recurring: false, is_subscription: false, is_reimbursable: false, is_tax_related: false, is_transfer: false,
  pending: false, spending_nature: null, transfer_state: null,
}))

type Params = Record<string, unknown>
const attention = (row: Row) => row.needs_review || row.category === 'Uncategorized'
function reviewMatch(row: Row, review: unknown) {
  switch (review ?? 'all') {
    case 'all': return true
    case 'needs-attention': return attention(row)
    case 'needs-review': return row.needs_review
    case 'uncategorized': return row.category === 'Uncategorized'
    case 'unresolved': return row.category === 'Uncategorized' && row.category_source === null
    case 'eligible': return row.category_source !== 'user' && row.category_source !== 'bank' && !(row.kind === 'adjustment' && row.kind_source === 'system')
    case 'missing-subcategory': return false
    case 'recurring': return row.is_recurring
    case 'subscription': return row.is_subscription
    case 'reimbursable': return row.is_reimbursable
    case 'tax-related': return row.is_tax_related
    default: return row.category_source === review
  }
}
function matching(p: Params) {
  const accounts = (p.p_account_ids ?? p.p_accounts) as string[] | null | undefined
  const ids = p.p_ids as string[] | undefined
  const query = typeof p.p_query === 'string' ? p.p_query.trim().toLowerCase() : ''
  return rows.filter((row) => (!accounts || accounts.includes(row.account_id)) && (!ids || ids.includes(row.id))
    && (!p.p_category || row.category === p.p_category) && (!p.p_kind || row.kind === p.p_kind)
    && (!query || [row.merchant, row.original_description, ACCOUNT.name, row.category, row.subcategory, row.kind]
      .join(' ').toLowerCase().includes(query))
    && reviewMatch(row, p.p_review))
}
function ledgerPage(p: Params) {
  const matched = matching(p)
  const limit = Number(p.p_limit ?? 50)
  const start = p.p_before_id ? matched.findIndex((row) => row.id === p.p_before_id) + 1 : 0
  const page = matched.slice(start, start + limit)
  const cursor = (row: Row | undefined) => row ? { date: row.date, id: row.id } : null
  return {
    matching_count: matched.length, attention_count: matched.filter(attention).length,
    has_more: matched.length > start + limit, before: cursor(page.at(-1)), after: cursor(page[0]),
    rows: page.map((row) => ({ ...row, account_name: ACCOUNT.name, allocations: [] })),
  }
}
const rpc = async (name: string, p: Params) => {
  if (name === 'ledger_page') return { data: ledgerPage(p), error: null }
  if (name === 'ledger_selection_ids') return { data: matching(p).slice(0, 500).map((row) => row.id), error: null }
  if (name === 'ledger_review_ids') return { data: rows.filter((row) => reviewMatch(row, p.p_scope)).map((row) => row.id), error: null }
  return { data: null, error: { message: `Fixture has no RPC ${name}` } }
}

// A chainable stand-in for `supabase.from(...)`. Only `transactions` id
// existence checks return rows; taxonomy and merchant rules are empty.
function from(table: string) {
  let ids: string[] | null = null
  const builder = {
    select: () => builder, eq: () => builder, gt: () => builder, order: () => builder, limit: () => builder,
    in: (_column: string, values: string[]) => { ids = values; return builder },
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({
      data: table === 'transactions' && ids ? rows.filter((row) => ids!.includes(row.id)).map((row) => ({ id: row.id })) : [],
      error: null,
    }),
  }
  return builder
}

const calls: Array<{ action: string; transaction_ids?: string[] }> = []
Object.assign(window, { ledgerFixtureCalls: calls })
const invoke = async (_name: string, options: { body: { action: string; transaction_ids?: string[] } }) => {
  calls.push(options.body)
  if ((window as unknown as { ledgerFixtureFailure?: boolean }).ledgerFixtureFailure && options.body.action === 'preview') return { data: null, error: { message: 'Simulated preview failure' } }
  if (options.body.action === 'apply') return { data: { updated: 1, operation_id: 'test-operation' }, error: null }
  const ids = options.body.transaction_ids ?? []
  return { data: {
    rows: ids.map((id, index) => {
      const row = rows.find((transaction) => transaction.id === id)!
      const current = { category: row.category, subcategory: row.subcategory, source: 'ai', confidence: 0.8, needs_review: row.needs_review }
      return { transaction_id: id, date: row.date, merchant: row.merchant, current, proposed: index === 0 ? { ...current, category: 'Transport', subcategory: 'Fuel' } : null, status: index === 0 ? 'suggested' : 'unchanged', protection_reason: null }
    }),
    stats: { requested: ids.length, fromCache: 0, fromBank: 0, fromAi: 0, geminiCalls: 0, selected: ids.length, eligible: ids.length },
  }, error: null }
}
Object.defineProperty(supabase, 'functions', { value: { invoke } })
Object.defineProperty(supabase, 'rpc', { value: rpc })
Object.defineProperty(supabase, 'from', { value: from })

const user = { id: 'fixture-user' } as User
const auth = {
  session: { user } as Session, user, tenantId: TENANT, role: 'owner' as const, initialising: false,
  recoveryError: null, isAdmin: false, signOut: async () => {}, refreshMembership: async () => {}, retryAccountRecovery: async () => {},
}
// The Ledger only uses the Budget workspace to guard navigation away from an unsaved drawer.
const budget = { guardTaskNavigation: () => () => {} } as unknown as Workspace

function Fixture() {
  const defaults = useContext(DataContext)
  const [reportRevision, setReportRevision] = useState(0)
  // An apply turns the first 500 rows into manual categories, so a fresh review scope would shrink.
  const refreshData = async () => {
    rows.slice(0, 500).forEach((row) => { row.category_source = 'user' })
    setReportRevision((revision) => revision + 1)
  }
  return <AuthContext.Provider value={auth}>
    <DataContext.Provider value={{ ...defaults, loadState: 'ready', accounts: [ACCOUNT] as typeof defaults.accounts, reportRevision, refreshData }}>
      <BudgetContext.Provider value={budget}><MemoryRouter><LedgerView /></MemoryRouter></BudgetContext.Provider>
    </DataContext.Provider>
  </AuthContext.Provider>
}

createRoot(document.getElementById('root')!).render(<Fixture />)

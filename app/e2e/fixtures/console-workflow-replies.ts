import type { Request } from '@playwright/test'

const everyday = '64ddbad1-3d5b-4840-a2c7-30192dc77993'
const savings = '2b36ecb2-2ade-4b81-b26a-cb73d95d829b'
const lineId = '599d2c7e-cf6a-4a88-aaaa-f5bd77482ed3'
const parentId = 'local-fixture-8'
const transferId = '409d8cf4-8592-4454-a05b-9059cb3e776f'

export function workflowReplies({ loseBudgetReceipt = false } = {}) {
  let allocation = 95_000
  let planVersion = '1'
  let category = 'Groceries'
  let categoryEdited = false
  let transferState = 'suggested'
  const budgetReceipts = new Map<string, { request_id: string; status: string; operation_id: string; result: object }>()
  const budgetChecks: string[] = []
  const writes: { resource: string; body: Record<string, unknown> }[] = []

  function reply(resource: string, request: Request, fallback: unknown) {
    const body = request.method() === 'POST' ? request.postDataJSON() ?? {} : {}
    if (resource === 'query-budget') {
      if (body.action === 'draft') return { json: { draft: null, draft_version: '0', source_revision: 'fixture-revision', method: 'budget-foundation-v1' } }
      if (body.action === 'account_activity') return { json: { as_of: '2026-11-22', accounts: [] } }
      if (body.action === 'sources') return { json: { items: [], rows: [], next: null } }
      if (body.action === 'operation') {
        budgetChecks.push(body.request_id)
        return { json: { outcome: budgetReceipts.get(body.request_id) ?? null } }
      }
      const period = { id: 'fixture-period', start_date: '2026-11-01', end_date: '2026-12-01',
        timezone: 'Australia/Sydney', frequency: 'monthly' }
      const actuals = { gross_expense_cents: 37_220, expense_credits_cents: 0, net_expense_cents: 37_220,
        earned_income_cents: 447_727, pending_signed_cents: 0 }
      const remaining = allocation - actuals.net_expense_cents
      const planFacts = { income_cents: 450_000, drawdown_cents: 0, allocations: [{ line_id: lineId, amount_cents: allocation }] }
      const snapshot = {
        tenant_id: 'cbd089c6-6885-4ff4-aa08-fd29478eaa76', source_revision: 'fixture-revision',
        method: 'budget-foundation-v1', write_enabled: true,
        accounts: [{ id: everyday, name: 'Everyday', currency: 'AUD' }],
        account_scope: [{ original_account_id: everyday, account_id: everyday, role: 'activity',
          start_date: period.start_date, end_date: null }],
        plan: { id: 'fixture-plan', version: planVersion, currency: 'AUD', timezone: 'Australia/Sydney', frequency: 'monthly', anchor: null },
        period,
        revision: { income_cents: 450_000, drawdown_cents: 0 },
        lines: [{ id: lineId, kind: 'everyday', name: 'Everyday spending', allocation_cents: allocation, opening_cents: 0 }],
        actuals, scope_valid: true, coverage_complete: true,
        unallocated_cents: 450_000 - allocation,
        details: { source_revision: 'fixture-revision', plan_version: planVersion, undo_operation_id: null,
          taxonomy: [], taxonomy_scopes: [], planning_goals: [], recurring: [], claims: [], limits: [],
          items: [{ line_id: lineId, name: 'Everyday spending', kind: 'everyday', config: null,
            item_revision: null, opening_cents: 0, opening_date: period.start_date,
            planned_cents: allocation, used_cents: actuals.net_expense_cents, remaining_cents: remaining,
            opening_carry_cents: 0, reallocated_cents: 0, reserve_cents: null, occurrences: [] }],
          other_flexible_cents: allocation, other_flexible_used_cents: actuals.net_expense_cents,
          other_opening_carry_cents: 0, other_flexible_remaining_cents: remaining,
          lifecycle: { state: 'current', as_of: '2026-11-22', carry_mode: 'fresh', provisional_carry: false,
            chain_valid: true, previous_id: null, next_id: null, is_latest: true, review: null,
            changed_since_review: false, periods: [period],
            facts: { original_plan: planFacts, latest_plan: planFacts, actuals, scope_valid: true, coverage_complete: true,
              opening_carry_cents: 0, closing_everyday_cents: remaining } } },
      }
      return { json: snapshot }
    }
    if (resource === 'manage-budget') {
      writes.push({ resource, body })
      if (body.action === 'revise') {
        allocation = body.lines[0].amount_cents
        planVersion = '2'
      }
      const receipt = { request_id: body.request_id, status: 'committed', operation_id: 'fixture-edit', result: {} }
      budgetReceipts.set(body.request_id, receipt)
      return loseBudgetReceipt && writes.length === 1
        ? { status: 503, json: { message: 'Review fixture interrupted the reply' } }
        : { json: receipt }
    }
    if (resource === 'update-transaction-category') {
      writes.push({ resource, body })
      category = body.category
      categoryEdited = true
      return { json: { category, subcategory: null, edit_id: 'fixture-edit' } }
    }
    if (resource === 'ledger_page' && fallback && typeof fallback === 'object' && 'rows' in fallback && Array.isArray(fallback.rows)) {
      const allRows = fallback.rows.map(row => {
        if (row.id === 'local-fixture-0') return { ...row, category: 'Uncategorized', category_source: null }
        if (row.id === 'local-fixture-1') return { ...row, needs_review: true, category_source: 'ai' }
        if (row.id === parentId) return { ...row, category, category_source: categoryEdited ? 'user' : 'bank' }
        return { ...row, category_source: 'bank' }
      })
      const needsAttention = (row: typeof allRows[number]) => row.needs_review || row.category === 'Uncategorized'
      const rows = allRows.filter(row => {
        if (body.p_review === 'unresolved') return row.category === 'Uncategorized' && row.category_source === null
        if (body.p_review === 'needs-attention') return needsAttention(row)
        if (body.p_review === 'uncategorized') return row.category === 'Uncategorized'
        if (body.p_review === 'eligible') return row.category_source !== 'bank' && row.category_source !== 'user'
        return true
      })
      return { json: { ...fallback, rows: rows.slice(0, body.p_limit), matching_count: rows.length,
        attention_count: rows.filter(needsAttention).length } }
    }
    if (resource === 'static_profiles') return { json: {
      name: 'Review statement layout',
      mappings: { dateCol: 'Date', descCol: 'Description', amountCol: 'Amount', categoryCol: 'Category', dateFormat: 'YYYY-MM-DD', signFlip: false }
    } }
    if (resource === 'transfer_links') {
      const state = new URL(request.url()).searchParams.get('state')
      const items = state === 'eq.' + transferState ? [{
        id: transferId, state: transferState, score: 97, reasons: [], ambiguous: false,
        from_txn: { id: 'fixture-from', account_id: everyday, date: '2026-11-19', amount: -22500, original_description: 'Savings transfer' },
        to_txn: { id: 'fixture-to', account_id: savings, date: '2026-11-19', amount: 22500, original_description: 'Savings transfer' },
      }] : []
      return { json: items, headers: { 'content-range': items.length ? '0-0/1' : '*/0' } }
    }
    if (resource === 'transfer_group_batch') return { json: {
      selectedIds: [transferId], ambiguousCount: 0, deferredCount: 0, amount: 22500, total: 1
    } }
    if (resource === 'transfer_overflow_summary') return { json: { bucketCount: 0, legCount: 0, suggestedPairCount: 0, amount: 0 } }
    if (resource === 'decide-transfer') {
      writes.push({ resource, body })
      transferState = body.verdict
      return { json: { confirmed: 1 } }
    }
  }
  return { reply, writes, budgetChecks, expected: { everyday, lineId, parentId, transferId } }
}

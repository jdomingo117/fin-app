// Bounded exhaustive check of Up history coverage (verified_provider ranges).
//
// Runs the REAL handler in supabase/functions/sync-provider/index.ts against a
// fake Up API and an in-memory database that ports the coverage SQL. It explores
// every sequence of Up events and sync calls within the bounds below, and every
// way each call can stop early: the 45s deadline passing at any deadline check,
// the isolate dying before any write, or any one request failing.
//
// What is verified, what is modelled and how to read a failure:
// .claude/skills/provider-coverage-verify/SKILL.md
import { beforeAll, expect, it, vi } from 'vitest'

vi.mock('https://deno.land/x/zod@v3.22.4/mod.ts', () => {
  const schema = { uuid: () => schema, optional: () => schema, default: () => schema }
  return { z: { object: () => schema, string: () => schema, enum: () => schema } }
})
vi.mock('../../../supabase/functions/_shared/withAuth.ts', () => ({ withAuth: (_, handler) => handler }))
vi.mock('../../../supabase/functions/_shared/rateLimit.ts', () => ({ LIMITS: {} }))
vi.mock('../../../supabase/functions/_shared/crypto.ts', () => ({
  decryptToken: async () => 'token', redactProviderTokens: String, TokenDecryptError: class extends Error {},
}))
vi.mock('../../../supabase/functions/_shared/runLinkTransfers.ts', () => ({ runLinkTransfers: async () => {} }))
vi.mock('../../../supabase/functions/_shared/runInvestmentCashLinks.ts', () => ({ runInvestmentCashLinks: async () => {} }))
vi.mock('../../../supabase/functions/_shared/upClient.ts', () => {
  class UpAuthError extends Error {}
  class UpApiError extends Error { constructor(status) { super(`up ${status}`); this.status = status } }
  const up = () => globalThis.__coverageUp
  return {
    UpAuthError, UpApiError,
    buildTransactionsUrl: (_account, since) => JSON.stringify({ since, before: null, chain: null }),
    fetchTransactionPage: async (url) => up().page(url),
    getUpTransaction: async (id) => up().get(id),
    listUpAccounts: async () => up().accounts(),
  }
})

// ── Bounds ────────────────────────────────────────────────────────────────
const env = (name, fallback) => {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value < 0) throw Error(`${name} must be a whole number, got ${process.env[name]}`)
  return value
}
const BOUNDS = {
  steps: env('COVERAGE_STEPS', 6),     // Up events plus sync calls in one trace
  calls: env('COVERAGE_CALLS', 4),     // sync calls in one trace
  faulty: env('COVERAGE_FAULTY', 2),   // calls in one trace that stop early
  transactions: env('COVERAGE_TX', 1), // Up transactions created during a trace (two exist at the start)
  ticks: env('COVERAGE_TICKS', 1),     // jumps of one day or eight days (REPLAY_DAYS is 7)
}
const FAULT_KINDS = (process.env.COVERAGE_FAULTS || 'deadline,kill,error').split(',')
const PAGE_SIZE = 1 // one transaction per Up page, so a few transactions span several pages

// ── Time ──────────────────────────────────────────────────────────────────
// Up timestamps and Australia/Sydney dates both use a fixed +10:00 offset (no DST).
const RealDate = Date
const HOUR = 3_600_000
const DAY = 24 * HOUR
const OFFSET = 10 * HOUR
const upIso = (ms) => new RealDate(ms + OFFSET).toISOString().replace('.000Z', '+10:00')
const sydneyDay = (iso) => new RealDate(RealDate.parse(iso) + OFFSET).toISOString().slice(0, 10)
const sydneyMidnight = (day) => RealDate.parse(`${day}T00:00:00+10:00`)
const at = (ms) => new RealDate(ms + OFFSET).toISOString().slice(5, 16).replace('T', ' ')
const START = RealDate.parse('2026-11-03T09:00:00+10:00')
const CUTOVER = '2026-11-01'
const WALK_SINCE = `${CUTOVER}T00:00:00+10:00` // what sync-provider passes to buildTransactionsUrl for a walk

// ── The world: Up's records, the database and ghost bookkeeping ──────────
function initialWorld() {
  return {
    clock: START,
    up: [
      { id: 'up-1', createdAt: '2026-11-01T12:00:00+10:00', settledAt: '2026-11-01T12:00:00+10:00', status: 'SETTLED', amount: -1000 },
      { id: 'up-2', createdAt: '2026-11-02T12:00:00+10:00', settledAt: null, status: 'HELD', amount: -2000 },
    ],
    db: {
      provider_connections: [{ id: 'connection', tenant_id: 'tenant', provider: 'up', status: 'active' }],
      provider_credentials: [{ connection_id: 'connection', ciphertext: 'fixture' }],
      accounts: [{ id: 'account', tenant_id: 'tenant', currency: 'AUD', balance: 0 }],
      account_connections: [{
        id: 'mapping', tenant_id: 'tenant', connection_id: 'connection', account_id: 'account',
        provider_account_id: 'up-account', cutover_date: CUTOVER, synced_through: null,
        backfill_cursor: null, backfill_done: false,
        coverage_walk_started_at: null, coverage_walk_from: null, coverage_walk_cursor: null,
      }],
      sync_runs: [],
      transactions: [],
      merchant_rules: [],
      account_activity_coverage: [],
    },
    nextId: 1,
    // Ghost state, not in the product: the walk coverage_walk_started_at names,
    // and whether a page chain that began after it reached its last page.
    walk: null,
    chains: {},
    budget: { steps: 0, calls: 0, faulty: 0, transactions: 0, ticks: 0 },
    trace: [],
  }
}

// ── Fake Up API ───────────────────────────────────────────────────────────
// filter[since] filters on createdAt; pages run newest first with a stable keyset cursor.
function upApi(world, faults) {
  const newestFirst = (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  const toUp = (t) => ({
    id: t.id, description: 'Store', rawText: null, message: null, status: t.status,
    createdAt: t.createdAt, settledAt: t.settledAt, amount: { valueInBaseUnits: t.amount },
    foreignAmount: null, categoryId: null, parentCategoryId: null, transferAccountId: null,
  })
  return {
    async page(url) {
      faults.request('Up page')
      const { since, before, chain } = JSON.parse(url)
      const rows = world.up
        .filter((t) => RealDate.parse(t.createdAt) >= RealDate.parse(since))
        .filter((t) => !before || newestFirst(t, before) > 0)
        .sort(newestFirst)
      const page = rows.slice(0, PAGE_SIZE)
      const chainId = chain ?? `chain-${world.nextId++}`
      if (!chain) world.chains[chainId] = { since, firstFetchAt: world.clock }
      const last = page.at(-1)
      const next = rows.length > PAGE_SIZE
        ? JSON.stringify({ since, before: { createdAt: last.createdAt, id: last.id }, chain: chainId })
        : null
      if (next === null && world.walk && since === WALK_SINCE
        && world.chains[chainId].firstFetchAt >= RealDate.parse(world.walk.startedAt)) world.walk.complete = true
      return { transactions: page.map(toUp), next, remaining: null }
    },
    async get(id) {
      faults.request('Up transaction')
      const t = world.up.find((row) => row.id === id)
      return t ? toUp(t) : null
    },
    async accounts() {
      faults.request('Up accounts')
      return [{ id: 'up-account', balance: { valueInBaseUnits: world.up.reduce((sum, t) => sum + t.amount, 0) } }]
    },
  }
}

// ── In-memory database, with the coverage SQL ported line for line ───────
class SqlError extends Error {}

function database(world) {
  const nowIso = () => new RealDate(world.clock).toISOString()
  const db = () => world.db

  // budget_invalidate_source, the parts that revoke coverage
  // (20261109010000_preserve_budget_coverage_on_reconciliation.sql).
  function onTransactionsDeleted(oldRows) {
    for (const c of db().account_activity_coverage) {
      if (c.revoked_at) continue
      if (oldRows.some((r) => r.tenant_id === c.tenant_id && r.account_id === c.account_id && !r.pending
        && (r.kind !== 'adjustment' || r.kind_source !== 'system') && r.date >= c.start_date && r.date < c.end_date)) {
        c.revoked_at = nowIso(); c.revoked_reason = 'source_activity_deleted'
      }
    }
  }
  function onAccountConnectionsUpdated(pairs) {
    for (const [before, after] of pairs) {
      // Ghost: a new coverage_walk_started_at value starts a new walk.
      if (after.coverage_walk_started_at !== before.coverage_walk_started_at) {
        world.walk = after.coverage_walk_started_at ? { startedAt: after.coverage_walk_started_at, complete: false } : null
      }
    }
    for (const c of db().account_activity_coverage) {
      if (c.revoked_at) continue
      if (pairs.some(([o, n]) => o.tenant_id === c.tenant_id && [o.account_id, n.account_id].includes(c.original_account_id)
        && (o.account_id !== n.account_id || o.provider_account_id !== n.provider_account_id || o.cutover_date !== n.cutover_date))) {
        c.revoked_at = nowIso(); c.revoked_reason = 'account_mapping_changed'
      }
    }
  }

  const liveProviderCoverage = (conn) => db().account_activity_coverage
    .filter((c) => c.tenant_id === conn.tenant_id && c.account_id === conn.account_id && c.provenance === 'verified_provider'
      && !c.revoked_at && c.evidence.account_connection_id === conn.id)
    .sort((a, b) => b.end_date.localeCompare(a.end_date) || a.id.localeCompare(b.id))

  // 20261110020000_budget_provider_coverage.sql: budget_provider_coverage_base
  function coverageBase({ p_tenant, p_account_connection }) {
    const conn = db().account_connections.find((c) => c.tenant_id === p_tenant && c.id === p_account_connection)
    if (!conn) throw new SqlError('budget_account_unavailable')
    if (!conn.backfill_done || conn.coverage_walk_started_at === null || conn.coverage_walk_from === null
      || RealDate.parse(conn.coverage_walk_started_at) > world.clock) return { recorded: false, reason: 'walk_incomplete' }
    const firstOn = conn.coverage_walk_from > conn.cutover_date ? conn.coverage_walk_from : conn.cutover_date
    const endOn = sydneyDay(conn.coverage_walk_started_at)
    const walk = world.walk
    const before = { ...conn }
    // The walk is consumed whether or not it yields a range.
    Object.assign(conn, { coverage_walk_started_at: null, coverage_walk_from: null, coverage_walk_cursor: null })
    onAccountConnectionsUpdated([[before, conn]])
    const account = db().accounts.find((a) => a.tenant_id === p_tenant && a.id === conn.account_id)
    const provider = db().provider_connections.find((p) => p.id === conn.connection_id && p.tenant_id === account?.tenant_id)
    if (!account || account.currency !== 'AUD' || provider?.status !== 'active' || endOn <= firstOn) {
      return { recorded: false, reason: 'not_eligible' }
    }
    const existing = liveProviderCoverage(conn)[0]
    if (existing && existing.start_date <= firstOn && existing.end_date >= endOn) {
      return { recorded: false, reason: 'current', coverage_id: existing.id }
    }
    for (const c of liveProviderCoverage(conn)) { c.revoked_at = nowIso(); c.revoked_reason = 'superseded_by_provider_walk' }
    const created = {
      id: `coverage-${world.nextId++}`, tenant_id: p_tenant, account_id: conn.account_id, original_account_id: conn.account_id,
      start_date: firstOn, end_date: endOn, provenance: 'verified_provider', revoked_at: null, revoked_reason: null,
      evidence: { method: 'budget-provider-walk-v1', account_connection_id: conn.id, walk_started_at: before.coverage_walk_started_at },
      // Ghost: did a walk that began at walk_started_at reach its last page?
      walkBacked: Boolean(walk && walk.startedAt === before.coverage_walk_started_at && walk.complete),
      recordedAtStep: world.trace.length + 1,
    }
    db().account_activity_coverage.push(created)
    return { recorded: true, coverage_id: created.id, first_date: created.start_date }
  }

  // 20261110020000_budget_provider_coverage.sql: budget_provider_coverage_extend
  function coverageExtend({ p_tenant, p_account_connection, p_since, p_pass_started }) {
    if (!p_since || !p_pass_started || RealDate.parse(p_since) > RealDate.parse(p_pass_started)
      || RealDate.parse(p_pass_started) > world.clock) throw new SqlError('budget_invalid_coverage_dates')
    const conn = db().account_connections.find((c) => c.tenant_id === p_tenant && c.id === p_account_connection)
    if (!conn) throw new SqlError('budget_account_unavailable')
    if (!conn.backfill_done) return { extended: false, reason: 'backfill_pending' }
    const existing = liveProviderCoverage(conn)[0]
    if (!existing) return { extended: false, reason: 'no_base' }
    // Every transaction dated on or after the current end day was posted at or
    // after that day's local midnight, so the pass must have fetched from no later than it.
    if (RealDate.parse(p_since) > sydneyMidnight(existing.end_date)) return { extended: false, reason: 'gap', coverage_id: existing.id }
    const endOn = sydneyDay(p_pass_started)
    if (endOn <= existing.end_date) return { extended: false, reason: 'current', coverage_id: existing.id }
    existing.end_date = endOn
    return { extended: true, coverage_id: existing.id }
  }

  const rpcs = {
    budget_provider_coverage_base: coverageBase,
    budget_provider_coverage_extend: coverageExtend,
    // Replaces the mapping's system adjustment row. System adjustments never
    // count for coverage, so the model only records that it ran.
    reconcile_provider_anchor: () => null,
  }

  const matches = (row, f) => {
    const value = row[f.column]
    if (f.op === 'eq') return value === f.value
    if (f.op === 'lt') return value != null && RealDate.parse(value) < RealDate.parse(f.value)
    if (f.op === 'in') return f.value.includes(value)
    if (f.op === 'not.is') return value != null
    throw Error(`Unsupported filter ${f.op}`)
  }
  const uniqueKey = (r) => `${r.account_id}|${r.dedupe_hash}|${r.occurrence}`
  const copy = (rows) => rows.map((r) => ({ ...r }))

  return function execute(req) {
    if (req.rpc) {
      try { return { data: rpcs[req.rpc](req.body), error: null } } catch (err) {
        if (err instanceof SqlError) return { data: null, error: { code: 'P0001', message: err.message } }
        throw err
      }
    }
    const rows = db()[req.table]
    if (!rows) throw Error(`Unexpected table ${req.table}`)
    const selected = () => rows.filter((row) => req.filters.every((f) => matches(row, f)))
    switch (req.op) {
      case 'select': {
        let out = selected()
        if (req.order) out = [...out].sort((a, b) => String(a[req.order.column]).localeCompare(String(b[req.order.column])) * (req.order.ascending ? 1 : -1))
        if (req.limit != null) out = out.slice(0, req.limit)
        return { data: copy(out), error: null }
      }
      case 'insert': {
        const row = req.body
        if (req.table !== 'sync_runs') throw Error(`Unexpected insert into ${req.table}`)
        // Partial unique index: one running sync per connection.
        if (rows.some((r) => r.connection_id === row.connection_id && r.status === 'running')) {
          return { data: null, error: { code: '23505', message: 'duplicate running sync' } }
        }
        const created = { id: `run-${world.nextId++}`, started_at: nowIso(), ...row }
        rows.push(created)
        return { data: copy([created]), error: null }
      }
      case 'upsert': {
        if (req.table !== 'transactions') throw Error(`Unexpected upsert into ${req.table}`)
        for (const incoming of req.body) {
          const existing = rows.find((r) => uniqueKey(r) === uniqueKey(incoming))
          if (existing) { if (!req.options.ignoreDuplicates) Object.assign(existing, incoming) }
          else rows.push({ id: `tx-${world.nextId++}`, kind: null, kind_source: null, ...incoming })
        }
        return { data: null, error: null }
      }
      case 'update': {
        const hits = selected()
        const pairs = hits.map((row) => { const before = { ...row }; Object.assign(row, req.body); return [before, row] })
        if (req.table === 'account_connections') onAccountConnectionsUpdated(pairs)
        return { data: copy(hits), error: null }
      }
      case 'delete': {
        const hits = selected()
        world.db[req.table] = rows.filter((row) => !hits.includes(row))
        if (req.table === 'transactions' && hits.length) onTransactionsDeleted(hits)
        return { data: copy(hits), error: null }
      }
    }
    throw Error(`Unexpected ${req.op} on ${req.table}`)
  }
}

// A minimal stand-in for the supabase-js query builder, covering the calls
// sync-provider and merchantRules.ts make. Results are { data, error }, as there.
function client(execute, faults) {
  const run = (req) => {
    const label = req.rpc ?? `${req.op} ${req.table}`
    try { faults.request(label, req.rpc !== undefined || req.op !== 'select') } catch (err) {
      return { data: null, error: { message: err.message, code: err instanceof Killed ? 'killed' : 'injected' } }
    }
    const result = execute(req)
    if (result.error || !(req.single || req.maybeSingle)) return result
    const rows = result.data ?? []
    if (rows.length > 1 || (req.single && rows.length === 0)) return { data: null, error: { code: 'PGRST116', message: 'not one row' } }
    return { data: rows[0] ?? null, error: null }
  }
  const builder = (req) => {
    const b = {
      select() { if (req.op !== 'select') req.returning = true; return b },
      insert(body) { req.op = 'insert'; req.body = body; return b },
      upsert(body, options = {}) { req.op = 'upsert'; req.body = body; req.options = options; return b },
      update(body) { req.op = 'update'; req.body = body; return b },
      delete() { req.op = 'delete'; return b },
      eq(column, value) { req.filters.push({ column, op: 'eq', value }); return b },
      lt(column, value) { req.filters.push({ column, op: 'lt', value }); return b },
      in(column, value) { req.filters.push({ column, op: 'in', value }); return b },
      not(column, op, value) { if (op !== 'is' || value !== null) throw Error('Unsupported not()'); req.filters.push({ column, op: 'not.is' }); return b },
      order(column, { ascending = true } = {}) { req.order = { column, ascending }; return b },
      limit(n) { req.limit = n; return b },
      single() { req.single = true; return b },
      maybeSingle() { req.maybeSingle = true; return b },
      then(resolve, reject) { return Promise.resolve().then(() => run(req)).then(resolve, reject) },
    }
    return b
  }
  const from = (table) => builder({ table, op: 'select', filters: [] })
  return { from, schema: () => ({ from }), rpc: (rpc, body) => builder({ rpc, body, filters: [] }) }
}

// ── Faults ────────────────────────────────────────────────────────────────
// One call can stop early in one way: the deadline passes at its k-th deadline
// check, the isolate dies before its k-th write, or its k-th request fails.
class Killed extends Error {}

function faultPlan(fault) {
  const counts = { deadlineChecks: 0, writes: 0, requests: 0 }
  let dead = false
  return {
    counts,
    // How far past the clock the handler's Date.now() reads. From the chosen
    // check on, the 45s budget is spent; stored timestamps keep the clock.
    deadlineCheck() {
      counts.deadlineChecks++
      return fault?.kind === 'deadline' && counts.deadlineChecks >= fault.at ? 46_000 : 0
    },
    request(label, isWrite = false) {
      if (dead) throw new Killed('the isolate is gone')
      counts.requests++
      if (isWrite) {
        counts.writes++
        if (fault?.kind === 'kill' && counts.writes === fault.at) { dead = true; throw new Killed(`killed before ${label}`) }
      }
      if (fault?.kind === 'error' && counts.requests === fault.at) {
        throw label.startsWith('Up') ? new globalThis.__coverageUpApiError(500) : Error(`injected failure on ${label}`)
      }
    },
  }
}

// ── Running the real handler ─────────────────────────────────────────────
let sync
beforeAll(async () => {
  const upClient = await import('../../../supabase/functions/_shared/upClient.ts')
  globalThis.__coverageUpApiError = upClient.UpApiError
  vi.stubGlobal('Deno', { serve: (handler) => { sync = handler } })
  // COVERAGE_HANDLER loads a scratch copy instead (it must sit beside index.ts so its imports resolve).
  const handler = process.env.COVERAGE_HANDLER || 'index.ts'
  if (!/^index[\w.-]*\.ts$/.test(handler)) throw Error(`COVERAGE_HANDLER must be a file in sync-provider/, got ${handler}`)
  try { await import(/* @vite-ignore */ new URL(`../../../supabase/functions/sync-provider/${handler}`, import.meta.url).pathname) } finally { vi.unstubAllGlobals() }
})

// The handler's own Date.now() calls are its deadline checks (and its
// stale-run cutoff); only those see the deadline fault.
function installClock(world, faults) {
  class FakeDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(world.clock) }
    static now() {
      return /sync-provider\/index[\w.-]*\.ts/.test(new Error().stack) ? world.clock + faults.deadlineCheck() : world.clock
    }
  }
  globalThis.Date = FakeDate
  return () => { globalThis.Date = RealDate }
}

async function runSync(world, fault) {
  world.clock += 15 * 60_000 // calls are at least 15 minutes apart, so a killed run's lock has gone stale
  const faults = faultPlan(fault)
  globalThis.__coverageUp = upApi(world, faults)
  const db = client(database(world), faults)
  const restore = installClock(world, faults)
  let outcome
  try {
    outcome = await sync({ body: { connection_id: 'connection', trigger: 'manual' }, db, admin: () => db,
      tenantId: 'tenant', user: { id: 'user' }, audit: async () => {} })
  } catch (err) {
    outcome = err instanceof Killed || err?.code === 'killed' ? { killed: true } : { threw: String(err?.message ?? err) }
  } finally { restore() }
  return { outcome, counts: faults.counts }
}

// ── Properties ────────────────────────────────────────────────────────────
const txDay = (t) => sydneyDay(t.settledAt ?? t.createdAt)

function violations(world) {
  const found = []
  for (const c of world.db.account_activity_coverage) {
    if (c.revoked_at || c.provenance !== 'verified_provider') continue
    // WalkBeforeBase: a base range is recorded only after a walk that began at
    // coverage_walk_started_at reached its last page.
    if (!c.walkBacked) {
      found.push({ property: 'WalkBeforeBase', detail: `verified range ${c.start_date} to ${c.end_date} (end excluded) was recorded at step ${c.recordedAtStep}, but no walk since ${at(RealDate.parse(c.evidence.walk_started_at))} reached its last page` })
      continue // CoverageSound is checked only on ranges WalkBeforeBase accepts
    }
    // CoverageSound: every Up transaction dated inside a live range is in the ledger.
    for (const t of world.up) {
      const day = txDay(t)
      if (day < c.start_date || day >= c.end_date) continue
      if (!world.db.transactions.some((r) => r.account_id === c.account_id && r.external_id === t.id)) {
        found.push({ property: 'CoverageSound', detail: `${t.id}, dated ${day}, is at Up but not in the ledger, inside verified range ${c.start_date} to ${c.end_date} (end excluded)` })
      }
    }
  }
  return found
}

// ── Search ────────────────────────────────────────────────────────────────
function fingerprint(world) {
  const { db } = world
  return JSON.stringify([
    world.clock, world.up, world.walk,
    [world.budget.calls, world.budget.faulty, world.budget.transactions, world.budget.ticks],
    db.provider_connections.map((p) => p.status),
    db.account_connections.map(({ last_synced_at, balance_as_of, ...rest }) => rest),
    db.sync_runs.filter((r) => r.status === 'running').map((r) => r.started_at),
    db.transactions.map((t) => [t.external_id, t.date, t.pending, t.amount]).sort(),
    db.account_activity_coverage.map((c) => [c.start_date, c.end_date, Boolean(c.revoked_at), c.walkBacked]),
  ])
}

function environmentSteps(world) {
  const steps = []
  const { budget } = world
  if (budget.ticks < BOUNDS.ticks) {
    steps.push({ label: 'a day passes', apply: (w) => { w.clock += DAY; w.budget.ticks++ } })
    steps.push({ label: 'eight days pass', apply: (w) => { w.clock += 8 * DAY; w.budget.ticks++ } })
  }
  if (budget.transactions < BOUNDS.transactions) {
    for (const status of ['SETTLED', 'HELD']) {
      steps.push({ label: `Up records a new ${status === 'HELD' ? 'held' : 'settled'} transaction`, apply: (w) => {
        const id = `up-${w.up.length + 1}`
        const now = upIso(w.clock)
        w.up.push({ id, createdAt: now, settledAt: status === 'SETTLED' ? now : null, status, amount: -100 * (w.up.length + 1) })
        w.budget.transactions++
        return id
      } })
    }
  }
  for (const t of world.up.filter((row) => row.status === 'HELD')) {
    steps.push({ label: `the hold on ${t.id} settles`, apply: (w) => { const r = w.up.find((x) => x.id === t.id); r.status = 'SETTLED'; r.settledAt = upIso(w.clock) } })
    steps.push({ label: `the hold on ${t.id} is cancelled`, apply: (w) => { w.up = w.up.filter((x) => x.id !== t.id) } })
  }
  return steps
}

const describeFault = (fault) => !fault ? 'runs to completion'
  : fault.kind === 'deadline' ? `runs out of time at its deadline check #${fault.at}`
    : fault.kind === 'kill' ? `is killed before its write #${fault.at}`
      : `has its request #${fault.at} fail`

async function explore() {
  const seen = new Map()
  const stats = { states: 0, runs: 0 }
  const counterexamples = new Map()
  async function visit(world) {
    const remaining = BOUNDS.steps - world.budget.steps
    const key = fingerprint(world)
    if ((seen.get(key) ?? -1) >= remaining) return
    seen.set(key, remaining)
    stats.states++
    const bad = violations(world)
    if (bad.length) {
      for (const v of bad) {
        const prior = counterexamples.get(v.property)
        if (!prior || prior.trace.length > world.trace.length) counterexamples.set(v.property, { ...v, trace: [...world.trace] })
      }
      return
    }
    if (remaining <= 0) return
    for (const step of environmentSteps(world)) {
      const next = structuredClone(world)
      const id = step.apply(next)
      next.budget.steps++
      next.trace.push(`${at(next.clock)}  ${step.label}${id ? ` (${id})` : ''}`)
      await visit(next)
    }
    if (world.budget.calls >= BOUNDS.calls) return
    const clean = structuredClone(world)
    const { counts, outcome: cleanOutcome } = await runSync(clean, null)
    stats.runs++
    const options = [{ fault: null, next: clean, outcome: cleanOutcome }]
    if (world.budget.faulty < BOUNDS.faulty) {
      const faults = []
      if (FAULT_KINDS.includes('deadline')) for (let k = 2; k <= counts.deadlineChecks; k++) faults.push({ kind: 'deadline', at: k })
      if (FAULT_KINDS.includes('kill')) for (let k = 1; k <= counts.writes; k++) faults.push({ kind: 'kill', at: k })
      if (FAULT_KINDS.includes('error')) for (let k = 1; k <= counts.requests; k++) faults.push({ kind: 'error', at: k })
      for (const fault of faults) {
        const next = structuredClone(world)
        const { outcome } = await runSync(next, fault)
        stats.runs++
        options.push({ fault, next, outcome })
      }
    }
    for (const { fault, next, outcome } of options) {
      next.budget.steps++; next.budget.calls++
      if (fault) next.budget.faulty++
      next.trace.push(`${at(next.clock)}  a sync call ${describeFault(fault)}${outcome?.error ? ` (returns ${outcome.error})` : ''}${outcome?.threw ? ` (throws: ${outcome.threw})` : ''}`)
      await visit(next)
    }
  }
  await visit(initialWorld())
  return { stats, counterexamples: [...counterexamples.values()] }
}

// Sanity: the harness drives the real code path that records coverage. If this
// fails, the fakes have drifted from the handler and the search proves nothing.
it('a clean first sync backfills the account and records verified coverage', async () => {
  const world = initialWorld()
  const { outcome } = await runSync(world, null)
  expect(outcome).toMatchObject({ done: true })
  expect(world.db.account_connections[0]).toMatchObject({ backfill_done: true, backfill_cursor: null, coverage_walk_started_at: null })
  expect(world.db.transactions.map((t) => [t.external_id, t.pending]).sort()).toEqual([['up-1', false], ['up-2', true]])
  expect(world.db.account_activity_coverage.map((c) => [c.start_date, c.end_date, c.walkBacked])).toEqual([[CUTOVER, '2026-11-03', true]])
  expect(violations(world)).toEqual([])
})

it('Up history coverage holds in every explored trace', async () => {
  const started = RealDate.now()
  const { stats, counterexamples } = await explore()
  const seconds = ((RealDate.now() - started) / 1000).toFixed(1)
  process.stdout.write(`[provider-coverage] bounds ${JSON.stringify(BOUNDS)}, faults ${FAULT_KINDS.join('+')}: ${stats.states} states, ${stats.runs} handler runs, ${seconds}s\n`)
  for (const c of counterexamples) {
    process.stdout.write(`\n[provider-coverage] ${c.property} fails: ${c.detail}\n  Shortest trace found (times are Sydney, +10:00):\n${c.trace.map((line, i) => `   ${i + 1}. ${line}`).join('\n')}\n`)
  }
  expect(counterexamples.map((c) => c.property)).toEqual([])
})

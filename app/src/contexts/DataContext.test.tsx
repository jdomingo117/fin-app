// @vitest-environment jsdom

import { useLayoutEffect, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataProvider, useData } from './DataContext'
import { useReport } from '../hooks/useReport'

const { auth, from, invoke } = vi.hoisted(() => ({
  auth: { session: null as { user: { id: string } } | null, isAdmin: false, tenantId: null as string|null },
  from: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('./AuthContext', () => ({ useAuth: () => ({...auth,user:auth.session?.user}) }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { from, functions: { invoke } } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

type ReadResult = Record<string, { data: unknown; error: Error | null }>

function rows(id: string, { bank = false, investment = false } = {}): ReadResult {
  return {
    profiles: { data: { callsign: id }, error: null },
    accounts: {
      data: [{ id, name: id, type: 'checking', balance: 100, balance_source: investment ? 'investment_valuation' : 'manual' }],
      error: null,
    },
    transactions_analytic: {
      data: [{ id, account_id: id, date: '2026-01-01', merchant: id, kind: 'expense', amount: -100 }],
      error: null,
    },
    account_connections: {
      data: bank ? [{ account_id: id, connection_id: id, provider_connections: { status: 'active' } }] : [],
      error: null,
    },
  }
}

function failedRead(id: string): ReadResult {
  return { accounts: { data: null, error: new Error(id) } }
}

let root: Root | undefined
let current: ReturnType<typeof useData>
let commits: (typeof current)[]
let queuedReads: ReturnType<typeof deferred<ReadResult>>[]

function Probe() {
  const data = useData()
  useLayoutEffect(() => {
    current = data
    commits.push(data)
  }, [data])
  return null
}

const scopedRead=vi.fn(async()=>({ok:true}))
function FinancialProbe() {
  useReport('ledger',scopedRead)
  useReport('report',scopedRead)
  useReport('account history',scopedRead)
  return <Probe/>
}

async function session(userId: string | null) {
  auth.tenantId = userId ? 'tenant-'+userId : null
  auth.session = userId ? { user: { id: userId } } : null
  await act(async () => { root!.render(<DataProvider><Probe /></DataProvider>) })
}

async function finish(read: ReturnType<typeof deferred<ReadResult>>, result: ReadResult) {
  await act(async () => { read.resolve(result) })
}

async function startRefresh() {
  const read = deferred<ReadResult>()
  queuedReads.push(read)
  await act(async () => { void current.refreshData() })
  return read
}

async function startSession(userId: string) {
  const read = deferred<ReadResult>()
  queuedReads.push(read)
  await session(userId)
  return read
}

function expectReady(ids: string[]) {
  expect.soft(current.accounts.map(({ id }) => id)).toEqual(ids)
  expect.soft(current.loadState).toBe('ready')
  expect.soft(current.isRefreshing).toBe(false)
  expect.soft(current.loadError).toBeNull()
  expect.soft(current.refreshError).toBeNull()
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  auth.session = null
  auth.tenantId = null
  commits = []
  queuedReads = []
  root = createRoot(document.createElement('div'))
  invoke.mockReset().mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  let read: ReturnType<typeof deferred<ReadResult>> | undefined
  from.mockReset().mockImplementation((table: string) => {
    if (table === 'profiles') read = queuedReads.shift()
    if (!read) throw new Error(`Unexpected provider read: ${table}`)
    const response = read.promise.then(result => result[table] ?? { data: [], error: null })
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      maybeSingle: () => query,
      limit: () => query,
      gt: () => query,
      then: response.then.bind(response),
    }
    return query
  })
})

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  root = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DataProvider request sequencing', () => {
  it('immediately isolates a same-user tenant switch and ignores its old late response', async () => {
    await finish(await startSession('a'), rows('tenant-a'))
    const pending = await startRefresh()
    const switched = deferred<ReadResult>(); queuedReads.push(switched)
    const firstCommit = commits.length
    auth.tenantId = 'tenant-b'
    await act(async()=>{root!.render(<DataProvider><Probe /></DataProvider>)})
    expect(commits.slice(firstCommit).every(data=>data.accounts.length===0)).toBe(true)
    expect(current.profile.callsign).toBe('Operator')
    await finish(switched, rows('tenant-b'))
    const latest=current
    await finish(pending,rows('late-tenant-a',{bank:true,investment:true}))
    expectReady(['tenant-b'])
    expect(current).toBe(latest)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('refreshes profile without invalidating reports or reloading accounts', async () => {
    await finish(await startSession('a'),rows('initial'))
    await act(async()=>root!.render(<DataProvider><FinancialProbe/></DataProvider>))
    scopedRead.mockClear()
    const revision=current.reportRevision
    from.mockClear()
    const response=deferred<ReadResult>();queuedReads.push(response)
    let refresh!:Promise<void>
    await act(async()=>{refresh=current.refreshProfile()})
    await finish(response,rows('new callsign'))
    await refresh
    expect(current.profile.callsign).toBe('new callsign')
    expect(current.reportRevision).toBe(revision)
    expect(from.mock.calls.map(([table])=>table)).toEqual(['profiles'])
    expect(scopedRead).not.toHaveBeenCalled()
    expectReady(['initial'])
  })

  it('keeps signed-out data cleared when an in-flight refresh succeeds late', async () => {
    await finish(await startSession('a'), rows('a'))
    const pending = await startRefresh()
    await session(null)
    expectReady([])
    expect.soft(current.profile.callsign).toBe('Operator')

    await finish(pending, rows('late-a', { bank: true, investment: true }))

    expectReady([])
    expect.soft(current.profile.callsign).toBe('Operator')
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'])('isolates a user switch from a late %s', async (outcome) => {
    await finish(await startSession('a'), rows('a'))
    const pending = await startRefresh()
    const firstSwitchCommit = commits.length
    const userB = await startSession('b')

    expect.soft(commits.slice(firstSwitchCommit).some(data => data.accounts.length)).toBe(false)
    expect.soft(current.loadState).toBe('loading')
    expect.soft(current.isRefreshing).toBe(false)
    await finish(userB, rows('b'))
    const commitsBeforeLateResponse = commits.length

    await finish(pending, outcome === 'success' ? rows('late-a') : failedRead('late-a'))

    expectReady(['b'])
    expect.soft(current.profile.callsign).toBe('b')
    expect(commits).toHaveLength(commitsBeforeLateResponse)
  })

  it.each([
    { olderSucceeds: true, newerSucceeds: true },
    { olderSucceeds: true, newerSucceeds: false },
    { olderSucceeds: false, newerSucceeds: true },
  ])('keeps the latest result with older success=$olderSucceeds and newer success=$newerSucceeds', async ({ olderSucceeds, newerSucceeds }) => {
    await finish(await startSession('a'), rows('initial'))
    const older = await startRefresh()
    const newer = await startRefresh()
    await finish(newer, newerSucceeds ? rows('newer') : failedRead('newer'))
    expect(current.accounts[0].id).toBe(newerSucceeds ? 'newer' : 'initial')
    expect(current.refreshError === null).toBe(newerSucceeds)
    expect(current.isRefreshing).toBe(false)
    const latest = current

    await finish(older, olderSucceeds ? rows('older') : failedRead('older'))

    expect(current).toBe(latest)
  })

  it('keeps the refresh indicator active when an older refresh settles first', async () => {
    await finish(await startSession('a'), rows('initial'))
    const older = await startRefresh()
    const newer = await startRefresh()

    await finish(older, failedRead('older'))

    expect.soft(current.isRefreshing).toBe(true)
    expect.soft(current.refreshError).toBeNull()
    await finish(newer, rows('newer'))
    expectReady(['newer'])
  })

  it.each(['sign-out', 'user switch', 'newer refresh'])('ignores investment sync completion after %s', async (boundary) => {
    const sync = deferred<{ error: null }>()
    invoke.mockReturnValueOnce(sync.promise)
    await finish(await startSession('a'), rows('a', { investment: true }))
    expect(invoke).toHaveBeenCalledExactlyOnceWith('sync-investment-prices', {
      body: { account_id: 'a', trigger: 'stale' },
    })

    if (boundary === 'sign-out') await session(null)
    if (boundary === 'user switch') await finish(await startSession('b'), rows('b'))
    if (boundary === 'newer refresh') await finish(await startRefresh(), rows('newer'))
    const readCount = from.mock.calls.length
    const latest = current

    await act(async () => { sync.resolve({ error: null }) })

    expect.soft(from).toHaveBeenCalledTimes(readCount)
    expect(current).toBe(latest)
  })

  it('refreshes once when the active investment sync succeeds', async () => {
    const sync = deferred<{ error: null }>()
    invoke.mockReturnValueOnce(sync.promise)
    await finish(await startSession('a'), rows('a', { investment: true }))
    const followUp = deferred<ReadResult>()
    queuedReads.push(followUp)

    await act(async () => { sync.resolve({ error: null }) })
    expect(current.isRefreshing).toBe(true)
    expect(from.mock.calls.filter(([table]) => table === 'profiles')).toHaveLength(2)
    await finish(followUp, rows('a', { investment: true }))

    expectReady(['a'])
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('ignores a refresh and an investment sync that finish after unmount', async () => {
    const sync = deferred<{ error: null }>()
    invoke.mockReturnValueOnce(sync.promise)
    await finish(await startSession('a'), rows('a', { investment: true }))
    const pending = await startRefresh()
    await act(async () => { root!.unmount() })
    root = undefined
    const readCount = from.mock.calls.length
    const commitCount = commits.length

    await finish(pending, rows('late-a', { bank: true, investment: true }))
    await act(async () => { sync.resolve({ error: null }) })

    expect.soft(invoke).toHaveBeenCalledTimes(1)
    expect.soft(from).toHaveBeenCalledTimes(readCount)
    expect(commits).toHaveLength(commitCount)
  })
})

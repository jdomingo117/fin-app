import type { Page, Request } from '@playwright/test'

// Serve fictional replies at the local Auth and report boundaries.
const origin = 'http://127.0.0.1:5320'
const dataOrigin = 'http://127.0.0.1:54321'
export const dashboard = origin + '/dashboard'
const userId = '47800c24-353a-46d7-ba4f-3b28e367f51f'
const tenantId = 'cbd089c6-6885-4ff4-aa08-fd29478eaa76'
const accounts = [
  { id:'64ddbad1-3d5b-4840-a2c7-30192dc77993', name:'Everyday', type:'Liquid', balance:1288000, balance_source:'manual' },
  { id:'2b36ecb2-2ade-4b81-b26a-cb73d95d829b', name:'High-interest savings', type:'Savings', balance:7500000, balance_source:'manual' },
  { id:'c64afd81-a4c3-44ea-84a8-0bbc501042e3', name:'Investments', type:'Invest', balance:9644000, balance_source:'manual' },
]
type ScenarioRow = [index: number, merchant: string, category: string, amount: number, kind: 'income' | 'expense']
const data: ScenarioRow[] = [
  [23,'Salary','Salary',438000,'income'], [9,'Contract work','Consulting',240000,'income'], [5,'Savings interest','Interest',30000,'income'],
  [7,'Market grocer','Groceries',-24000,'expense'], [11,'Transit','Transport',-62000,'expense'],
  [14,'Rent','Housing',-88500,'expense'], [17,'Utilities','Bills',-33000,'expense'],
  [25,'Rent','Housing',-75000,'expense'], [28,'Market grocer','Groceries',-31500,'expense'],
]
const day = (index: number) => new Date(Date.UTC(2026,9,24+index)).toISOString().slice(0,10)
const recent = data.map(([index,merchant,category,amount,kind], n) => ({
  parent_id:`local-fixture-${n}`,account_id:accounts[0].id,date:day(index),merchant,merchant_key:merchant.toLowerCase(),
  category,amount,kind,kind_source:'manual',pending:false,is_transfer:false,needs_review:false,
})).sort((a,b) => b.date.localeCompare(a.date))
type Facet = {
  period: string; category: string; subcategory: string | null; earned_cents: number; gross_cents: number
  expense_count: number; deposit_count: number; largest_deposit_cents: number; latest_deposit: string | null
}
const facets = new Map<string, Facet>()
for (const tx of recent) {
  const facet: Facet = facets.get(tx.category) ?? {period:'current',category:tx.category,subcategory:null,earned_cents:0,gross_cents:0,expense_count:0,deposit_count:0,largest_deposit_cents:0,latest_deposit:null}
  if (tx.kind === 'income') {
    facet.earned_cents += tx.amount
    facet.deposit_count++
    facet.largest_deposit_cents = Math.max(facet.largest_deposit_cents,tx.amount)
    facet.latest_deposit ??= tx.date
  } else {
    facet.gross_cents -= tx.amount
    facet.expense_count++
  }
  facets.set(tx.category,facet)
}
const absoluteSum = (rows: typeof recent, kind: ScenarioRow[4]) => rows.filter(row => row.kind===kind).reduce((total,row) => total + Math.abs(row.amount),0)
const expenses = absoluteSum(recent,'expense')
const periods = {
  current:{earned_cents:absoluteSum(recent,'income'),gross_cents:expenses,expense_cents:expenses,expense_attention_count:0},
  prior:{earned_cents:684000,gross_cents:349420,expense_cents:349420,expense_attention_count:0},
}
const fixtureExpiry = Date.parse('2099-01-01T00:00:00Z') / 1000
const session = {
  access_token:[{alg:'HS256',typ:'JWT'},{sub:userId,role:'authenticated',exp:fixtureExpiry}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.fictional', refresh_token:'console-fixture-refresh', token_type:'bearer', expires_in:3600,
  expires_at: fixtureExpiry, user:{ id:userId, aud:'authenticated', role:'authenticated', email:'console-review@example.invalid', app_metadata:{}, user_metadata:{} },
}
const fixtures: Record<string, unknown> = {
  tenant_members: { tenant_id: tenantId, role: 'owner' },
  profiles: { callsign: 'Reviewer', deletion_scheduled_at: null },
  accounts,
  account_connections: [{ id:'fixture-connection',account_id:accounts[0].id,connection_id:'fixture-up',provider:'up',provider_connections:{status:'disconnected'} }],
  portfolio_summary: { net_worth_cents: 18432000, cash_asset_cents: 8788000, investment_asset_cents: 9644000, net_movement_30d_cents: 394000, attention_count: 12, transfer_leg_count: 3 },
  cash_flow_report: { periods, categories: [...facets.values()], buckets: Array.from({length:30}, (_, index) => {
    const rows = recent.filter(row => row.date === day(index))
    const expense_cents = absoluteSum(rows,'expense')
    return { bucket:day(index), earned_cents:absoluteSum(rows,'income'), gross_cents:expense_cents, expense_cents }
  }), top_merchant: null },
  reporting_transaction_lines: recent,
  net_worth_monthly: [18432000, 18100000, 18224000, 17739000, 17142000, 17358000, 16893000, 16245000].map((value_cents, index) => ({month: `2026-${String(11-index).padStart(2, '0')}-01`,value_cents})),
}

const cors = {
  'access-control-allow-origin':origin,
  'access-control-allow-methods':'GET, POST, HEAD, OPTIONS',
  'access-control-allow-headers':'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range, range-unit, accept-profile, content-profile',
}
const fixtureEmail = 'console-review@example.invalid'
const fixturePassword = 'fictional-password-not-a-credential'

type FixtureResponse = { json: unknown; status?: number }

export async function signInForConsole(page: Page, controlledClock = true, beforeRead?: (resource: string) => void | Promise<void>,
  override?: (resource: string, request: Request, body: unknown) => FixtureResponse | undefined) {
  const context = page.context()
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin) return route.continue()
    if (['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)) return route.continue()
    if (url.origin !== dataOrigin) return route.abort()

    if (request.method() === 'OPTIONS') return route.fulfill({
      status:204, headers:{...cors,'access-control-allow-headers':request.headers()['access-control-request-headers'] ?? cors['access-control-allow-headers']},
    })
    // Fulfil all fixture API requests inside this context. The real Supabase listener receives none.
    if (url.pathname === '/auth/v1/token') {
      const credentials = request.postDataJSON()
      if (credentials.email !== fixtureEmail || credentials.password !== fixturePassword) {
        return route.fulfill({ status:400, headers:cors, json:{ message:'Fictional review data only' } })
      }
      return route.fulfill({ headers:cors, json:session })
    }
    const key = url.pathname.split('/').at(-1) ?? ''
    await beforeRead?.(key)
    let body = fixtures[key] ?? []
    if (key === 'reporting_transaction_lines') {
      const category = url.searchParams.get('category')?.slice(3)
      const rows = url.searchParams.get('amount') === 'gt.0' ? recent.filter(row=>row.amount>0) : recent
      body = category ? rows.filter(row=>row.category===category) : rows
    }
    const response = override?.(key, request, body) ?? { json: body }
    return route.fulfill({headers:cors,...response})
  })
  if (controlledClock) await page.addInitScript(anchor => {
    // Shift calendar time while retaining the browser’s own frame and timer scheduler.
    const NativeDate = window.Date
    const delta = anchor - NativeDate.now()
    const now = () => NativeDate.now() + delta
    window.Date = new Proxy(NativeDate, {
      get(target, key, receiver) { return key === 'now' ? now : Reflect.get(target, key, receiver) },
      apply: () => new NativeDate(now()).toString(),
      construct(target, args, newTarget) {
        return Reflect.construct(target, args.length ? args : [now()], newTarget)
      },
    })
  }, Date.parse('2026-11-22T08:04:00Z'))
  await page.goto(dashboard)
  await page.locator('input[type="email"]').fill(fixtureEmail)
  await page.locator('input[type="password"]').fill(fixturePassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(dashboard)
  await page.getByRole('button', { name: 'Console', exact: true }).waitFor()
  await page.evaluate(() => document.fonts.ready)
}

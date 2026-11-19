import { createClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import { lookupUserMerchantRules } from '../../../supabase/functions/sync-provider/merchantRules.ts'

it.each([0, 1, 100, 101])('loads user rules for %i distinct merchant keys', async count => {
  const keys = Array.from({ length: count }, (_, i) => 'merchant-' + i)
  const batches = []
  const request = vi.fn(async input => {
    const url = new URL(input)
    expect(url.pathname).toBe('/rest/v1/merchant_rules')
    expect(url.searchParams.get('source')).toBe('eq.user')
    expect(url.searchParams.get('select')).toBe('merchant_key,category,subcategory')
    const batch = url.searchParams.get('merchant_key').slice(4, -1).split(',')
    batches.push(batch)
    return Response.json(batch.map(key => ({ merchant_key: key, category: 'Other', subcategory: null })))
  })
  const db = createClient('https://unused.invalid', 'offline-key', { global: { fetch: request } })
  const rules = await lookupUserMerchantRules(db, keys)
  expect(batches.map(batch => batch.length)).toEqual(count === 0 ? [] : count <= 100 ? [count] : [100, 1])
  expect([...rules.keys()]).toEqual(keys)
  for (const key of keys) expect(rules.get(key)).toEqual({ merchant_key: key, category: 'Other', subcategory: null })
})

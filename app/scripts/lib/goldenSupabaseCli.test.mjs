import { afterEach, expect, it, vi } from 'vitest'
import { goldenSupabaseCli } from './goldenSupabaseCli.mjs'

afterEach(() => vi.unstubAllEnvs())

it.each([['start'], ['functions', 'serve']])('resolves the Supabase CLI for %s', (...args) => {
  vi.stubEnv('SUPABASE_CLI', undefined)
  expect(goldenSupabaseCli(args)).toEqual(['npx', ['supabase@2', ...args]])
  vi.stubEnv('SUPABASE_CLI', '/tools/supabase')
  expect(goldenSupabaseCli(args)).toEqual(['/tools/supabase', args])
})

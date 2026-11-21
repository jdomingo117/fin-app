import { expect, it, vi } from 'vitest'
import type { Txn } from '../data'
import { applyAfterContributorCheck, type ReviewApplyAssignment } from './categorizationReview'

const preview = [
  { id: 'accepted', merchantKey: 'grocer' }, { id: 'sample', merchantKey: 'grocer' },
  { id: 'other', merchantKey: 'cafe' },
] as Txn[]
const assignments = [{ transaction_id: 'accepted' }] as ReviewApplyAssignment[]
it('requires a new preview before writing when an unaccepted contributor became protected', async () => {
  const write = vi.fn()
  const current = preview.map(t => t.id === 'sample' ? { ...t, categorySource: 'user' as const } : t)
  expect(await applyAfterContributorCheck(preview, [], assignments, current, new Set(), 'eligible', write)).toEqual({ skipped: 1 })
  expect(write).not.toHaveBeenCalled()
})
it('applies accepted assignments when only an unrelated merchant lost a contributor', async () => {
  const write = vi.fn().mockResolvedValue('applied')
  expect(await applyAfterContributorCheck(preview, [], assignments, preview.slice(0,2), new Set(), 'eligible', write))
    .toEqual({ skipped: 0, result: 'applied' })
  expect(write).toHaveBeenCalledOnce()
})

import { describe, expect, it } from 'vitest'
import { initialAppearance } from './appearance'

describe('initialAppearance', () => {
  it('uses Console when no appearance has been saved', () => {
    expect(initialAppearance(null)).toBe('console')
  })

  it('keeps explicit Classic and Console choices', () => {
    expect(initialAppearance('classic')).toBe('classic')
    expect(initialAppearance('console')).toBe('console')
  })

  it('treats an unrecognised saved value as the Console default', () => {
    expect(initialAppearance('dark')).toBe('console')
  })
})

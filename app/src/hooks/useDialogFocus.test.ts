// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { dialogRestoreTarget, wrappedFocusIndex } from './useDialogFocus'

describe('dialog focus wrapping', () => {
  it('moves from an untracked initial target to the first control', () => {
    expect(wrappedFocusIndex(-1, 4, false)).toBe(0)
  })

  it('moves backwards from an untracked initial target to the last control', () => {
    expect(wrappedFocusIndex(-1, 4, true)).toBe(3)
  })

  it('wraps forward from the last control', () => {
    expect(wrappedFocusIndex(3, 4, false)).toBe(0)
  })

  it('wraps backwards from the first control and handles an empty dialog', () => {
    expect(wrappedFocusIndex(0, 4, true)).toBe(3)
    expect(wrappedFocusIndex(0, 0, false)).toBe(-1)
  })
})

describe('dialog focus restore target', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('skips a matching row in an exiting inert, hidden layer for the live one', () => {
    document.body.innerHTML = `
      <div class="console-route-layer" inert aria-hidden="true"><button data-row="a">Home card</button></div>
      <div class="console-route-layer"><button data-row="a">Overview row</button></div>`
    expect(dialogRestoreTarget(null, '[data-row="a"]', '[data-fallback]')?.textContent).toBe('Overview row')
  })

  it('falls back to the opener, then the fallback, when no match can take focus', () => {
    document.body.innerHTML = `
      <div inert><button data-row="a">Gone</button><button id="opener">Opener</button></div>
      <button data-fallback>Fallback</button><button id="live">Live opener</button>`
    const live = document.getElementById('live')!
    expect(dialogRestoreTarget(live, '[data-row="a"]', '[data-fallback]')).toBe(live)
    const inertOpener = document.getElementById('opener')!
    expect(dialogRestoreTarget(inertOpener, '[data-row="a"]', '[data-fallback]')?.textContent).toBe('Fallback')
  })
})

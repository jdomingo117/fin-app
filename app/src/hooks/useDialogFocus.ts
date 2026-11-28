import { useLayoutEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Safari doesn't focus a button when it's clicked. It focuses the nearest focusable ancestor, or nothing.
// So a dialog's opener is the control a pointer last pressed, until focus moves elsewhere or a key is pressed.
let pressedControl: HTMLElement | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', event => {
    pressedControl = event.target instanceof Element ? event.target.closest<HTMLElement>(FOCUSABLE_SELECTOR) : null
  }, true)
  document.addEventListener('focusin', event => {
    if (!(event.target instanceof Node && pressedControl && event.target.contains(pressedControl))) pressedControl = null
  }, true)
  document.addEventListener('keydown', () => { pressedControl = null }, true)
}

function dialogOpener(dialog: HTMLElement) {
  if (pressedControl?.isConnected && !dialog.contains(pressedControl)) return pressedControl
  const focused = document.activeElement
  return focused instanceof HTMLElement && focused !== document.body && focused !== document.documentElement ? focused : null
}

export function wrappedFocusIndex(currentIndex: number, count: number, backwards: boolean) {
  if (count < 1) return -1
  if (currentIndex < 0) return backwards ? count - 1 : 0
  return (currentIndex + (backwards ? -1 : 1) + count) % count
}

export function focusableElements(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
}

export function keepDialogTabFocus(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>, dialog: HTMLElement) {
  if (event.key !== 'Tab') return
  const focusable = focusableElements(dialog)
  if (focusable.length === 0) {
    event.preventDefault()
    dialog.focus({ preventScroll: true })
    return
  }
  const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
  const isBoundary = currentIndex < 0
    || (!event.shiftKey && currentIndex === focusable.length - 1)
    || (event.shiftKey && currentIndex === 0)
  if (!isBoundary) return
  event.preventDefault()
  focusable[wrappedFocusIndex(currentIndex, focusable.length, event.shiftKey)]?.focus({ preventScroll: true })
}

/** An inert or aria-hidden subtree, such as a Console route layer still fading out, can't take focus. */
export function canRestoreFocus(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element?.isConnected && !element.closest('[inert], [aria-hidden="true"], [hidden]')
}

/**
 * Picks where focus goes after a dialog closes: the first live match for the
 * restore selector, then the opener, then the fallback. A selector can match
 * a copy of the row in an exiting route layer earlier in the document, so
 * matches that can't take focus are skipped.
 */
export function dialogRestoreTarget(opener: HTMLElement | null, restoreSelector: string | undefined, fallbackSelector: string) {
  const first = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].find(canRestoreFocus)
  return (restoreSelector ? first(restoreSelector) : undefined)
    ?? (canRestoreFocus(opener) ? opener : undefined)
    ?? first(fallbackSelector)
}

/**
 * Keeps keyboard focus inside an active modal, gives screen-reader users a
 * stable initial focus target, and returns focus to the opener after close.
 * The fallback covers flows whose successful completion removes the opener.
 */
export function useDialogFocus({
  active = true,
  fallbackSelector = '[data-dialog-focus-fallback]',
  restoreSelector,
}: {
  active?: boolean
  fallbackSelector?: string
  restoreSelector?: string
} = {}): RefObject<HTMLElement> {
  const dialogRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = dialogOpener(dialog)
    dialog.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => keepDialogTabFocus(event, dialog)

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.requestAnimationFrame(() => {
        const anotherDialogIsOpen = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
          .some((candidate) => candidate !== dialog)
        if (anotherDialogIsOpen) return
        dialogRestoreTarget(opener, restoreSelector, fallbackSelector)?.focus({ preventScroll: true })
      })
    }
  }, [active, fallbackSelector, restoreSelector])

  return dialogRef
}

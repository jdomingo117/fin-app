import { useLayoutEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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
    const opener = document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      && document.activeElement !== document.documentElement
      ? document.activeElement : null
    dialog.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => keepDialogTabFocus(event, dialog)

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.requestAnimationFrame(() => {
        const anotherDialogIsOpen = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
          .some((candidate) => candidate !== dialog)
        if (anotherDialogIsOpen) return
        const explicitTarget = restoreSelector ? document.querySelector<HTMLElement>(restoreSelector) : null
        const target = explicitTarget ?? (opener?.isConnected
          ? opener
          : document.querySelector<HTMLElement>(fallbackSelector))
        target?.focus({ preventScroll: true })
      })
    }
  }, [active, fallbackSelector, restoreSelector])

  return dialogRef
}

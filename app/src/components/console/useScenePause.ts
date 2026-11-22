import { useEffect, useState, useSyncExternalStore } from 'react'

function subscribe(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

const readVisibility = () => !document.hidden

export function useDocumentVisible() {
  return useSyncExternalStore(subscribe, readVisibility, () => true)
}

export function hasCoveringOverlay(except?: Element | null) {
  const selector = 'dialog[open], [role="dialog"][aria-modal="true"]'
  return Array.from(document.querySelectorAll(selector)).some(overlay =>
    overlay !== except && !overlay.closest('dialog:not([open]), [inert], [hidden], [aria-hidden="true"]')
    && overlay.getClientRects().length > 0,
  )
}

export function isEditableShortcutTarget(event: KeyboardEvent) {
  const editable = 'input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]'
  return event.composedPath().some(target => target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest(editable)))
}

export function useCoveringOverlay() {
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    const check = () => setCovered(hasCoveringOverlay())
    const observer = new MutationObserver(check)
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['open', 'role', 'aria-modal', 'aria-hidden', 'hidden', 'inert'],
    })
    check()
    return () => observer.disconnect()
  }, [])
  return covered
}

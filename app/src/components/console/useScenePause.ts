import { useEffect, useState, useSyncExternalStore } from 'react'

function subscribe(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

const readVisibility = () => !document.hidden

export function useDocumentVisible() {
  return useSyncExternalStore(subscribe, readVisibility, () => true)
}

export function useCoveringOverlay() {
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    const selector = 'dialog[open], [role="dialog"][aria-modal="true"]'
    function check() {
      const overlays = document.querySelectorAll(selector)
      setCovered(Array.from(overlays).some(overlay =>
        !overlay.closest('[inert], [hidden], [aria-hidden="true"]') && overlay.getClientRects().length > 0,
      ))
    }
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

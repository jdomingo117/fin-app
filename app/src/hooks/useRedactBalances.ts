import { useSyncExternalStore } from 'react'

function subscribe(notify: () => void) {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function read() {
  return document.documentElement.classList.contains('redacted')
}

export function useRedactBalances() {
  return useSyncExternalStore(subscribe, read, () => false)
}

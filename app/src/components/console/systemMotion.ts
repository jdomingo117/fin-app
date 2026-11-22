import { useSyncExternalStore } from 'react'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function subscribeToMotionPreference(callback: () => void) {
  const media = window.matchMedia(reducedMotionQuery)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

function readMotionPreference() {
  return window.matchMedia(reducedMotionQuery).matches
}

export function useSystemReducedMotion() {
  return useSyncExternalStore(subscribeToMotionPreference, readMotionPreference, () => false)
}

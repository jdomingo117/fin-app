import { useLayoutEffect } from 'react'

const appearanceChange = 'halcyon:before-appearance-change'

/** Let a mounted editor report the draft without changing its navigation behavior. */
export function useUnsavedChanges(dirty: boolean, warnOnUnload = false) {
  useLayoutEffect(() => {
    if (!dirty) return
    function report(event: Event) { event.preventDefault() }
    window.addEventListener(appearanceChange, report)
    if (warnOnUnload) window.addEventListener('beforeunload', report)
    return () => {
      window.removeEventListener(appearanceChange, report)
      if (warnOnUnload) window.removeEventListener('beforeunload', report)
    }
  }, [dirty, warnOnUnload])
}

export function confirmAppearanceChange() {
  // Query existing mounted reporters without leaving the document. A synthetic
  // event does not invoke the browser's navigation confirmation.
  const clean = window.dispatchEvent(new Event(appearanceChange, { cancelable: true }))
  const safeToLeave = window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
  return (clean && safeToLeave) || window.confirm('Switch appearance and discard unsaved changes?')
}

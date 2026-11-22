import { useLayoutEffect } from 'react'

/** Publish a mounted editor's dirty state through the same contract as Budget. */
export function useUnsavedChanges(dirty: boolean) {
  useLayoutEffect(() => {
    if (!dirty) return
    function report(event: Event) { event.preventDefault() }
    window.addEventListener('beforeunload', report)
    return () => window.removeEventListener('beforeunload', report)
  }, [dirty])
}

export function confirmAppearanceChange() {
  // Query existing mounted reporters without leaving the document. A synthetic
  // event does not invoke the browser's navigation confirmation.
  const clean = window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
  return clean || window.confirm('Switch appearance and discard unsaved changes?')
}

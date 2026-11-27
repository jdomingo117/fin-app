import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePlanning } from '../../hooks/usePlanning'
import { useRecurrence } from '../../hooks/useRecurrence'
import { TODAY } from '../../lib/period'

type PlanSource = 'planning' | 'recurrence'
type PlanReports = {
  planning: ReturnType<typeof usePlanning>
  recurrence: ReturnType<typeof useRecurrence>
  /** Whether a source has been asked for this session. An unasked source is never shown as empty. */
  requested: Record<PlanSource, boolean>
  request: (source: PlanSource) => void
}

const PlanReportsContext = createContext<PlanReports | null>(null)

/**
 * The signed-in Console viewport keeps one planning read and one recurrence read
 * for the session. `useReport` has no shared cache, and recurrence pages through
 * three years of evidence, so Home, Control Centre and the Goals and Bills hubs
 * share these instead of each starting its own. A source is read the first time
 * something asks for it, then again only when reports are invalidated.
 */
export function PlanReportsProvider({ children }: { children: ReactNode }) {
  const [requested, setRequested] = useState<Record<PlanSource, boolean>>({ planning: false, recurrence: false })
  const planning = usePlanning(requested.planning, true)
  const recurrence = useRecurrence(undefined, 'reporting', TODAY, requested.recurrence, true)
  const request = useCallback((source: PlanSource) => {
    setRequested(current => current[source] ? current : { ...current, [source]: true })
  }, [])
  return <PlanReportsContext.Provider value={{ planning, recurrence, requested, request }}>{children}</PlanReportsContext.Provider>
}

/** Reads the session's Plan sources, asking for each one in `need` once. */
export function usePlanReports(need: Partial<Record<PlanSource, boolean>> = {}) {
  const reports = useContext(PlanReportsContext)
  if (!reports) throw new Error('Console Plan reports need their viewport provider')
  const { request } = reports
  useEffect(() => { if (need.planning) request('planning') }, [need.planning, request])
  useEffect(() => { if (need.recurrence) request('recurrence') }, [need.recurrence, request])
  return reports
}

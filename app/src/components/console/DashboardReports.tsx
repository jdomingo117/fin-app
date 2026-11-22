import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePortfolio } from '../../hooks/usePortfolio'
import { useReport } from '../../hooks/useReport'
import { addDays, iso } from '../../lib/period'
import { cashFlow, latestLines, monthlyWorth } from '../../lib/reports'
import { useView } from '../../router'

export const RECENT_ACTIVITY_COUNT = 10

export function dashboardWindow() {
  const now = new Date()
  return { today: iso(now), from: iso(addDays(now, -29)) }
}

export function useDashboardCashFlow(from: string, to: string, accountScope?: string[], enabled = true) {
  return useReport([from, to, accountScope], tenant =>
    cashFlow(tenant, { p_from: from, p_to: to, p_account_ids: accountScope }), enabled)
}

export function useDashboardReports(from: string, to: string, enabled = true) {
  const summary = usePortfolio(enabled)
  const flow = useDashboardCashFlow(from, to, undefined, enabled)
  const activity = useReport('recent', tenant => latestLines(tenant, RECENT_ACTIVITY_COUNT), enabled)
  const history = useReport('monthly', monthlyWorth, enabled)
  return { summary, flow, activity, history }
}

const DashboardReportsContext = createContext<ReturnType<typeof useDashboardReports> | null>(null)

/** The signed-in Console viewport keeps the Dashboard reads warm across hub transitions. */
export function DashboardReportsProvider({ children }: { children: ReactNode }) {
  const { view } = useView()
  const [visited, setVisited] = useState(view === 'dashboard')
  useEffect(() => {
    if (view === 'dashboard') setVisited(true)
  }, [view])
  const { today, from } = dashboardWindow()
  const enabled = visited || view === 'dashboard'
  const reports = useDashboardReports(from, today, enabled)
  return <DashboardReportsContext.Provider value={reports}>{children}</DashboardReportsContext.Provider>
}

export function useCachedDashboardReports() {
  const reports = useContext(DashboardReportsContext)
  if (!reports) throw new Error('Console Dashboard needs its viewport report provider')
  return reports
}

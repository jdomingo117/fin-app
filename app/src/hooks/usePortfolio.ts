import {portfolio} from '../lib/reports'
import {iso} from '../lib/period'
import {useReport} from './useReport'

export function usePortfolio(enabled = true) {
  const today = iso(new Date())
  return useReport(today, tenant => portfolio(tenant, today), enabled)
}

import { useData } from '../contexts/DataContext'
import { useReport } from './useReport'
import { readRecurrence, type RecurrenceGrain } from '../lib/recurrenceScope'
import { TODAY } from '../lib/period'

export function useRecurrence(accountIds?:string[], grain:RecurrenceGrain='reporting', today=TODAY, enabled=true) {
  const {accounts,loadState} = useData()
  const ids = [...(accountIds ?? accounts.map(a=>a.id))].sort()
  const scoped = accounts.filter(a=>ids.includes(a.id))
  return useReport(['recurrence',ids,grain,today,scoped],tenant=>readRecurrence(tenant,scoped,today,grain),enabled && loadState==='ready')
}

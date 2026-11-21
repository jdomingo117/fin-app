import { useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useReport } from './useReport'
import { supabase } from '../lib/supabaseClient'
import { completePages, SCOPE_PAGE_SIZE } from '../lib/scopedPages'

export function useAccountIdentifiers() {
  const {accounts} = useData()
  const report = useReport('account identifiers',async tenant => completePages(async (cursor: string | null) => {
    let query = supabase.from('account_identifiers').select('id,account_id,kind,value,source,confidence')
      .eq('tenant_id',tenant).order('id').limit(SCOPE_PAGE_SIZE)
    if (cursor) query = query.gt('id',cursor)
    const {data,error} = await query
    if (error) throw error
    return {rows:data,next:data.length === SCOPE_PAGE_SIZE ? data.at(-1)!.id as string : null}
  }))
  const enriched = useMemo(()=>{
    const sourceRank = (source:string) => source === 'user' ? 0 : source === 'provider' ? 1 : 2
    const byAccount = new Map<string, NonNullable<typeof report.data>>()
    for (const row of report.data ?? []) {
      const list = byAccount.get(row.account_id) ?? []
      list.push(row); byAccount.set(row.account_id,list)
    }
    return accounts.map(account=>{
      const rows = (byAccount.get(account.id) ?? []).sort((a,b)=>sourceRank(a.source)-sourceRank(b.source)
        || (b.confidence ?? 0)-(a.confidence ?? 0) || a.id.localeCompare(b.id))
      const number = rows.find(row=>row.kind === 'mask' || row.kind === 'account_number')
      const institution = rows.find(row=>row.kind === 'institution')
      return {...account, institution:account.institution ?? institution?.value?.replace(/\b\w/g,(c:string)=>c.toUpperCase()),
        identifier:number?.value ? `•••• ${number.value.slice(-4)}` : undefined}
    })
  },[accounts,report.data])
  return {...report,accounts:enriched}
}

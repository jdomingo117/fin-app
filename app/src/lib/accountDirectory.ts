import { supabase } from './supabaseClient'
import { completePages, SCOPE_PAGE_SIZE } from './scopedPages'

export function readAccounts(tenant:string) {
  return completePages(async(cursor:string|null)=>{
    let q=supabase.from('accounts').select('id,name,type,balance,balance_source,balance_as_of')
      .eq('tenant_id',tenant).order('id').limit(SCOPE_PAGE_SIZE)
    if(cursor)q=q.gt('id',cursor)
    const {data,error}=await q
    if(error)throw error
    return {rows:data,next:data.length===SCOPE_PAGE_SIZE ? data.at(-1)!.id as string : null}
  })
}
export function readAccountConnections(tenant:string) {
  return completePages(async(cursor:string|null)=>{
    let q=supabase.from('account_connections').select('id,account_id,connection_id,provider,cutover_date,balance_as_of,provider_connections(status)')
      .eq('tenant_id',tenant).order('id').limit(SCOPE_PAGE_SIZE)
    if(cursor)q=q.gt('id',cursor)
    const {data,error}=await q
    if(error)throw error
    return {rows:data,next:data.length===SCOPE_PAGE_SIZE ? data.at(-1)!.id as string : null}
  })
}

import { useReport } from './useReport'
import { supabase } from '../lib/supabaseClient'
import { completePages, SCOPE_PAGE_SIZE } from '../lib/scopedPages'
import type { CustomSubcategory } from '../data'

export async function readTaxonomy(tenant: string): Promise<CustomSubcategory[]> {
  const rows = await completePages(async (cursor: string | null) => {
    let query = supabase.from('tenant_subcategories')
      .select('id,category_id,display_name,taxonomy_categories!inner(display_name)')
      .eq('tenant_id',tenant).eq('active',true).order('id').limit(SCOPE_PAGE_SIZE)
    if (cursor) query = query.gt('id',cursor)
    const {data,error} = await query
    if (error) throw error
    return {rows:data,next:data.length === SCOPE_PAGE_SIZE ? data.at(-1)!.id as string : null}
  })
  return rows.map(row => ({id:row.id,categoryId:row.category_id,displayName:row.display_name,
    category:(row.taxonomy_categories as unknown as {display_name:string}).display_name}))
    .sort((a,b)=>a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
}
export function useTaxonomy(enabled = true) {
  const report = useReport('taxonomy',readTaxonomy,enabled)
  return {...report, customSubcategories:report.data ?? []}
}

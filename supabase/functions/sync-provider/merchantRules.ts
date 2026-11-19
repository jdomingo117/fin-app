import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const MERCHANT_RULE_BATCH_SIZE = 100

export async function lookupUserMerchantRules(db: SupabaseClient, merchantKeys: string[]) {
  const userRules = new Map<string, { category: string; subcategory: string | null }>()
  for (let i = 0; i < merchantKeys.length; i += MERCHANT_RULE_BATCH_SIZE) {
    const { data: rules, error } = await db
      .from('merchant_rules')
      .select('merchant_key, category, subcategory')
      .eq('source', 'user')
      .in('merchant_key', merchantKeys.slice(i, i + MERCHANT_RULE_BATCH_SIZE))
    if (error) throw error
    for (const rule of rules ?? []) userRules.set(rule.merchant_key, rule)
  }
  return userRules
}

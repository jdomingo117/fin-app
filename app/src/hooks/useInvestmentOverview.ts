import { supabase } from '../lib/supabaseClient'
import { useReport } from './useReport'

interface Summary {
  holding_id: string
  instrument_name: string
  identifier: string
  calculated_units: string
  confirmed_units: string | null
  reconciliation_status: string
  net_external_contributions_cents: number
  reinvested_distributions_cents: number
  activity_count: number
  value_cents: number | null
  nav_price: string | null
  price_date: string | null
  valuation_status: 'current' | 'stale' | 'partial' | null
  market_movement_cents: number | null
  cash_distributions_cents: number
}

interface Monthly {
  valuation_date: string
  value_cents: number
  cumulative_contributions_cents: number
}

export function useInvestmentOverview(accountId?: string) {
  return useReport(['investment overview', accountId], async tenant => {
    const [summary, monthly] = await Promise.all([
      supabase.from('investment_account_overview').select('*').eq('tenant_id', tenant).eq('account_id', accountId!).maybeSingle(),
      supabase.from('investment_account_monthly').select('valuation_date,value_cents,cumulative_contributions_cents')
        .eq('tenant_id', tenant).eq('account_id', accountId!).order('valuation_date', { ascending: false }).limit(12),
    ])
    if (summary.error || monthly.error) throw summary.error ?? monthly.error
    return { summary: summary.data as Summary | null, monthly: (monthly.data as Monthly[]).reverse() }
  }, !!accountId)
}

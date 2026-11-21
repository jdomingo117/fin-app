import type {Txn} from '../data'
import {supabase} from './supabaseClient'

function parentQuery(tenant:string,id:string) {
  return supabase.from('transactions_analytic').select('*').eq('tenant_id',tenant).eq('id',id).single()
}
type ParentRow = NonNullable<Awaited<ReturnType<typeof parentQuery>>['data']>
export function mapParent(t:ParentRow,accountName:string):Txn {
  return {
        id: t.id,
        date: t.date,
        merchant: t.merchant || t.original_description,
        merchantKey: t.merchant_key,
        originalDescription: t.original_description,
        cat: t.category,
        categoryId: t.category_id,
        subcat: t.subcategory,
        subcategoryId: t.subcategory_id,
        kind: t.kind,
        kindSource: t.kind_source,
        isRecurring: t.is_recurring,
        recurringSource: t.recurring_source,
        isSubscription: t.is_subscription,
        subscriptionSource: t.subscription_source,
        spendingNature: t.spending_nature,
        isReimbursable: t.is_reimbursable,
        isTaxRelated: t.is_tax_related,
        categorySource: t.category_source,
        categoryConfidence: t.category_confidence,
        needsReview: t.needs_review,
        amount: t.amount,
        account: accountName,
        account_id: t.account_id,
        upload_batch_id: t.upload_batch_id,
        isTransfer: t.is_transfer,
        transferState: t.transfer_state,
        pending: t.pending,
        }
}
export async function reportParent(tenant:string,id:string,accounts:{id:string;name:string}[]) {
  const [parent,allocations] = await Promise.all([parentQuery(tenant,id),
    supabase.from('transaction_allocations').select('id,position,amount,kind,category,subcategory,note')
      .eq('tenant_id',tenant).eq('transaction_id',id).order('position')])
  if (parent.error) throw parent.error
  if (allocations.error) throw allocations.error
  const row = mapParent(parent.data,accounts.find(a=>a.id===parent.data.account_id)?.name ?? 'Unknown')
  return {...row,allocations:allocations.data}
}

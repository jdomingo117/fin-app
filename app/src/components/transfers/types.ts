export interface LinkedTxn {
  id: string
  date: string
  amount: number
  original_description: string | null
  account_id: string
}

export interface TransferLinkRow {
  id: string
  state: 'auto' | 'suggested' | 'confirmed' | 'rejected' | 'external'
  score: number
  reasons: string[]
  ambiguous: boolean
  from_txn: LinkedTxn | null
  to_txn: LinkedTxn | null
}

export interface UnmatchedRow {
  id: string
  date: string
  amount: number
  original_description: string | null
  account_id: string
}

export interface OverflowRow {
  amount_cents: number
  leg_count: number
}

export interface SuggestedGroup {
  key: string
  fromAccountId: string
  toAccountId: string
  links: TransferLinkRow[]
}

export interface UnmatchedGroup {
  key: string
  label: string
  rows: UnmatchedRow[]
}

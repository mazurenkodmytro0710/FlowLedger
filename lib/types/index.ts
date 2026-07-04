export interface FinanceAccount {
  id: string
  user_id: string
  name: string
  icon: string
  currency: string
  current_balance: number
  is_savings: boolean
  include_in_total: boolean
  sort_order: number
  created_at: string
}

export interface FLCategory {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  type: string
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface FLTransaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  subcategory_id: string | null
  amount: number
  currency: string
  amount_eur: number | null
  description: string | null
  date: string
  is_transfer: boolean
  receipt_photo_url: string | null
  source: string | null
  created_at: string
  // joined
  account?: FinanceAccount | null
}

export interface FLBudget {
  id: string
  user_id: string
  category_id: string
  amount_eur: number
  month: string
  created_at: string
}

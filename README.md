# FlowLedger

Personal finance tracker. Part of the self-improvement ecosystem alongside T6X.

## Features
- **Check-mode entry** — add multiple items at once like a real receipt
- **Expense / Income** tracking with categories and subcategories
- **Multi-currency** (EUR, UAH, USD) with live Monobank rates
- **Analytics** — spending by category with donut chart, period comparison
- **JSON export** of all data

## Part of the ecosystem
Same Supabase database as T6X. One user_id. All your life data in one place.

## Setup
```bash
npm install
cp .env.example .env.local
# Fill in Supabase keys (same as T6X)
npm run dev
```

## Database
Run the SQL from the project spec in your Supabase SQL editor to create:
- `finance_accounts`
- `fl_categories`
- `fl_transactions`
- `fl_budgets`

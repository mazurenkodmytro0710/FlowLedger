# FlowLedger 💸

> Personal finance tracker — part of the T6X self-improvement ecosystem.

Track every euro. Understand where your money goes. Get weekly AI coaching.

## Features

- 📊 **Analytics** — donut charts by day / week / month / year. Drill into subcategories.
- ➕ **Smart entry** — currency auto-detected from account. Category + subcategory with search.
- 🤖 **AI weekly report** — Grok analyzes your spending every Monday and tells you what to cut.
- 💳 **Multiple accounts** — TatraBank, Monobank, cash. Choose which count toward total balance.
- 🔍 **Two-layer data** — imported history for trends, manual entries for detailed subcategory analysis.
- 📱 **PWA** — install on iPhone via Safari. Works offline.

## Ecosystem

FlowLedger is part of a personal data ecosystem:

| App | Purpose | Status |
|-----|---------|--------|
| **T6X** | Habits, workouts, body, focus (Kanban) | ✅ Live |
| **FlowLedger** | Personal finance tracking | ✅ Live |
| **EnglishOS** | Language learning with spaced repetition | 🔜 Planned |

All apps share one Supabase database. One `user_id`. One source of truth.

> Life as a dataset. Track everything. Analyze. Improve.

## Tech Stack

- **Next.js 14** — App Router, TypeScript
- **Supabase** — PostgreSQL + Auth + RLS
- **Tailwind CSS** — Dark theme, mobile-first
- **Vercel** — Hosting + weekly cron for AI report
- **Grok API** — Weekly spending analysis
- **Monobank API** — Live EUR/UAH rates (no key needed)

## Setup

```bash
git clone <repo>
cd flowledger
npm install
cp .env.example .env.local
npm run dev
```

Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Grok API key is stored per-user in the database (Settings → AI Report).

## Data Model

New tables (shared Supabase project with T6X):

- `finance_accounts` — accounts with currency and balance
- `fl_categories` — expense/income categories + subcategories (`parent_id`)
- `fl_transactions` — all transactions (`source`: `manual` | `excel`)
- `fl_budgets` — monthly budgets per category

## Philosophy

Two layers of data:

- Excel import (`source: 'excel'`) — historical data for trend analysis
- Manual entries (`source: 'manual'`) — detailed subcategory tracking for deep analysis

Track broadly, then zoom in where behavior changes.

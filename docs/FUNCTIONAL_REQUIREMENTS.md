# Functional Requirements

## 1. Purpose

This document records behavior verified in the FlowLedger source code and separates it from incomplete or absent functionality. Priorities are a proposed analytical assessment, not historically approved requirements.

## 2. Scope

The scope covers authentication, accounts, categories, transactions, analytics, export, AI reporting, currency conversion, scheduling, and the PWA shell. Database policies and constraints are unverified because no SQL schema or migrations are included.

## 3. Actors

| Actor | Description |
|---|---|
| Authenticated user | Existing Supabase user managing personal finance records |
| Unauthenticated visitor | Visitor who can access the login page and is redirected there by protected client pages |
| Vercel Cron | Scheduler calling the weekly report endpoint |
| Supabase | Authentication and data platform |
| Monobank API | Public exchange-rate source |
| xAI API | Generates report commentary |

## 4. Functional Requirements

| ID | Requirement | Priority | Status | Implementation evidence |
|---|---|---|---|---|
| FR-001 | The system shall sign in an existing user with email and password. | Must | Implemented | `app/login/page.tsx`, `signIn` |
| FR-002 | The system shall redirect a page visitor without a Supabase user to login. | Must | Partially Implemented | `load` functions in pages under `app/(tabs)`; no middleware/server guard |
| FR-003 | The user shall sign out. | Must | Implemented | `app/(tabs)/settings/page.tsx`, Account tab |
| FR-004 | The user shall create, edit, and delete financial accounts. | Must | Implemented | `addAccount`, `saveEditAccount`, `deleteAccount` in settings |
| FR-005 | Accounts shall store name, icon, currency, balance, savings flag, total-inclusion flag, and sort order. | Must | Implemented | `FinanceAccount`; settings account mutations |
| FR-006 | The home page shall calculate a EUR total for accounts marked `include_in_total`. | Must | Implemented | `app/(tabs)/home/page.tsx`, `totalBalance` |
| FR-007 | The system shall seed default expense and income categories when none exist. | Should | Implemented | settings `load`; `lib/defaults.ts` |
| FR-008 | The user shall manage root categories and one-level subcategories. | Must | Implemented | settings and add/edit transaction category functions |
| FR-009 | The user shall create manual expenses and income for an account. | Must | Implemented | `app/(tabs)/add/page.tsx`, `save` |
| FR-010 | The system shall store expense values as negative and income values as positive. | Must | Implemented | add-page `sign` and `signedAmount` logic |
| FR-011 | The user shall create a transfer with source and target records. | Should | Partially Implemented | add-page `save`; legs are unlinked and target currency conversion is absent |
| FR-012 | A new transaction shall update the stored account balance. | Must | Partially Implemented | add-page `save`; separate non-atomic update, errors ignored |
| FR-013 | The user shall view recent transactions and a paginated transaction list. | Must | Implemented | home and transactions pages; page size 50 |
| FR-014 | The user shall filter loaded transactions by type and current week/month and sort them. | Should | Partially Implemented | `applyFilters`; only already-loaded pages are filtered |
| FR-015 | The user shall edit amount, category, subcategory, date, and note. | Must | Partially Implemented | `saveEdit`; `amount_eur` and a transfer counterpart are not updated |
| FR-016 | The user shall delete a transaction and reverse its amount from the stored balance. | Must | Partially Implemented | `deleteTx`; separate writes and one transfer leg at a time |
| FR-017 | The system shall fetch and cache Monobank rates and provide fallback rates. | Should | Implemented | `lib/monobank.ts`, `getRates` |
| FR-018 | A created transaction shall store an EUR-normalized amount. | Must | Implemented | add-page `amount_eur` calculation |
| FR-019 | Analytics shall load non-transfer records for a selected day, week, month, or year. | Must | Implemented | analytics `getDateRange` and `load` |
| FR-020 | Analytics shall calculate total income, total expenses, and category/subcategory expense shares. | Must | Implemented | analytics memoized calculations |
| FR-021 | The user shall export a flattened JSON transaction dataset. | Should | Implemented | settings `exportJSON` |
| FR-022 | The system shall import CSV or Excel transaction data. | Could | Not Implemented | No import parser, input, or route; `source` field alone is insufficient |
| FR-023 | The system shall manage budgets and calculate utilization. | Could | Not Implemented | Only `FLBudget` TypeScript interface exists |
| FR-024 | An authenticated user with a stored Grok key shall generate a report on demand. | Should | Implemented | `POST /api/ai-report`; `generateWeeklyFinanceReport` |
| FR-025 | The report shall aggregate negative, non-transfer records from the recent date window by category/subcategory. | Should | Implemented | `lib/ai-report.ts` |
| FR-026 | A weekly protected job shall generate reports for enabled profiles. | Should | Implemented | `vercel.json`; `GET /api/cron/finance-report` |
| FR-027 | The system shall deliver the weekly report by push notification. | Could | Not Implemented | UI text only; no subscription or delivery code |
| FR-028 | The application shall expose installable PWA metadata and register a service worker. | Could | Implemented | manifest, icons, root layout, `ServiceWorkerRegistration` |
| FR-029 | Authenticated financial workflows shall function offline. | Could | Not Implemented | Supabase/Monobank requests are network-only; no offline datastore |

## 5. Non-Functional Requirements

| ID | Requirement | Priority | Status | Implementation evidence |
|---|---|---|---|---|
| NFR-001 | Credentials shall not be committed to Git. | Must | Implemented | `.gitignore`; repository/history scan found no common secret signatures |
| NFR-002 | Service-role access shall remain server-side. | Must | Implemented | Used only in cron route; not prefixed `NEXT_PUBLIC_` |
| NFR-003 | Users shall access only their own financial records. | Must | Unverified | Queries use `user_id`, but RLS policies are absent and many mutations filter only by ID |
| NFR-004 | Related ledger and balance mutations shall be atomic. | Must | Not Implemented | Separate browser requests for transaction and balance writes |
| NFR-005 | Financial calculations shall be deterministic and traceable to rate provenance. | Must | Partially Implemented | Explicit formulas exist; rate source/time is not persisted |
| NFR-006 | The application shall handle external-service failure without corrupting data. | Must | Partially Implemented | Currency fallback exists; most Supabase mutation errors are ignored |
| NFR-007 | The codebase shall pass TypeScript, lint, and automated tests. | Should | Unverified | Verification results documented after review; no test script exists |
| NFR-008 | The interface shall support mobile installation and safe-area layout. | Could | Implemented | manifest, icons, viewport metadata, mobile navigation |
| NFR-009 | Sensitive financial and AI-provider data shall have documented retention and consent. | Must | Not Implemented | No privacy/retention workflow; aggregates are sent to xAI |

## 6. Business Rules

1. Negative non-transfer amounts represent expenses; positive non-transfer amounts represent income.
2. Transfers are identified by `is_transfer` and excluded from analytics and AI expense aggregation.
3. Analytics use EUR as the reporting currency.
4. Stored `amount_eur` takes precedence; live conversion is used only when it is null.
5. Only accounts with `include_in_total = true` contribute to the home total.
6. Root categories have `parent_id = null`; subcategories reference a root category.
7. The weekly report includes records selected by a server-calculated date range and only negative, non-transfer amounts.
8. Scheduled reports are limited to profiles with both `ai_report_enabled` and a non-empty Grok key.

## 7. Validation Rules

- Login requires non-empty email and password in the UI; Supabase performs credential validation.
- Transaction amount must parse to a non-zero number.
- Expense/income requires a category and account.
- Account creation requires a non-empty name; balance input permits digits and one decimal point.
- Category creation requires a non-empty name; the add-transaction shortcut also requires an icon.
- Report generation requires an authenticated user and stored Grok key.
- Cron access requires exact `Authorization: Bearer <CRON_SECRET>` matching.

Missing validation includes negative-input normalization at all entry points, transfer source/target inequality, supported currency enforcement at the database boundary, ownership checks visible in mutation filters, and maximum field lengths.

## 8. Error Handling

- Login displays Supabase errors.
- Manual AI reporting returns 400/401/500 JSON and displays the error in a toast.
- Currency retrieval falls back to fixed conversion values.
- Cron uses `Promise.allSettled` and returns generated/failed counts.
- Most account, category, transaction, and export queries do not inspect Supabase errors; success UI may therefore be shown after a failed write.

## 9. Acceptance Criteria

### Account creation

```gherkin
Given an authenticated user is in Settings
When they enter a non-empty account name, select a supported currency, and submit
Then the client inserts a finance_accounts record for that user
And reloads the account list
```

### Add expense or income

```gherkin
Given an authenticated user has an account and a matching root category
When they submit a valid non-zero amount
Then an fl_transactions record is inserted with source manual
And the sign reflects expense or income
And amount_eur is stored using the selected account currency
And the client separately updates current_balance
```

### Edit transaction

```gherkin
Given a loaded transaction
When the user changes its amount, category, subcategory, date, or note
Then the selected transaction record is updated
And the client separately applies the original-currency amount delta to the account balance
But amount_eur is not recalculated in the current implementation
```

### Categorize expense

```gherkin
Given an expense transaction
When the user selects a root category and optional subcategory
Then those identifiers are stored on the transaction
And the record can contribute to the matching analytics breakdown
```

### Import financial data

No acceptance criteria are defined because import is not implemented.

### View analytics

```gherkin
Given an authenticated user selects a period
When analytics data loads
Then only non-transfer transactions within the inclusive date range are returned
And income and expense totals are calculated from signed records in EUR
And categorized expenses are grouped for the donut chart
```

### Generate AI report

```gherkin
Given an authenticated user has a Grok key in profiles
When they request a report
Then recent negative non-transfer transactions are grouped by category
And aggregate values are sent to xAI when spending exists
And an ai_reports record is inserted
```

## 10. Requirements Traceability Matrix

| Capability | Requirements | Main evidence |
|---|---|---|
| Authentication | FR-001–FR-003 | `app/login`, tab-page `load`, settings sign-out |
| Accounts | FR-004–FR-006 | settings, home, `FinanceAccount` |
| Categories | FR-007–FR-008 | defaults, settings, add/edit flows |
| Ledger | FR-009–FR-016 | add and transactions pages |
| Currency | FR-017–FR-018 | `lib/monobank.ts`, add page |
| Analytics | FR-019–FR-020 | analytics page and donut chart |
| Portability/import | FR-021–FR-023 | settings export; missing import/budget usage |
| AI/scheduling | FR-024–FR-027 | API routes, `lib/ai-report.ts`, `vercel.json` |
| PWA | FR-028–FR-029 | manifest, service worker, registration |

## 11. Known Gaps

- No schema migrations, RLS policies, indexes, or database tests.
- No transactional mutation boundary for ledger and balances.
- No import or duplicate-detection logic.
- No functional budget module.
- No push delivery despite UI wording.
- No rate provenance or historical revaluation.
- No update of `amount_eur` during transaction editing.
- No linkage between transfer legs.
- No server-side filtering for transaction filters.
- No automated tests or product analytics tracking.

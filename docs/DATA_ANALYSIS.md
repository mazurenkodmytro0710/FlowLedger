# Data Analysis Case Study

## 1. Analytical Objectives

FlowLedger's implemented analytics answer three descriptive questions:

1. How much income and expense was recorded in a selected period?
2. Which root categories account for categorized expense value?
3. Which subcategories account for value within a selected root category?

The application does not currently calculate forecasts, anomalies, savings rate, budget utilization, cohort behavior, or statistical trends.

## 2. Data Sources

| Source | Analytical use | Verification status |
|---|---|---|
| `fl_transactions` | Amounts, currencies, normalized EUR values, dates, signs, transfer flags, category IDs | Verified through queries/types |
| `fl_categories` | Category/subcategory labels and hierarchy | Verified through queries/types |
| `finance_accounts` | Stored balances, currencies, total-inclusion flag | Verified through queries/types |
| Monobank currency endpoint | Current EUR/UAH and USD/UAH conversion factors | Verified in `lib/monobank.ts` |
| `ai_reports` | Persisted report text and aggregate summary | Verified through report insert/read |
| `fl_budgets` | Potential budget analysis | Unverified table; no active calculations |

No production data or numerical results were used for this case study.

## 3. Data Structure

Transactions store a signed amount in the account currency and an optional signed `amount_eur`. `category_id` identifies a root category; `subcategory_id` identifies an optional child. `is_transfer` distinguishes internal movement from income/expense. `source` records `manual` for current entry; other values such as `excel` are possible in the type/data narrative but no importer exists.

The schema is inferred because no migrations, constraints, or generated Supabase types are checked in.

## 4. Data Preparation

For interactive analytics:

1. derive inclusive date boundaries on the client;
2. query user records in range where `is_transfer = false`;
3. load the user's categories;
4. retrieve current or fallback conversion rates;
5. classify transactions by sign;
6. use `abs(amount_eur)` when present, otherwise convert and take the absolute value;
7. group expenses by valid category/subcategory identifiers.

For AI reporting, a server process selects recent negative, non-transfer records and groups them by resolved category names.

## 5. Data Quality Considerations

| Issue | Evidence | Analytical effect |
|---|---|---|
| Stale normalized values | Transaction editing changes `amount` but not `amount_eur`. | Totals may retain the old EUR value. |
| Missing rate provenance | Creation stores EUR value but not rate or timestamp. | Historical conversion cannot be audited or recalculated consistently. |
| Fallback rates | Fixed UAH/USD factors are used on API failure. | Values may be materially different from market rates. |
| Non-atomic writes | Transaction and balance changes are separate browser requests. | Stored balances can diverge from ledger activity. |
| Unlinked transfers | Two independent rows lack a transfer ID. | Pairing, editing, deleting, and reconciliation are unreliable. |
| Cross-currency transfer logic | Target leg uses source amount and currency. | Target balance and currency representation can be wrong. |
| Missing categories | Headline spend includes them; root chart drops them. | Chart total/share can disagree with headline total. |
| Pagination before filtering | Filters operate on loaded pages. | Filtered results may be incomplete. |
| Mutable account balance | User can edit balance independently. | Balance cannot be reproduced solely from transactions. |
| Query errors treated as empty | Several pages use `data ?? []` without error UI. | Data outage can look like zero activity. |

## 6. Financial Metrics

| Metric | Definition | Calculation | Data source | Implementation evidence |
|---|---|---|---|---|
| Included account balance | Current value of accounts included in home total, expressed in EUR | `Σ convert(current_balance, account.currency)` where `include_in_total` | `finance_accounts`, current/fallback rates | `app/(tabs)/home/page.tsx` |
| Period expense | Absolute EUR value of negative, non-transfer records in range | `Σ abs(amount_eur ?? convert(amount))` for `amount < 0` | `fl_transactions` | analytics `totalSpent` |
| Period income | Absolute EUR value of positive, non-transfer records in range | `Σ abs(amount_eur ?? convert(amount))` for `amount > 0` | `fl_transactions` | analytics `totalIncome` |
| Net cash flow | Income minus expense | Not calculated/displayed | — | Not implemented |
| Category expense | Expense value assigned to a resolvable root category | `Σ analytical_value` grouped by `category_id` | transactions + categories | analytics `categoryBreakdown` |
| Category share | Share of categorized expense value | `category_total / Σ categorized_category_totals × 100` | category aggregation | analytics `categoryBreakdown` |
| Subcategory expense | Expense value within selected root category grouped by subcategory; missing becomes Other | `Σ analytical_value` grouped by `subcategory_id` | transactions + categories | analytics `subcategoryBreakdown` |
| Budget utilization | Expense divided by category budget | Not calculated | — | Not implemented |
| Weekly AI total | Recent negative non-transfer values grouped by labels | `Σ abs(amount_eur ?? amount)` | transactions + categories | `lib/ai-report.ts` |

## 7. Aggregation Logic

Let `v(t)` be the analytical EUR magnitude of transaction `t`:

```text
v(t) = abs(t.amount_eur)                         if amount_eur is not null
v(t) = abs(t.amount × current conversion rate)  otherwise
```

Interactive expense and income totals are:

```text
expense(P) = Σ v(t), where t.date ∈ P, t.amount < 0, and t.is_transfer = false
income(P)  = Σ v(t), where t.date ∈ P, t.amount > 0, and t.is_transfer = false
```

Transfers are correctly excluded from these totals. Zero-value records are neither income nor expense, although normal creation blocks a parsed zero.

The AI path differs: when `amount_eur` is null it uses `abs(amount)` without currency conversion. This can mix UAH/USD magnitudes into an EUR-labelled report.

## 8. Time-Based Analysis

The analytics page supports:

- day: one local calendar date;
- week: Monday through Sunday using `weekStartsOn: 1`;
- month: calendar start/end;
- year: calendar start/end.

Boundaries are formatted as `yyyy-MM-dd` in the browser and compared to the database `date` field. Future navigation is disabled, while past navigation is open-ended.

AI reporting calculates `weekStart = today - 7 days` and `weekEnd = today`, both inclusive. This can cover eight date labels rather than a strict seven-day half-open window. Dates depend on the server runtime timezone; no user timezone is stored or applied.

No month-over-month, rolling average, seasonality, or trend series is implemented.

## 9. Category-Based Analysis

Root expense groups require both a non-null `category_id` and a matching category row. Uncategorized/orphaned expenses are excluded from the donut even though they contribute to total spent.

Within a selected valid root category, missing or unresolved subcategories are grouped as `Other`. Category percentages use categorized expense total as the denominator, not the headline total.

Deleting categories may create orphaned references or be blocked/cascaded by the database; behavior is unverified without constraints.

## 10. Currency Handling

Supported account choices are EUR, UAH, and USD. Active conversion derives:

```text
UAH to EUR = 1 / EUR-UAH sell-or-cross rate
USD to EUR = USD-UAH sell-or-cross rate / EUR-UAH sell-or-cross rate
EUR to EUR = 1
```

Rates are cached in browser `localStorage` for one hour. On failure, fixed factors are used. A transaction stores the converted EUR value at creation, so normal historical analytics use entry-time values. The application does not store the provider rate, rate timestamp, or conversion method.

Home account totals use current/fallback rates rather than historical rates. Therefore account totals and summed transaction values answer different questions and are not expected to reconcile automatically.

## 11. Data Visualization

The analytics page displays:

- EUR spent and income headline cards;
- a custom SVG donut chart;
- category or subcategory totals, percentages, and proportional bars;
- period/granularity navigation and swipe gestures.

There is no time-series chart, balance history, comparison baseline, confidence indicator, or indication that fallback currency rates were used.

## 12. Export Capabilities

JSON export flattens all user transactions with original/EUR amounts, inferred type, category/subcategory/account names, note, source, and dates. It supports ad hoc analysis but is not a complete backup because entity IDs, account/category master records, AI reports, and configuration are not preserved as separate datasets.

No CSV/Excel export or import is implemented. Historical import therefore cannot currently cause code-driven duplicate records, but manual or externally inserted data could; no uniqueness or duplicate detection can be verified.

## 13. Analytical Limitations

- Descriptive totals only; no net cash flow, savings rate, budgets, trends, or forecasting.
- No distinction between gross and net income beyond the stored signed amount.
- No reconciliation or completeness indicator.
- No configurable base currency.
- No historical exchange-rate provenance.
- No user-timezone model.
- No reliable treatment of cross-currency transfers.
- No automated data-quality checks or anomaly flags.
- No validation that category type matches transaction sign after edits/external writes.

## 14. Potential Improvements

1. Centralize financial formulas in tested domain functions.
2. Store `exchange_rate`, `rate_timestamp`, `rate_source`, and base-currency value.
3. Recalculate normalized values on edits or derive them server-side.
4. Create atomic transaction/balance procedures and daily reconciliation checks.
5. Introduce linked transfers with source and target values.
6. Add an explicit `Uncategorized` analytical group.
7. Push filters and aggregations to parameterized database queries.
8. Implement net cash flow, savings rate, monthly trend, and budget utilization only after defining precise rules.
9. Add import staging, validation, deduplication, preview, and rollback.
10. Track data-quality metrics before relying on AI interpretation.

/**
 * Finance section extracted from T6X analytics/page.tsx
 * For reference when building FlowLedger analytics.
 *
 * Required state / data:
 *   transactions: Transaction[]
 *   categories: ExpenseCategory[]
 *   drilldownCat: { id: string; name: string; icon: string } | null
 *   financeView: "expenses" | "income"
 *   period: Period  (for the query — gte date filter)
 *
 * Required computed values:
 *   const allExpenses = transactions.filter((t) => t.amount < 0);
 *   const allIncome   = transactions.filter((t) => t.amount > 0);
 *   const activeTxs   = financeView === "expenses" ? allExpenses : allIncome;
 *   const catBreakdown = Object.values(
 *     activeTxs.reduce((acc, t) => {
 *       const key = t.category_id ?? "none";
 *       if (!acc[key]) {
 *         const cat = categories.find((c) => c.id === t.category_id);
 *         acc[key] = { id: key, name: cat?.name ?? "Без категорії", icon: cat?.icon ?? "💡", total: 0, items: [] };
 *       }
 *       acc[key].total += Math.abs(t.amount_eur ?? t.amount);
 *       acc[key].items.push(t);
 *       return acc;
 *     }, {} as Record<string, { id: string; name: string; icon: string; total: number; items: Transaction[] }>)
 *   ).sort((a, b) => b.total - a.total);
 *   const pieData      = catBreakdown.map((c) => ({ name: c.name, value: Math.round(c.total) }));
 *   const totalExpenses = allExpenses.reduce((s, t) => s + Math.abs(t.amount_eur ?? t.amount), 0);
 *   const totalIncome   = allIncome.reduce((s, t) => s + (t.amount_eur ?? t.amount), 0);
 *   const activeTotal   = financeView === "expenses" ? totalExpenses : totalIncome;
 *
 * DB queries to add to load():
 *   supabase.from("transactions").select("*, account:finance_accounts(*)").eq("user_id", user.id).gte("date", fromDate).order("date", { ascending: false }),
 *   supabase.from("expense_categories").select("*").eq("user_id", user.id),
 *   // + realtime subscription for finance changes (see T6X analytics page)
 */

const PIE_COLORS = ["#00FF85", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#f97316", "#6b7280"];

// Finance tab JSX (goes inside {tab === "finance" && ( ... )})
export const FinanceAnalyticsSection = () => (
  <div className="px-4 space-y-4">
    {/* Income / Expense toggle */}
    <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#1a1a1a] rounded-2xl">
      <button
        onClick={() => setFinanceView("expenses")}
        className={cn("py-2.5 rounded-xl text-sm font-semibold transition-all",
          financeView === "expenses" ? "bg-[#ef4444] text-white" : "text-[#6b7280]")}
      >
        💸 Витрати €{totalExpenses.toFixed(0)}
      </button>
      <button
        onClick={() => setFinanceView("income")}
        className={cn("py-2.5 rounded-xl text-sm font-semibold transition-all",
          financeView === "income" ? "bg-[#00FF85] text-black" : "text-[#6b7280]")}
      >
        💰 Дохід €{totalIncome.toFixed(0)}
      </button>
    </div>

    {catBreakdown.length === 0 ? (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">💸</p>
        <p className="text-[#6b7280] text-sm">Немає даних за цей період</p>
      </div>
    ) : (
      <>
        <div className="bg-[#111111] rounded-2xl p-4 flex flex-col items-center">
          <p className="text-white font-semibold text-sm mb-3 self-start">
            {financeView === "expenses" ? "Витрати" : "Дохід"} по категоріях
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: "12px", color: "white", fontSize: 12 }}
                formatter={(value) => [`€${value}`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#111111] rounded-2xl overflow-hidden divide-y divide-white/5">
          {catBreakdown.map((cat, i) => {
            const pct = activeTotal > 0 ? Math.round((cat.total / activeTotal) * 100) : 0;
            return (
              <button
                key={cat.id}
                onClick={() => setDrilldownCat({ id: cat.id, name: cat.name, icon: cat.icon })}
                className="w-full flex items-center gap-3 px-4 py-3 active:bg-white/5 transition-colors"
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-lg shrink-0">{cat.icon}</span>
                <p className="text-white text-sm flex-1 text-left">{cat.name}</p>
                <p className="text-[#6b7280] text-xs">{pct}%</p>
                <p className={cn("font-semibold text-sm shrink-0", financeView === "expenses" ? "text-[#ef4444]" : "text-[#00FF85]")}>€{Math.round(cat.total)}</p>
              </button>
            );
          })}
        </div>
      </>
    )}
  </div>
);

// Category Drill-Down BottomSheet
export const DrilldownSheet = () => (
  <BottomSheet open={!!drilldownCat} onClose={() => setDrilldownCat(null)} title={drilldownCat?.name ?? ""}>
    {drilldownCat && (() => {
      const entry = catBreakdown.find((c) => c.id === drilldownCat.id) ?? { items: [], total: 0 };
      const drillTxs = entry.items;
      const drillTotal = entry.total;
      const color = financeView === "expenses" ? "#ef4444" : "#00FF85";
      return (
        <div className="space-y-3 pb-6">
          <div className="text-center py-2">
            <span className="text-5xl">{drilldownCat.icon}</span>
            <p className="font-black text-3xl mt-3" style={{ color }}>€{Math.round(drillTotal)}</p>
            <p className="text-[#6b7280] text-xs mt-1">{drillTxs.length} транзакцій</p>
          </div>
          <div className="space-y-2">
            {drillTxs.map((tx) => {
              const sub = tx.subcategory_id ? categories.find((c) => c.id === tx.subcategory_id) : null;
              const label = sub ? `${drilldownCat.name} / ${sub.name}` : drilldownCat.name;
              const pct = drillTotal > 0 ? Math.round((Math.abs(tx.amount_eur ?? tx.amount) / drillTotal) * 100) : 0;
              return (
                <div key={tx.id} className="bg-[#1a1a1a] rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-white text-sm">{label}</p>
                    <p className="font-semibold text-sm" style={{ color }}>{Math.abs(tx.amount).toFixed(0)} {tx.currency ?? "EUR"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <p className="text-[#6b7280] text-xs w-8 text-right">{pct}%</p>
                  </div>
                  <p className="text-[#6b7280] text-xs mt-1">
                    {new Date(tx.date).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })} · {tx.account?.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}
  </BottomSheet>
);

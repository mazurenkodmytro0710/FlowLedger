"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FLTransaction, FLCategory, FinanceAccount } from "@/lib/types";
import { getEurRates, toEur, formatMoney } from "@/lib/currency";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type Period = "7d" | "30d" | "3mo" | "6mo" | "all";
type SubTab = "overview" | "categories" | "accounts";

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "3mo", label: "3mo" },
  { id: "6mo", label: "6mo" },
  { id: "all", label: "All" },
];

const CHART_COLORS = ["#00FF85","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f97316"];

function getPeriodStart(period: Period): string | null {
  const now = new Date();
  if (period === "7d") return format(subDays(now, 7), "yyyy-MM-dd");
  if (period === "30d") return format(subDays(now, 30), "yyyy-MM-dd");
  if (period === "3mo") return format(subDays(now, 90), "yyyy-MM-dd");
  if (period === "6mo") return format(subDays(now, 180), "yyyy-MM-dd");
  return null;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [transactions, setTransactions] = useState<FLTransaction[]>([]);
  const [categories, setCategories] = useState<FLCategory[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({ EUR: 1 });
  const [catType, setCatType] = useState<"expense" | "income">("expense");
  const [drilldownCat, setDrilldownCat] = useState<FLCategory | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, [period]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const start = getPeriodStart(period);
    let txQuery = supabase.from("fl_transactions").select("*").eq("user_id", user.id).order("date", { ascending: false });
    if (start) txQuery = txQuery.gte("date", start);

    const [{ data: txs }, { data: cats }, { data: accs }, fetchedRates] = await Promise.all([
      txQuery,
      supabase.from("fl_categories").select("*").eq("user_id", user.id),
      supabase.from("finance_accounts").select("*").eq("user_id", user.id),
      getEurRates(),
    ]);

    setTransactions(txs ?? []);
    setCategories(cats ?? []);
    setAccounts(accs ?? []);
    setRates(fetchedRates);
  }

  const toE = (t: FLTransaction) => Math.abs(t.amount_eur ?? toEur(t.amount, t.currency, rates));

  const expenses = transactions.filter((t) => t.amount < 0);
  const incomes = transactions.filter((t) => t.amount > 0);
  const totalSpent = expenses.reduce((s, t) => s + toE(t), 0);
  const totalIncome = incomes.reduce((s, t) => s + toE(t), 0);
  const net = totalIncome - totalSpent;

  // Category breakdown
  const txForType = catType === "expense" ? expenses : incomes;
  const catTotal = txForType.reduce((s, t) => s + toE(t), 0);
  const catBreakdown = categories
    .filter((c) => c.type === catType && !c.parent_id)
    .map((c) => {
      const total = txForType.filter((t) => t.category_id === c.id).reduce((s, t) => s + toE(t), 0);
      return { cat: c, total, pct: catTotal > 0 ? (total / catTotal) * 100 : 0 };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const drilldownTx = drilldownCat
    ? transactions.filter((t) => t.category_id === drilldownCat.id || t.subcategory_id === drilldownCat.id)
    : [];

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe pb-24">
      <header className="px-4 pt-4 pb-3">
        <h1 className="text-2xl font-black text-white">📊 Analytics</h1>
      </header>

      {/* Period selector */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={cn("shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              period === p.id ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]")}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide">
        {(["overview", "categories", "accounts"] as const).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={cn("shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all capitalize",
              subTab === t ? "bg-[#111111] text-white border border-white/20" : "text-[#6b7280]")}>
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-4">
        {/* OVERVIEW */}
        {subTab === "overview" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#111111] rounded-2xl p-4">
                <p className="text-[#6b7280] text-xs mb-1">Spent</p>
                <p className="text-[#ef4444] font-bold text-lg">€{totalSpent.toFixed(2)}</p>
              </div>
              <div className="bg-[#111111] rounded-2xl p-4">
                <p className="text-[#6b7280] text-xs mb-1">Income</p>
                <p className="text-[#00FF85] font-bold text-lg">€{totalIncome.toFixed(2)}</p>
              </div>
              <div className="bg-[#111111] rounded-2xl p-4">
                <p className="text-[#6b7280] text-xs mb-1">Net</p>
                <p className={cn("font-bold text-lg", net >= 0 ? "text-[#00FF85]" : "text-[#ef4444]")}>
                  {net >= 0 ? "+" : ""}€{net.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="bg-[#111111] rounded-2xl p-4">
              <p className="text-[#6b7280] text-xs mb-3">{transactions.length} transactions</p>
              {transactions.length === 0 ? (
                <p className="text-[#6b7280] text-sm text-center py-4">No data for this period</p>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, 10).map((tx) => {
                    const cat = categories.find((c) => c.id === tx.category_id);
                    const sub = categories.find((c) => c.id === tx.subcategory_id);
                    return (
                      <div key={tx.id} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-xl">{cat?.icon ?? "💸"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">
                            {sub ? `${cat?.name} / ${sub.name}` : cat?.name ?? "No category"}
                          </p>
                          <p className="text-[#6b7280] text-xs">{format(new Date(tx.date + "T00:00:00"), "MMM d")}</p>
                        </div>
                        <p className={cn("text-sm font-bold shrink-0", tx.amount < 0 ? "text-white" : "text-[#00FF85]")}>
                          {tx.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* CATEGORIES */}
        {subTab === "categories" && (
          <>
            <div className="flex bg-[#1a1a1a] rounded-xl p-1">
              {(["expense", "income"] as const).map((t) => (
                <button key={t} onClick={() => setCatType(t)}
                  className={cn("flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all",
                    catType === t ? (t === "expense" ? "bg-[#ef4444] text-white" : "bg-[#00FF85] text-black") : "text-[#6b7280]")}>
                  {t === "expense" ? "💸 Expenses" : "💰 Income"}
                </button>
              ))}
            </div>
            {catBreakdown.length > 0 && (
              <div className="bg-[#111111] rounded-2xl p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={catBreakdown} dataKey="total" nameKey="cat.name" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                      {catBreakdown.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => typeof v === "number" ? `€${v.toFixed(2)}` : v} contentStyle={{ background: "#111", border: "1px solid #ffffff10", borderRadius: 12, color: "#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="bg-[#111111] rounded-2xl overflow-hidden">
              {catBreakdown.length === 0 ? (
                <p className="text-[#6b7280] text-sm text-center py-8">No data</p>
              ) : (
                catBreakdown.map(({ cat, total, pct }, i) => (
                  <button key={cat.id} onClick={() => setDrilldownCat(cat)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: `${CHART_COLORS[i % CHART_COLORS.length]}20` }}>
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-white text-sm font-medium">{cat.name}</p>
                      <div className="mt-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white text-sm font-bold">€{total.toFixed(2)}</p>
                      <p className="text-[#6b7280] text-xs">{pct.toFixed(0)}%</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* ACCOUNTS */}
        {subTab === "accounts" && (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-[#111111] rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{acc.icon}</span>
                  <div>
                    <p className="text-white font-semibold">{acc.name}</p>
                    <p className="text-[#6b7280] text-xs">{acc.currency}{acc.is_savings ? " · savings" : ""}</p>
                  </div>
                </div>
                <p className="text-white font-bold text-2xl">{formatMoney(acc.current_balance, acc.currency)}</p>
                <p className="text-[#6b7280] text-sm">≈ €{toEur(acc.current_balance, acc.currency, rates).toFixed(2)}</p>
              </div>
            ))}
            {accounts.length === 0 && <p className="text-[#6b7280] text-sm text-center py-8">No accounts yet</p>}
          </div>
        )}
      </div>

      {/* Drilldown sheet */}
      <BottomSheet open={!!drilldownCat} onClose={() => setDrilldownCat(null)} title={drilldownCat?.name ?? ""}>
        <div className="pb-6 space-y-2">
          {drilldownTx.length === 0 ? (
            <p className="text-[#6b7280] text-sm text-center py-4">No transactions</p>
          ) : (
            drilldownTx.map((tx) => {
              const sub = categories.find((c) => c.id === tx.subcategory_id);
              return (
                <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{sub ? `${drilldownCat?.name} / ${sub.name}` : drilldownCat?.name}</p>
                    <p className="text-[#6b7280] text-xs">{format(new Date(tx.date + "T00:00:00"), "MMM d, yyyy")}</p>
                  </div>
                  <p className={cn("text-sm font-bold shrink-0", tx.amount < 0 ? "text-white" : "text-[#00FF85]")}>
                    {tx.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

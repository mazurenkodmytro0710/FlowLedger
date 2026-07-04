"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FLCategory, FLTransaction } from "@/lib/types";
import { getRates, toEurFromRates } from "@/lib/monobank";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

type Period = "week" | "month" | "3mo" | "all";
type DataSource = "all" | "manual";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "3mo", label: "3 months" },
  { id: "all", label: "All time" },
];

function getPeriodStart(period: Period): string | null {
  const now = new Date();
  if (period === "week") return format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  if (period === "month") return format(startOfMonth(now), "yyyy-MM-dd");
  if (period === "3mo") return format(subDays(now, 90), "yyyy-MM-dd");
  return null;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [dataSource, setDataSource] = useState<DataSource>("all");
  const [transactions, setTransactions] = useState<FLTransaction[]>([]);
  const [categories, setCategories] = useState<FLCategory[]>([]);
  const [rates, setRates] = useState({ uahToEur: 0.024, usdToEur: 0.92 });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, [period, dataSource]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const periodStart = getPeriodStart(period);

    let expenseQuery = supabase
      .from("fl_transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_transfer", false)
      .lt("amount", 0);

    let incomeQuery = supabase
      .from("fl_transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_transfer", false)
      .gt("amount", 0);

    if (periodStart) {
      expenseQuery = expenseQuery.gte("date", periodStart);
      incomeQuery = incomeQuery.gte("date", periodStart);
    }
    if (dataSource === "manual") {
      expenseQuery = expenseQuery.or("source.eq.manual,source.is.null");
      incomeQuery = incomeQuery.or("source.eq.manual,source.is.null");
    }

    const [{ data: expenses }, { data: income }, { data: cats }, fetchedRates] = await Promise.all([
      expenseQuery,
      incomeQuery,
      supabase.from("fl_categories").select("*").eq("user_id", user.id),
      getRates(),
    ]);

    setTransactions([...(expenses ?? []), ...(income ?? [])]);
    setCategories(cats ?? []);
    setRates(fetchedRates);
  }

  const expenses = transactions.filter(t => t.amount < 0);
  const income = transactions.filter(t => t.amount > 0);

  function toEur(t: FLTransaction): number {
    return Math.abs(t.amount_eur ?? toEurFromRates(t.amount, t.currency, rates));
  }

  const totalSpent = expenses.reduce((s, t) => s + toEur(t), 0);
  const totalIncome = income.reduce((s, t) => s + toEur(t), 0);

  // Category breakdown (root categories only)
  const rootCats = categories.filter(c => !c.parent_id);
  const catBreakdown = rootCats
    .map(cat => {
      const total = expenses
        .filter(t => t.category_id === cat.id)
        .reduce((s, t) => s + toEur(t), 0);
      return { cat, total };
    })
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxTotal = catBreakdown[0]?.total ?? 1;

  // Subcategory breakdown (manual only)
  const subBreakdown = dataSource === "manual"
    ? categories
        .filter(c => c.parent_id)
        .map(sub => {
          const parentCat = categories.find(c => c.id === sub.parent_id);
          const total = expenses
            .filter(t => t.subcategory_id === sub.id)
            .reduce((s, t) => s + toEur(t), 0);
          return { sub, parentCat, total };
        })
        .filter(x => x.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
    : [];

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe pb-24">
      <header className="px-4 pt-4 pb-3">
        <h1 className="text-2xl font-black text-white">Analytics</h1>
      </header>

      {/* Period filter */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={cn(
              "shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              period === p.id ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Data source toggle */}
      <div className="mx-4 mb-4">
        <div className="flex bg-[#1a1a1a] rounded-xl p-1">
          <button
            onClick={() => setDataSource("all")}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
              dataSource === "all" ? "bg-[#00FF85] text-black" : "text-[#6b7280]"
            )}
          >
            All data
          </button>
          <button
            onClick={() => setDataSource("manual")}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
              dataSource === "manual" ? "bg-[#00FF85] text-black" : "text-[#6b7280]"
            )}
          >
            Manual only
          </button>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#111111] rounded-2xl p-4">
            <p className="text-[#6b7280] text-xs mb-1">Spent</p>
            <p className="text-[#ef4444] font-bold text-xl">€{totalSpent.toFixed(2)}</p>
          </div>
          <div className="bg-[#111111] rounded-2xl p-4">
            <p className="text-[#6b7280] text-xs mb-1">Income</p>
            <p className="text-[#00FF85] font-bold text-xl">€{totalIncome.toFixed(2)}</p>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-[#111111] rounded-2xl overflow-hidden">
          <p className="px-4 py-3 text-[#6b7280] text-xs font-semibold uppercase tracking-wider border-b border-white/5">
            Expenses by category
          </p>
          {catBreakdown.length === 0 ? (
            <p className="text-[#6b7280] text-sm text-center py-8">No expense data</p>
          ) : (
            catBreakdown.map(({ cat, total }) => (
              <div key={cat.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                <span className="text-xl w-8 shrink-0">{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <span className="text-white text-sm truncate">{cat.name}</span>
                    <span className="text-white text-sm font-semibold ml-2 shrink-0">€{total.toFixed(0)}</span>
                  </div>
                  <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00FF85] rounded-full transition-all"
                      style={{ width: `${(total / maxTotal) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Subcategory breakdown — manual only */}
        {dataSource === "manual" && subBreakdown.length > 0 && (
          <div className="bg-[#111111] rounded-2xl overflow-hidden">
            <p className="px-4 py-3 text-[#6b7280] text-xs font-semibold uppercase tracking-wider border-b border-white/5">
              Top subcategories
            </p>
            {subBreakdown.map(({ sub, parentCat, total }) => (
              <div key={sub.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                <span className="text-xl w-8 shrink-0">{parentCat?.icon ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">
                    {parentCat?.name} / {sub.name}
                  </p>
                </div>
                <p className="text-white text-sm font-semibold shrink-0">€{total.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

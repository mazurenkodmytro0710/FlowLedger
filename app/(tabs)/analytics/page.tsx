"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { DonutChart, type DonutItem, CHART_COLORS } from "@/components/DonutChart";
import { createClient } from "@/lib/supabase/client";
import { getRates, toEurFromRates } from "@/lib/monobank";
import type { FLCategory, FLTransaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type Granularity = "day" | "week" | "month" | "year";

function getPeriodLabel(granularity: Granularity, offset: number): string {
  const now = new Date();

  if (granularity === "day") {
    return format(addDays(now, offset), "d MMM yyyy");
  }

  if (granularity === "week") {
    const start = startOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
    const end = endOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
    return `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  }

  if (granularity === "month") {
    return format(addMonths(now, offset), "MMMM yyyy");
  }

  return format(addYears(now, offset), "yyyy");
}

function getDateRange(granularity: Granularity, offset: number): { from: string; to: string } {
  const now = new Date();

  if (granularity === "day") {
    const day = format(addDays(now, offset), "yyyy-MM-dd");
    return { from: day, to: day };
  }

  if (granularity === "week") {
    const start = startOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
    const end = endOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
    return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
  }

  if (granularity === "month") {
    const month = addMonths(now, offset);
    return {
      from: format(startOfMonth(month), "yyyy-MM-dd"),
      to: format(endOfMonth(month), "yyyy-MM-dd"),
    };
  }

  const year = addYears(now, offset);
  return {
    from: format(startOfYear(year), "yyyy-MM-dd"),
    to: format(endOfYear(year), "yyyy-MM-dd"),
  };
}

export default function AnalyticsPage() {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<FLCategory | null>(null);
  const [transactions, setTransactions] = useState<FLTransaction[]>([]);
  const [allCategories, setAllCategories] = useState<FLCategory[]>([]);
  const [rates, setRates] = useState({ uahToEur: 0.024, usdToEur: 0.92 });
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    load();
  }, [granularity, periodOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const { from, to } = getDateRange(granularity, periodOffset);

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const [{ data: txs }, { data: cats }, fetchedRates] = await Promise.all([
      supabase
        .from("fl_transactions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", from)
        .lte("date", to)
        .eq("is_transfer", false)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("fl_categories").select("*").eq("user_id", user.id),
      getRates(),
    ]);

    setTransactions(txs ?? []);
    setAllCategories(cats ?? []);
    setRates(fetchedRates);
    setLoading(false);
  }

  function toEur(transaction: FLTransaction): number {
    return Math.abs(transaction.amount_eur ?? toEurFromRates(transaction.amount, transaction.currency, rates));
  }

  const expenses = useMemo(() => transactions.filter((transaction) => transaction.amount < 0), [transactions]);
  const income = useMemo(() => transactions.filter((transaction) => transaction.amount > 0), [transactions]);

  const totalSpent = useMemo(() => expenses.reduce((sum, transaction) => sum + toEur(transaction), 0), [expenses, rates]);
  const totalIncome = useMemo(() => income.reduce((sum, transaction) => sum + toEur(transaction), 0), [income, rates]);

  const categoryBreakdown = useMemo<DonutItem[]>(() => {
    const grouped = Object.values(
      expenses.reduce<Record<string, DonutItem>>((acc, transaction) => {
        if (!transaction.category_id) {
          return acc;
        }

        const category = allCategories.find((item) => item.id === transaction.category_id);
        if (!category) {
          return acc;
        }

        if (!acc[category.id]) {
          acc[category.id] = {
            id: category.id,
            name: category.name,
            icon: category.icon,
            total: 0,
            percent: 0,
          };
        }

        acc[category.id].total += toEur(transaction);
        return acc;
      }, {})
    ).sort((a, b) => b.total - a.total);

    const grandTotal = grouped.reduce((sum, category) => sum + category.total, 0);
    return grouped.map((category) => ({
      ...category,
      percent: grandTotal > 0 ? (category.total / grandTotal) * 100 : 0,
    }));
  }, [allCategories, expenses, rates]);

  const subcategoryBreakdown = useMemo<DonutItem[]>(() => {
    if (!selectedCategory) {
      return [];
    }

    const grouped = Object.values(
      expenses
        .filter((transaction) => transaction.category_id === selectedCategory.id)
        .reduce<Record<string, DonutItem>>((acc, transaction) => {
          const subcategory = allCategories.find((category) => category.id === transaction.subcategory_id);
          const key = subcategory?.id ?? "other";
          const name = subcategory?.name ?? "Other";

          if (!acc[key]) {
            acc[key] = {
              id: key,
              name,
              icon: subcategory?.icon ?? "📦",
              total: 0,
              percent: 0,
            };
          }

          acc[key].total += toEur(transaction);
          return acc;
        }, {})
    ).sort((a, b) => b.total - a.total);

    const grandTotal = grouped.reduce((sum, category) => sum + category.total, 0);
    return grouped.map((category) => ({
      ...category,
      percent: grandTotal > 0 ? (category.total / grandTotal) * 100 : 0,
    }));
  }, [allCategories, expenses, rates, selectedCategory]);

  useEffect(() => {
    if (selectedCategory && !categoryBreakdown.some((item) => item.id === selectedCategory.id)) {
      setSelectedCategory(null);
    }
  }, [categoryBreakdown, selectedCategory]);

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) {
      return;
    }

    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;

    if (delta <= -50) {
      setPeriodOffset((current) => current - 1);
    } else if (delta >= 50) {
      setPeriodOffset((current) => Math.min(0, current + 1));
    }
  }

  const visibleBreakdown = selectedCategory ? subcategoryBreakdown : categoryBreakdown;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-xl font-black text-[#00FF85]">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] pb-32"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="px-4 pt-safe pt-4 pb-2">
        <h1 className="text-2xl font-black text-white">Analytics</h1>
      </div>

      <div className="mx-4 mb-4 flex gap-1 rounded-xl bg-[#1a1a1a] p-1">
        {(["day", "week", "month", "year"] as const).map((item) => (
          <button
            key={item}
            onClick={() => {
              setGranularity(item);
              setPeriodOffset(0);
              setSelectedCategory(null);
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition-all",
              granularity === item ? "bg-[#00FF85] text-black" : "text-[#6b7280]"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between px-4">
        <button
          onClick={() => setPeriodOffset((current) => current - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1a1a1a]"
        >
          <ChevronLeft size={18} className="text-white" />
        </button>

        <p className="text-sm font-semibold text-white">{getPeriodLabel(granularity, periodOffset)}</p>

        <button
          onClick={() => setPeriodOffset((current) => Math.min(0, current + 1))}
          disabled={periodOffset === 0}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1a1a1a] disabled:opacity-30"
        >
          <ChevronRight size={18} className="text-white" />
        </button>
      </div>

      <div className="mx-4 mb-4 flex gap-3">
        <div className="flex-1 rounded-2xl bg-[#111] px-4 py-3">
          <p className="mb-1 text-xs text-[#6b7280]">Spent</p>
          <p className="text-lg font-black text-white">EUR {totalSpent.toFixed(0)}</p>
        </div>
        <div className="flex-1 rounded-2xl bg-[#111] px-4 py-3">
          <p className="mb-1 text-xs text-[#6b7280]">Income</p>
          <p className="text-lg font-black text-[#00FF85]">EUR {totalIncome.toFixed(0)}</p>
        </div>
      </div>

      {selectedCategory && (
        <button
          onClick={() => setSelectedCategory(null)}
          className="mx-4 mb-3 flex items-center gap-2 text-sm text-[#6b7280]"
        >
          <ChevronLeft size={16} /> Back to categories
        </button>
      )}

      {visibleBreakdown.length === 0 ? (
        <div className="px-4 pt-10 text-center">
          <p className="mb-2 text-4xl">📊</p>
          <p className="text-sm text-[#6b7280]">No expense data for this period</p>
        </div>
      ) : (
        <>
          <DonutChart data={visibleBreakdown} />

          <div className="mx-4 mt-4 space-y-1">
            {visibleBreakdown.map((item, index) => (
              <button
                key={item.id ?? `${item.name}-${index}`}
                onClick={() => {
                  if (selectedCategory || !item.id) {
                    return;
                  }

                  const category = allCategories.find((entry) => entry.id === item.id);
                  if (category) {
                    setSelectedCategory(category);
                  }
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-[#111] px-4 py-3 text-left"
              >
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="text-lg">{item.icon ?? "📦"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{item.name}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#1a1a1a]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-white">EUR {item.total.toFixed(0)}</p>
                  <p className="text-xs text-[#6b7280]">{item.percent.toFixed(0)}%</p>
                </div>
                {!selectedCategory && <ChevronRight size={14} className="shrink-0 text-[#6b7280]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

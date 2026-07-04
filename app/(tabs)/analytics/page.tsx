"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowUpRight, ChevronLeft, ChevronRight, GripHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { DonutChart, type DonutItem, CHART_COLORS } from "@/components/DonutChart";
import { createClient } from "@/lib/supabase/client";
import { getRates, toEurFromRates } from "@/lib/monobank";
import type { FLCategory, FLTransaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type Granularity = "day" | "week" | "month" | "year";
type MotionDirection = "forward" | "backward" | "reset";

interface TrendPoint {
  offset: number;
  label: string;
  spent: number;
  income: number;
  txCount: number;
  selected: boolean;
}

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

function getPeriodBadge(granularity: Granularity, offset: number): string {
  if (offset === 0) {
    if (granularity === "day") return "Today";
    if (granularity === "week") return "This week";
    if (granularity === "month") return "This month";
    return "This year";
  }

  const abs = Math.abs(offset);
  const unit = granularity === "day" ? "day" : granularity;
  return `${abs} ${unit}${abs === 1 ? "" : "s"} ago`;
}

function getShortPeriodLabel(granularity: Granularity, offset: number): string {
  const now = new Date();

  if (granularity === "day") {
    return format(addDays(now, offset), "d MMM");
  }

  if (granularity === "week") {
    return format(startOfWeek(addWeeks(now, offset), { weekStartsOn: 1 }), "d MMM");
  }

  if (granularity === "month") {
    return format(addMonths(now, offset), "MMM");
  }

  return format(addYears(now, offset), "yy");
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

function getTimelineOffsets(offset: number): number[] {
  if (offset >= -2) {
    return [-5, -4, -3, -2, -1, 0];
  }

  return Array.from({ length: 6 }, (_, index) => offset - 5 + index);
}

function filterTransactionsByRange(transactions: FLTransaction[], range: { from: string; to: string }) {
  return transactions.filter((transaction) => transaction.date >= range.from && transaction.date <= range.to);
}

function buildTrendPath(points: TrendPoint[]) {
  const width = 320;
  const height = 92;
  const paddingX = 18;
  const paddingTop = 12;
  const paddingBottom = 18;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(...points.map((point) => point.spent), 1);

  return points.map((point, index) => {
    const x = paddingX + (innerWidth / Math.max(points.length - 1, 1)) * index;
    const y = paddingTop + innerHeight - (point.spent / maxValue) * innerHeight;
    return { ...point, x, y };
  });
}

function PeriodTrend({
  points,
  onSelect,
}: {
  points: TrendPoint[];
  onSelect: (offset: number) => void;
}) {
  const projectedPoints = useMemo(() => buildTrendPath(points), [points]);
  const path = projectedPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath =
    projectedPoints.length > 0
      ? `${path} L ${projectedPoints[projectedPoints.length - 1]?.x} 74 L ${projectedPoints[0]?.x} 74 Z`
      : "";

  return (
    <div className="rounded-[28px] bg-[radial-gradient(circle_at_top,#14372a_0%,#0f0f0f_48%,#0a0a0a_100%)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#6b7280]">Period Flow</p>
          <p className="mt-1 text-sm text-white">Swipe card or tap a point</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-[#9ca3af]">
          spent trend
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
        <svg viewBox="0 0 320 92" className="h-[110px] w-full">
          <defs>
            <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00FF85" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00FF85" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M 18 74 L 302 74" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          {areaPath ? <path d={areaPath} fill="url(#trend-area)" /> : null}
          {path ? <path d={path} fill="none" stroke="#00FF85" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {projectedPoints.map((point) => (
            <g key={point.offset}>
              <circle
                cx={point.x}
                cy={point.y}
                r={point.selected ? 6.5 : 4.5}
                fill={point.selected ? "#00FF85" : "#0a0a0a"}
                stroke={point.selected ? "#d1fae5" : "rgba(255,255,255,0.35)"}
                strokeWidth={point.selected ? 2 : 1.5}
              />
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {points.map((point) => (
          <button
            key={point.offset}
            onClick={() => onSelect(point.offset)}
            className={cn(
              "rounded-2xl px-2 py-2 text-left transition-all",
              point.selected ? "bg-[#00FF85] text-black" : "bg-[#141414] text-[#9ca3af]"
            )}
          >
            <p className="text-[11px] font-semibold">{point.label}</p>
            <p className={cn("mt-1 text-[10px]", point.selected ? "text-black/70" : "text-[#6b7280]")}>
              {point.txCount} tx
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<FLCategory | null>(null);
  const [motionDirection, setMotionDirection] = useState<MotionDirection>("reset");
  const [transactions, setTransactions] = useState<FLTransaction[]>([]);
  const [allCategories, setAllCategories] = useState<FLCategory[]>([]);
  const [rates, setRates] = useState({ uahToEur: 0.024, usdToEur: 0.92 });
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const timelineOffsets = useMemo(() => getTimelineOffsets(periodOffset), [periodOffset]);
  const fetchOffsetRange = useMemo(() => {
    const offsets = [...timelineOffsets, periodOffset];
    return {
      min: Math.min(...offsets),
      max: Math.max(...offsets),
    };
  }, [periodOffset, timelineOffsets]);

  useEffect(() => {
    load();
  }, [granularity, fetchOffsetRange.min, fetchOffsetRange.max]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const fetchFrom = getDateRange(granularity, fetchOffsetRange.min).from;
    const fetchTo = getDateRange(granularity, fetchOffsetRange.max).to;

    const [{ data: txs }, { data: cats }, fetchedRates] = await Promise.all([
      supabase
        .from("fl_transactions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", fetchFrom)
        .lte("date", fetchTo)
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

  const currentRange = useMemo(() => getDateRange(granularity, periodOffset), [granularity, periodOffset]);
  const currentTransactions = useMemo(() => filterTransactionsByRange(transactions, currentRange), [currentRange, transactions]);
  const expenses = useMemo(() => currentTransactions.filter((transaction) => transaction.amount < 0), [currentTransactions]);
  const income = useMemo(() => currentTransactions.filter((transaction) => transaction.amount > 0), [currentTransactions]);
  const totalSpent = useMemo(() => expenses.reduce((sum, transaction) => sum + toEur(transaction), 0), [expenses, rates]);
  const totalIncome = useMemo(() => income.reduce((sum, transaction) => sum + toEur(transaction), 0), [income, rates]);
  const netFlow = totalIncome - totalSpent;

  const previousRange = useMemo(() => getDateRange(granularity, periodOffset - 1), [granularity, periodOffset]);
  const previousExpenses = useMemo(
    () => filterTransactionsByRange(transactions, previousRange).filter((transaction) => transaction.amount < 0),
    [previousRange, transactions]
  );
  const previousSpent = useMemo(
    () => previousExpenses.reduce((sum, transaction) => sum + toEur(transaction), 0),
    [previousExpenses, rates]
  );
  const spentDelta = previousSpent > 0 ? ((totalSpent - previousSpent) / previousSpent) * 100 : null;

  const trendPoints = useMemo<TrendPoint[]>(() => {
    return timelineOffsets.map((offset) => {
      const range = getDateRange(granularity, offset);
      const periodTransactions = filterTransactionsByRange(transactions, range);
      const periodExpenses = periodTransactions.filter((transaction) => transaction.amount < 0);
      const periodIncome = periodTransactions.filter((transaction) => transaction.amount > 0);

      return {
        offset,
        label: getShortPeriodLabel(granularity, offset),
        spent: periodExpenses.reduce((sum, transaction) => sum + toEur(transaction), 0),
        income: periodIncome.reduce((sum, transaction) => sum + toEur(transaction), 0),
        txCount: periodTransactions.length,
        selected: offset === periodOffset,
      };
    });
  }, [granularity, periodOffset, timelineOffsets, transactions, rates]);

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

  function applyPeriodChange(nextOffset: number, direction: MotionDirection) {
    setMotionDirection(direction);
    startTransition(() => {
      setPeriodOffset(nextOffset);
      setSelectedCategory(null);
    });
  }

  function goToPreviousPeriod() {
    applyPeriodChange(periodOffset - 1, "forward");
  }

  function goToNextPeriod() {
    applyPeriodChange(Math.min(0, periodOffset + 1), "backward");
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) {
      return;
    }

    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;

    if (delta <= -40) {
      goToPreviousPeriod();
    } else if (delta >= 40) {
      goToNextPeriod();
    }
  }

  const visibleBreakdown = selectedCategory ? subcategoryBreakdown : categoryBreakdown;
  const motionClass =
    motionDirection === "forward"
      ? "analytics-motion-forward"
      : motionDirection === "backward"
        ? "analytics-motion-backward"
        : "analytics-motion-reset";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-xl font-black text-[#00FF85]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-32">
      <div className="px-4 pt-safe pt-4 pb-2">
        <h1 className="text-2xl font-black text-white">Analytics</h1>
      </div>

      <div className="mx-4 mb-4 flex gap-1 rounded-2xl border border-white/5 bg-[#141414] p-1">
        {(["day", "week", "month", "year"] as const).map((item) => (
          <button
            key={item}
            onClick={() => {
              setMotionDirection("reset");
              startTransition(() => {
                setGranularity(item);
                setPeriodOffset(0);
                setSelectedCategory(null);
              });
            }}
            className={cn(
              "flex-1 rounded-[14px] py-2.5 text-xs font-semibold capitalize transition-all",
              granularity === item ? "bg-[#00FF85] text-black shadow-[0_6px_20px_rgba(0,255,133,0.25)]" : "text-[#6b7280]"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div
        className="mx-4 mb-4 rounded-[30px] border border-white/5 bg-[linear-gradient(160deg,#111111_0%,#0d0d0d_100%)] p-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div key={`period-shell-${granularity}-${periodOffset}`} className={motionClass}>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={goToPreviousPeriod}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1a1a1a] transition-transform active:scale-95"
            >
              <ChevronLeft size={18} className="text-white" />
            </button>

            <div className="text-center">
              <div className="mb-1 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">
                {getPeriodBadge(granularity, periodOffset)}
              </div>
              <p className="text-base font-semibold text-white">{getPeriodLabel(granularity, periodOffset)}</p>
            </div>

            <button
              onClick={goToNextPeriod}
              disabled={periodOffset === 0}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1a1a1a] transition-transform active:scale-95 disabled:opacity-30"
            >
              <ChevronRight size={18} className="text-white" />
            </button>
          </div>

          <div className="rounded-[26px] bg-[linear-gradient(180deg,#101010_0%,#0b0b0b_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b7280]">Spent this period</p>
                <p className="mt-2 text-4xl font-black text-white">EUR {totalSpent.toFixed(0)}</p>
              </div>
              <div className="rounded-2xl bg-[#171717] px-3 py-2 text-right">
                <p className="text-[11px] text-[#6b7280]">vs previous</p>
                <p className={cn("mt-1 text-sm font-bold", spentDelta === null ? "text-[#9ca3af]" : spentDelta <= 0 ? "text-[#00FF85]" : "text-[#f59e0b]")}>
                  {spentDelta === null ? "new period" : `${spentDelta > 0 ? "+" : ""}${spentDelta.toFixed(0)}%`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-[#141414] px-3 py-3 transition-transform duration-300 hover:-translate-y-0.5">
                <p className="text-[11px] text-[#6b7280]">Income</p>
                <p className="mt-1 text-sm font-bold text-[#00FF85]">EUR {totalIncome.toFixed(0)}</p>
              </div>
              <div className="rounded-2xl bg-[#141414] px-3 py-3 transition-transform duration-300 hover:-translate-y-0.5">
                <p className="text-[11px] text-[#6b7280]">Net</p>
                <p className={cn("mt-1 text-sm font-bold", netFlow >= 0 ? "text-[#00FF85]" : "text-white")}>EUR {netFlow.toFixed(0)}</p>
              </div>
              <div className="rounded-2xl bg-[#141414] px-3 py-3 transition-transform duration-300 hover:-translate-y-0.5">
                <p className="text-[11px] text-[#6b7280]">Entries</p>
                <p className="mt-1 text-sm font-bold text-white">{currentTransactions.length}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#6b7280]">
              <GripHorizontal size={14} />
              <span>Swipe left or right to move through periods</span>
            </div>
          </div>
        </div>
      </div>

      <div key={`trend-${granularity}-${periodOffset}`} className={cn("mx-4 mb-4", motionClass)}>
        <PeriodTrend
          points={trendPoints}
          onSelect={(offset) => {
            const direction = offset < periodOffset ? "forward" : offset > periodOffset ? "backward" : "reset";
            applyPeriodChange(offset, direction);
          }}
        />
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
          <div key={`breakdown-${granularity}-${periodOffset}-${selectedCategory?.id ?? "root"}`} className={cn("mx-4 mb-4 rounded-[28px] border border-white/5 bg-[#101010] p-5", motionClass)}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b7280]">
                  {selectedCategory ? "Subcategories" : "Category split"}
                </p>
                <p className="mt-1 text-sm text-white">
                  {selectedCategory ? `Inside ${selectedCategory.name}` : "Where the money actually went"}
                </p>
              </div>
              <div className="rounded-full bg-[#171717] px-3 py-1 text-xs text-[#9ca3af]">
                {visibleBreakdown.length} items
              </div>
            </div>

            <DonutChart data={visibleBreakdown} />
          </div>

          <div className={cn("mx-4 space-y-2", motionClass)}>
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
                className="flex w-full items-center gap-3 rounded-[22px] border border-white/5 bg-[#111] px-4 py-3.5 text-left transition-colors active:bg-[#171717]"
              >
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="text-lg">{item.icon ?? "📦"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-white">{item.name}</p>
                    <p className="shrink-0 text-xs text-[#6b7280]">{item.percent.toFixed(0)}%</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1a1a1a]">
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
                </div>
                {!selectedCategory && <ArrowUpRight size={15} className="shrink-0 text-[#6b7280]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

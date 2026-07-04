"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FinanceAccount, FLTransaction, FLCategory } from "@/lib/types";
import { getEurRates, toEur, formatMoney } from "@/lib/currency";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

function formatDate(d: string): string {
  return format(new Date(d + "T00:00:00"), "MMM d");
}

export default function HomePage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FLTransaction[]>([]);
  const [categories, setCategories] = useState<FLCategory[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({ EUR: 1, UAH: 0.024, USD: 1.08 });
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const now = new Date();
    const [{ data: accs }, { data: txs }, { data: cats }, fetchedRates] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("fl_transactions").select("*").eq("user_id", user.id).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
      supabase.from("fl_categories").select("*").eq("user_id", user.id),
      getEurRates(),
    ]);

    setAccounts(accs ?? []);
    setTransactions(txs ?? []);
    setCategories(cats ?? []);
    setRates(fetchedRates);
    setLoading(false);

    void now;
  }

  const totalEur = accounts
    .filter((a) => a.include_in_total)
    .reduce((sum, a) => sum + toEur(a.current_balance, a.currency, rates), 0);

  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

  const thisMonthTx = transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);
  const prevMonthTx = transactions.filter((t) => t.date >= prevMonthStart && t.date <= prevMonthEnd);

  const thisSpent = thisMonthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount_eur ?? toEur(t.amount, t.currency, rates)), 0);
  const thisIncome = thisMonthTx.filter((t) => t.amount > 0).reduce((s, t) => s + (t.amount_eur ?? toEur(t.amount, t.currency, rates)), 0);
  const prevSpent = prevMonthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount_eur ?? toEur(t.amount, t.currency, rates)), 0);

  const spentPct = prevSpent > 0 ? (thisSpent / prevSpent) * 100 : 0;

  const displayTx = showMore ? transactions : transactions.slice(0, 20);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#00FF85] animate-pulse text-2xl font-black">FlowLedger</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <p className="text-white font-black text-xl">FlowLedger</p>
        <p className="text-[#6b7280] text-sm">{format(now, "MMMM yyyy")}</p>
      </header>

      {/* Total balance */}
      <div className="px-4 mb-4">
        <div className="bg-[#111111] rounded-2xl p-5 text-center">
          <p className="text-[#6b7280] text-xs mb-1">Total balance</p>
          <p className="text-white font-black text-4xl">€{totalEur.toFixed(2)}</p>
        </div>
      </div>

      {/* Account cards */}
      {accounts.length > 0 && (
        <div className="px-4 mb-4">
          <div className="grid grid-cols-2 gap-2">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-[#111111] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{acc.icon}</span>
                  <p className="text-[#6b7280] text-xs truncate">{acc.name}</p>
                </div>
                <p className="text-white font-bold text-lg">{formatMoney(acc.current_balance, acc.currency)}</p>
                <p className="text-[#6b7280] text-xs">€{toEur(acc.current_balance, acc.currency, rates).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* This month summary */}
      <div className="px-4 mb-4">
        <div className="bg-[#111111] rounded-2xl p-4">
          <p className="text-[#6b7280] text-xs mb-3">This month</p>
          <div className="flex justify-between mb-3">
            <div>
              <p className="text-[#ef4444] font-bold text-lg">−€{thisSpent.toFixed(2)}</p>
              <p className="text-[#6b7280] text-xs">Spent</p>
            </div>
            <div className="text-right">
              <p className="text-[#00FF85] font-bold text-lg">+€{thisIncome.toFixed(2)}</p>
              <p className="text-[#6b7280] text-xs">Income</p>
            </div>
          </div>
          <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div className="h-full bg-[#00FF85] rounded-full transition-all" style={{ width: `${Math.min(spentPct, 100)}%` }} />
          </div>
          {prevSpent > 0 && (
            <p className="text-[#6b7280] text-xs mt-1.5">
              {spentPct.toFixed(0)}% of last month spend
            </p>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="px-4">
        <p className="text-[#6b7280] text-xs uppercase tracking-wider mb-2">Recent</p>
        <div className="bg-[#111111] rounded-2xl overflow-hidden">
          {displayTx.length === 0 ? (
            <p className="text-[#6b7280] text-sm text-center py-8">No transactions yet</p>
          ) : (
            displayTx.map((tx) => {
              const cat = categories.find((c) => c.id === tx.category_id);
              const sub = categories.find((c) => c.id === tx.subcategory_id);
              const acc = accounts.find((a) => a.id === tx.account_id);
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                  <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-lg shrink-0">
                    {cat?.icon ?? "💸"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {sub ? `${cat?.name} / ${sub.name}` : cat?.name ?? "No category"}
                    </p>
                    <p className="text-[#6b7280] text-xs">
                      {acc?.name ?? ""} · {formatDate(tx.date)}
                    </p>
                  </div>
                  <p className={cn("text-sm font-bold shrink-0", tx.amount < 0 ? "text-white" : "text-[#00FF85]")}>
                    {tx.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                </div>
              );
            })
          )}
          {!showMore && transactions.length > 20 && (
            <button onClick={() => setShowMore(true)}
              className="w-full py-3 text-[#6b7280] text-sm flex items-center justify-center gap-1">
              <ChevronDown size={14} /> Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

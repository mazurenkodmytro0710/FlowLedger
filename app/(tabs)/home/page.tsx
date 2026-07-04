"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FinanceAccount, FLTransaction, FLCategory } from "@/lib/types";
import { getRates, toEurFromRates, formatMoney } from "@/lib/monobank";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { Plus, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/layout/BottomSheet";

export default function HomePage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FLTransaction[]>([]);
  const [allCategories, setAllCategories] = useState<FLCategory[]>([]);
  const [rates, setRates] = useState<{ uahToEur: number; usdToEur: number }>({ uahToEur: 0.024, usdToEur: 0.92 });
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [detailTx, setDetailTx] = useState<FLTransaction | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const [{ data: accs }, { data: txs }, { data: cats }, fetchedRates] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
      supabase
        .from("fl_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("fl_categories").select("*").eq("user_id", user.id),
      getRates(),
    ]);

    setAccounts(accs ?? []);
    setTransactions(txs ?? []);
    setAllCategories(cats ?? []);
    setRates(fetchedRates);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  const totalBalance = accounts
    .filter(a => a.include_in_total)
    .reduce((sum, a) => sum + toEurFromRates(a.current_balance, a.currency, rates), 0);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null;
  const displayBalance = selectedAccount
    ? toEurFromRates(selectedAccount.current_balance, selectedAccount.currency, rates)
    : totalBalance;

  const recentTx = transactions.filter(t => !selectedAccountId || t.account_id === selectedAccountId);

  function formatDateLabel(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "d MMM yyyy");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#00FF85] animate-pulse text-2xl font-black">FlowLedger</div>
      </div>
    );
  }

  const detailCat = detailTx ? allCategories.find(c => c.id === detailTx.category_id) ?? null : null;
  const detailSubcat = detailTx ? allCategories.find(c => c.id === detailTx.subcategory_id) ?? null : null;
  const detailAcc = detailTx ? accounts.find(a => a.id === detailTx.account_id) ?? null : null;

  const now = new Date();

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <p className="text-white font-black text-xl">FlowLedger</p>
        <p className="text-[#6b7280] text-sm">{format(now, "MMMM yyyy")}</p>
      </header>

      {/* Account selector */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => setSelectedAccountId(null)}
          className={cn("shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all border",
            !selectedAccountId ? "border-[#00FF85] text-[#00FF85] bg-[#00FF85]/10" : "border-white/10 text-[#6b7280] bg-[#1a1a1a]"
          )}
        >
          All accounts
        </button>
        {accounts.map(acc => (
          <button
            key={acc.id}
            onClick={() => setSelectedAccountId(acc.id)}
            className={cn("shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all border",
              selectedAccountId === acc.id ? "border-[#00FF85] text-[#00FF85] bg-[#00FF85]/10" : "border-white/10 text-[#6b7280] bg-[#1a1a1a]"
            )}
          >
            <span>{acc.icon}</span>
            <span>{acc.name}</span>
          </button>
        ))}
        <button
          onClick={() => router.push("/settings")}
          className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold border border-white/10 text-[#6b7280] bg-[#1a1a1a]"
        >
          + Add
        </button>
      </div>

      {/* Balance card */}
      <div className="mx-4 mb-4 bg-[#111111] rounded-2xl p-5 text-center">
        <p className="text-[#6b7280] text-xs mb-1">
          {selectedAccountId ? accounts.find(a => a.id === selectedAccountId)?.name : 'Total balance'}
        </p>
        <p className="text-white font-black text-4xl">€{displayBalance.toFixed(2)}</p>
        {selectedAccountId && (() => {
          const acc = accounts.find(a => a.id === selectedAccountId);
          return acc && acc.currency !== 'EUR' ? (
            <p className="text-[#6b7280] text-sm mt-1">{formatMoney(acc.current_balance, acc.currency)}</p>
          ) : null;
        })()}
      </div>

      {/* Recent transactions */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[#6b7280] text-xs uppercase tracking-wider">Recent</p>
          <button
            onClick={() => router.push("/transactions")}
            className="flex items-center gap-1 text-[#00FF85] text-xs"
          >
            See all <ChevronRight size={12} />
          </button>
        </div>
        <div className="bg-[#111111] rounded-2xl overflow-hidden">
          {recentTx.length === 0 ? (
            <p className="text-[#6b7280] text-sm text-center py-8">No transactions yet</p>
          ) : (
            recentTx.map(tx => {
              const cat = allCategories.find(c => c.id === tx.category_id) ?? null;
              const sub = allCategories.find(c => c.id === tx.subcategory_id) ?? null;
              const acc = accounts.find(a => a.id === tx.account_id) ?? null;
              return (
                <button
                  key={tx.id}
                  onClick={() => setDetailTx(tx)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-xl shrink-0">
                    {tx.is_transfer ? "↔️" : cat?.icon ?? "💸"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {tx.is_transfer ? "Transfer" : sub ? `${cat?.name} / ${sub.name}` : cat?.name ?? "No category"}
                    </p>
                    <p className="text-[#6b7280] text-xs">
                      {acc?.name ?? ""} · {formatDateLabel(tx.date)}
                    </p>
                  </div>
                  <p className={cn("text-sm font-bold shrink-0",
                    tx.is_transfer ? "text-[#6b7280]" : tx.amount < 0 ? "text-white" : "text-[#00FF85]"
                  )}>
                    {tx.is_transfer ? "↔" : tx.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => router.push("/add")}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-[#00FF85] rounded-full shadow-lg flex items-center justify-center"
      >
        <Plus size={24} className="text-black" strokeWidth={3} />
      </button>

      {/* Transaction detail sheet */}
      <BottomSheet open={!!detailTx} onClose={() => setDetailTx(null)} title="Transaction">
        {detailTx && (
          <div className="pb-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-2xl shrink-0">
                {detailTx.is_transfer ? "↔️" : detailCat?.icon ?? "💸"}
              </div>
              <div>
                <p className="text-white font-semibold">
                  {detailTx.is_transfer ? "Transfer" : detailSubcat ? `${detailCat?.name} / ${detailSubcat.name}` : detailCat?.name ?? "No category"}
                </p>
                <p className="text-[#6b7280] text-xs">{detailAcc?.name ?? ""}</p>
              </div>
            </div>
            <div className="bg-[#1a1a1a] rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-[#6b7280] text-sm">Amount</span>
                <span className={cn("text-sm font-bold", detailTx.is_transfer ? "text-[#6b7280]" : detailTx.amount < 0 ? "text-white" : "text-[#00FF85]")}>
                  {detailTx.is_transfer ? "↔" : detailTx.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(detailTx.amount), detailTx.currency)}
                </span>
              </div>
              {detailTx.amount_eur !== null && detailTx.currency !== "EUR" && (
                <div className="flex justify-between">
                  <span className="text-[#6b7280] text-sm">EUR</span>
                  <span className="text-[#6b7280] text-sm">≈ €{Math.abs(detailTx.amount_eur).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#6b7280] text-sm">Date</span>
                <span className="text-white text-sm">{format(new Date(detailTx.date + "T00:00:00"), "d MMM yyyy")}</span>
              </div>
              {detailTx.description && (
                <div className="flex justify-between">
                  <span className="text-[#6b7280] text-sm">Note</span>
                  <span className="text-white text-sm">{detailTx.description}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#6b7280] text-sm">Account</span>
                <span className="text-white text-sm">{detailAcc?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6b7280] text-sm">Type</span>
                <span className="text-white text-sm">
                  {detailTx.is_transfer ? "Transfer" : detailTx.amount < 0 ? "Expense" : "Income"}
                </span>
              </div>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

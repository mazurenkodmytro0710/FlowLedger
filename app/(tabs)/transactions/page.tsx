"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FinanceAccount, FLTransaction, FLCategory } from "@/lib/types";
import { formatMoney } from "@/lib/monobank";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, startOfWeek, startOfMonth } from "date-fns";
import { Trash2, Pencil, X, SlidersHorizontal, Plus } from "lucide-react";

type FilterType = "all" | "expense" | "income" | "transfer";
type FilterSort = "newest" | "oldest" | "largest" | "smallest";
type FilterPeriod = "all" | "month" | "week";

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<FLTransaction[]>([]);
  const [allCategories, setAllCategories] = useState<FLCategory[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState("");

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterSort, setFilterSort] = useState<FilterSort>("newest");
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");

  // Detail sheet
  const [detailTx, setDetailTx] = useState<FLTransaction | null>(null);

  // Edit sheet
  const [editTx, setEditTx] = useState<FLTransaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editSubcatId, setEditSubcatId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSubSearch, setEditSubSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async (reset = false) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserId(user.id);

    const [{ data: cats }, { data: accs }] = await Promise.all([
      supabase.from("fl_categories").select("*").eq("user_id", user.id),
      supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
    ]);
    setAllCategories(cats ?? []);
    setAccounts(accs ?? []);

    const currentPage = reset ? 1 : page;
    if (reset) setPage(1);

    let q = supabase
      .from("fl_transactions")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, currentPage * PAGE_SIZE - 1);

    const { data: txs, count } = await q;
    setTransactions(txs ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [supabase, router, page]);

  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side filtering
  function applyFilters(txs: FLTransaction[]): FLTransaction[] {
    let result = [...txs];

    // Type filter
    if (filterType === "expense") result = result.filter(t => t.amount < 0 && !t.is_transfer);
    else if (filterType === "income") result = result.filter(t => t.amount > 0 && !t.is_transfer);
    else if (filterType === "transfer") result = result.filter(t => t.is_transfer);

    // Period filter
    if (filterPeriod === "week") {
      const start = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      result = result.filter(t => t.date >= start);
    } else if (filterPeriod === "month") {
      const start = format(startOfMonth(new Date()), "yyyy-MM-dd");
      result = result.filter(t => t.date >= start);
    }

    // Sort
    if (filterSort === "newest") result.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    else if (filterSort === "oldest") result.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    else if (filterSort === "largest") result.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    else if (filterSort === "smallest") result.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));

    return result;
  }

  const filteredTransactions = applyFilters(transactions);

  function formatDateHeader(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "d MMM yyyy");
  }

  // Group by date (only when sorting by date)
  const grouped: { date: string; txs: FLTransaction[] }[] = [];
  if (filterSort === "newest" || filterSort === "oldest") {
    for (const tx of filteredTransactions) {
      const last = grouped[grouped.length - 1];
      if (last && last.date === tx.date) {
        last.txs.push(tx);
      } else {
        grouped.push({ date: tx.date, txs: [tx] });
      }
    }
  } else {
    // Put all in single flat group when sorted by amount
    if (filteredTransactions.length > 0) {
      grouped.push({ date: "", txs: filteredTransactions });
    }
  }

  async function deleteTx(tx: FLTransaction) {
    if (!confirm("Delete this transaction?")) return;
    const acc = accounts.find(a => a.id === tx.account_id);
    if (acc) {
      await supabase.from("finance_accounts").update({
        current_balance: Math.round((acc.current_balance - tx.amount) * 100) / 100,
      }).eq("id", acc.id);
    }
    await supabase.from("fl_transactions").delete().eq("id", tx.id);
    setDetailTx(null);
    showToast("Deleted");
    load(true);
  }

  function openEdit(tx: FLTransaction) {
    setEditTx(tx);
    setEditAmount(String(Math.abs(tx.amount)));
    setEditCatId(tx.category_id);
    setEditSubcatId(tx.subcategory_id);
    setEditDate(tx.date);
    setEditNote(tx.description ?? "");
    setEditSubSearch("");
    setDetailTx(null);
  }

  async function saveEdit() {
    if (!editTx) return;
    setSaving(true);
    const parsedAmount = parseFloat(editAmount.replace(",", "."));
    if (isNaN(parsedAmount)) { setSaving(false); return; }

    const sign = editTx.is_transfer ? -1 : editTx.amount < 0 ? -1 : 1;
    const newAmount = sign * parsedAmount;
    const delta = newAmount - editTx.amount;

    const acc = accounts.find(a => a.id === editTx.account_id);
    if (acc) {
      await supabase.from("finance_accounts").update({
        current_balance: Math.round((acc.current_balance + delta) * 100) / 100,
      }).eq("id", acc.id);
    }

    await supabase.from("fl_transactions").update({
      amount: newAmount,
      category_id: editCatId,
      subcategory_id: editSubcatId,
      date: editDate,
      description: editNote || null,
    }).eq("id", editTx.id);

    setSaving(false);
    setEditTx(null);
    showToast("Updated ✓");
    load(true);
  }

  const editMatchingSubs = editCatId
    ? allCategories.filter(c => c.parent_id === editCatId && c.name.toLowerCase().includes(editSubSearch.toLowerCase()))
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#00FF85] animate-pulse text-xl font-black">Loading...</div>
      </div>
    );
  }

  // Count active filters
  const activeFilterCount = [
    filterType !== "all",
    filterSort !== "newest",
    filterPeriod !== "all",
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe pb-24">
      {/* Header */}
      <header className="px-4 pt-4 pb-3 sticky top-0 bg-[#0a0a0a] z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-white">Transactions</h1>
          <button
            onClick={() => setShowFilters(true)}
            className="relative w-10 h-10 bg-[#1a1a1a] rounded-xl flex items-center justify-center"
          >
            <SlidersHorizontal size={18} className="text-white" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#00FF85] rounded-full text-black text-[9px] font-black flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Transaction list */}
      <div>
        {grouped.length === 0 ? (
          <p className="text-[#6b7280] text-sm text-center py-12">No transactions</p>
        ) : (
          grouped.map(({ date, txs }, gi) => (
            <div key={date || gi}>
              {date && (
                <p className="px-4 py-2 text-[#6b7280] text-xs font-semibold uppercase tracking-wider bg-[#0a0a0a] sticky top-[64px]">
                  {formatDateHeader(date)}
                </p>
              )}
              {txs.map(tx => {
                const cat = allCategories.find(c => c.id === tx.category_id) ?? null;
                const sub = allCategories.find(c => c.id === tx.subcategory_id) ?? null;
                const acc = accounts.find(a => a.id === tx.account_id) ?? null;
                return (
                  <button
                    key={tx.id}
                    onClick={() => setDetailTx(tx)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/5 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-xl shrink-0">
                      {tx.is_transfer ? "↔️" : cat?.icon ?? "💸"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {tx.is_transfer ? "Transfer"
                          : sub ? `${cat?.name} / ${sub.name}`
                          : cat?.name ?? "No category"}
                      </p>
                      <p className="text-[#6b7280] text-xs">
                        {acc?.name ?? ""} · {format(new Date(tx.date + "T00:00:00"), "MMM d")}
                      </p>
                    </div>
                    <p className={cn("text-sm font-bold shrink-0",
                      tx.is_transfer ? "text-[#6b7280]" :
                      tx.amount < 0 ? "text-white" : "text-[#00FF85]"
                    )}>
                      {tx.is_transfer ? "↔" : tx.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                    </p>
                  </button>
                );
              })}
            </div>
          ))
        )}

        {/* Load more */}
        {transactions.length < total && (
          <button
            onClick={() => setPage(p => p + 1)}
            className="w-full py-4 text-[#6b7280] text-sm text-center"
          >
            Load more ({total - transactions.length} remaining)
          </button>
        )}
      </div>

      {/* Filter bottom sheet */}
      <BottomSheet open={showFilters} onClose={() => setShowFilters(false)} title="Filter">
        <div className="space-y-5 pb-8">
          {/* Type */}
          <div>
            <p className="text-[#6b7280] text-xs mb-2">Type</p>
            <div className="flex gap-2 flex-wrap">
              {(["all", "expense", "income", "transfer"] as const).map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className={cn("px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all",
                    filterType === t ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]"
                  )}>
                  {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Sort */}
          <div>
            <p className="text-[#6b7280] text-xs mb-2">Sort</p>
            <div className="flex gap-2 flex-wrap">
              {(["newest", "oldest", "largest", "smallest"] as const).map(s => (
                <button key={s} onClick={() => setFilterSort(s)}
                  className={cn("px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all",
                    filterSort === s ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]"
                  )}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Period */}
          <div>
            <p className="text-[#6b7280] text-xs mb-2">Period</p>
            <div className="flex gap-2 flex-wrap">
              {(["all", "month", "week"] as const).map(p => (
                <button key={p} onClick={() => setFilterPeriod(p)}
                  className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-all",
                    filterPeriod === p ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]"
                  )}>
                  {p === "all" ? "All time" : p === "month" ? "This month" : "This week"}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => setShowFilters(false)} className="w-full h-12 bg-[#00FF85] text-black font-bold rounded-2xl">
            Apply
          </Button>
        </div>
      </BottomSheet>

      {/* Detail sheet */}
      <BottomSheet open={!!detailTx} onClose={() => setDetailTx(null)} title="Transaction">
        {detailTx && (() => {
          const cat = allCategories.find(c => c.id === detailTx.category_id) ?? null;
          const sub = allCategories.find(c => c.id === detailTx.subcategory_id) ?? null;
          const acc = accounts.find(a => a.id === detailTx.account_id) ?? null;
          return (
            <div className="pb-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-2xl shrink-0">
                  {detailTx.is_transfer ? "↔️" : cat?.icon ?? "💸"}
                </div>
                <div>
                  <p className="text-white font-semibold">
                    {detailTx.is_transfer ? "Transfer" : sub ? `${cat?.name} / ${sub.name}` : cat?.name ?? "No category"}
                  </p>
                  <p className="text-[#6b7280] text-xs">{acc?.name ?? ""}</p>
                </div>
              </div>
              <div className="bg-[#1a1a1a] rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#6b7280] text-sm">Amount</span>
                  <span className={cn("text-sm font-bold",
                    detailTx.is_transfer ? "text-[#6b7280]" : detailTx.amount < 0 ? "text-white" : "text-[#00FF85]"
                  )}>
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
                  <span className="text-white text-sm">{acc?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => openEdit(detailTx)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#1a1a1a] rounded-xl text-white text-sm font-semibold"
                >
                  <Pencil size={15} /> Edit
                </button>
                <button
                  onClick={() => deleteTx(detailTx)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#ef4444]/10 rounded-xl text-[#ef4444] text-sm font-semibold"
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </div>
          );
        })()}
      </BottomSheet>

      {/* Edit sheet */}
      <BottomSheet open={!!editTx} onClose={() => setEditTx(null)} title="Edit Transaction">
        {editTx && (
          <div className="pb-6 space-y-4">
            <div>
              <p className="text-[#6b7280] text-xs mb-1">Amount ({editTx.currency})</p>
              <input
                type="text"
                inputMode="decimal"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value.replace(",", "."))}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-xl font-bold outline-none"
              />
            </div>

            {!editTx.is_transfer && (
              <div>
                <p className="text-[#6b7280] text-xs mb-2">Category</p>
                <div className="flex flex-wrap gap-2">
                  {allCategories.filter(c => !c.parent_id && c.type === (editTx.amount < 0 ? "expense" : "income")).map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setEditCatId(cat.id); setEditSubcatId(null); setEditSubSearch(""); }}
                      className={cn("flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border min-w-[60px] transition-all",
                        editCatId === cat.id ? "border-[#00FF85] bg-[#00FF85]/10 text-[#00FF85]" : "border-white/10 text-[#6b7280]"
                      )}
                    >
                      <span className="text-lg">{cat.icon}</span>
                      <span className="text-[10px] text-center leading-tight">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!editTx.is_transfer && editCatId && (
              <div>
                <p className="text-[#6b7280] text-xs mb-2">Subcategory</p>
                <input
                  value={editSubSearch}
                  onChange={e => setEditSubSearch(e.target.value)}
                  placeholder="Search subcategory..."
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none"
                  style={{ fontSize: "16px" }}
                />
                {editSubSearch.length > 0 && (
                  <div className="mt-2 bg-[#111] rounded-xl overflow-hidden">
                    {editMatchingSubs.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setEditSubcatId(s.id); setEditSubSearch(""); }}
                        className="w-full px-4 py-3 text-left text-white text-sm border-b border-white/5 last:border-0"
                      >
                        {s.name}
                      </button>
                    ))}
                    {editSubSearch.trim() && !editMatchingSubs.find(s => s.name.toLowerCase() === editSubSearch.toLowerCase()) && (
                      <button
                        onClick={async () => {
                          if (!editCatId || !userId) return;
                          const { data } = await supabase.from("fl_categories").insert({
                            user_id: userId,
                            name: editSubSearch.trim(),
                            icon: "▸",
                            type: editTx.amount < 0 ? "expense" : "income",
                            color: "#6b7280",
                            parent_id: editCatId,
                            sort_order: 0,
                          }).select().single();
                          if (data) {
                            setAllCategories(prev => [...prev, data as FLCategory]);
                            setEditSubcatId(data.id);
                            setEditSubSearch("");
                          }
                        }}
                        className="w-full px-4 py-3 text-left text-[#00FF85] text-sm flex items-center gap-2"
                      >
                        <Plus size={14} /> Create &quot;{editSubSearch}&quot;
                      </button>
                    )}
                  </div>
                )}
                {editSubcatId && (() => {
                  const sub = allCategories.find(c => c.id === editSubcatId);
                  return sub ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="px-3 py-1.5 bg-[#00FF85]/10 border border-[#00FF85] rounded-xl text-[#00FF85] text-xs">
                        {sub.name}
                      </span>
                      <button onClick={() => { setEditSubcatId(null); setEditSubSearch(""); }}>
                        <X size={14} className="text-[#6b7280]" />
                      </button>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            <div>
              <p className="text-[#6b7280] text-xs mb-1">Date</p>
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none w-full"
              />
            </div>

            <div>
              <p className="text-[#6b7280] text-xs mb-1">Note</p>
              <input
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none"
                style={{ fontSize: "16px" }}
              />
            </div>

            <button
              onClick={saveEdit}
              disabled={saving}
              className="w-full h-12 bg-[#00FF85] text-black font-bold rounded-2xl disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

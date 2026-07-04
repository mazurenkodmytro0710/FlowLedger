"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FinanceAccount, FLCategory } from "@/lib/types";
import { getEurRates } from "@/lib/currency";
import { showToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface CheckItem {
  id: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  subcategoryId: string;
  subcategoryName: string;
}

export default function AddPage() {
  const [txType, setTxType] = useState<"expense" | "income">("expense");
  const [items, setItems] = useState<CheckItem[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ amount: "", categoryId: "", subcategoryId: "" });
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FLCategory[]>([]);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserId(user.id);
    const [{ data: accs }, { data: cats }] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("fl_categories").select("*").eq("user_id", user.id).order("sort_order"),
    ]);
    setAccounts(accs ?? []);
    setCategories(cats ?? []);
    if (accs?.length) setSelectedAccountId(accs[0].id);
  }

  const filteredCategories = categories.filter((c) => c.type === txType && !c.parent_id);
  const subcategories = itemForm.categoryId
    ? categories.filter((c) => c.parent_id === itemForm.categoryId)
    : [];

  function selectCategory(id: string) {
    setItemForm((f) => ({ ...f, categoryId: id, subcategoryId: "" }));
  }

  function addItemToCheck() {
    const amount = parseFloat(itemForm.amount.replace(",", "."));
    if (!amount || !itemForm.categoryId) return;
    const cat = categories.find((c) => c.id === itemForm.categoryId);
    const sub = categories.find((c) => c.id === itemForm.subcategoryId);
    setItems((prev) => [...prev, {
      id: crypto.randomUUID(),
      amount,
      categoryId: itemForm.categoryId,
      categoryName: cat?.name ?? "",
      categoryIcon: cat?.icon ?? "📦",
      subcategoryId: itemForm.subcategoryId,
      subcategoryName: sub?.name ?? "",
    }]);
    setItemForm({ amount: "", categoryId: "", subcategoryId: "" });
    setAddingItem(false);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function saveCheck() {
    if (!selectedAccountId || items.length === 0) return;
    setSaving(true);
    const account = accounts.find((a) => a.id === selectedAccountId);
    const rates = await getEurRates();
    let totalDelta = 0;

    for (const item of items) {
      const signed = txType === "expense" ? -item.amount : item.amount;
      const rateToEur = rates[account?.currency ?? "EUR"] ?? 1;
      const amountEur = signed * rateToEur;
      await supabase.from("fl_transactions").insert({
        user_id: userId,
        account_id: selectedAccountId,
        category_id: item.categoryId || null,
        subcategory_id: item.subcategoryId || null,
        amount: signed,
        currency: account?.currency ?? "EUR",
        amount_eur: amountEur,
        date,
        is_transfer: false,
      });
      totalDelta += signed;
    }

    const roundMoney = (n: number) => Math.round(n * 100) / 100;
    await supabase.from("finance_accounts").update({
      current_balance: roundMoney((account?.current_balance ?? 0) + totalDelta),
    }).eq("id", selectedAccountId);

    const count = items.length;
    setItems([]);
    setSaving(false);
    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
    showToast(`Saved ${count} transaction${count > 1 ? "s" : ""} ✓`);
  }

  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe pb-32">
      <header className="px-4 pt-4 pb-3">
        <h1 className="text-2xl font-black text-white">Add</h1>
      </header>

      {/* Expense / Income toggle */}
      <div className="flex mx-4 bg-[#1a1a1a] rounded-xl p-1 mb-4">
        <button onClick={() => setTxType("expense")}
          className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
            txType === "expense" ? "bg-[#ef4444] text-white" : "text-[#6b7280]")}>
          Expense
        </button>
        <button onClick={() => setTxType("income")}
          className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
            txType === "income" ? "bg-[#00FF85] text-black" : "text-[#6b7280]")}>
          Income
        </button>
      </div>

      {/* Date */}
      <div className="mx-4 mb-4 flex items-center gap-2">
        <span className="text-[#6b7280] text-xs">Date:</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="bg-transparent text-white text-sm outline-none" />
      </div>

      {/* Check items */}
      <div className="mx-4 space-y-2 mb-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 bg-[#111] rounded-xl px-4 py-3">
            <span className="text-xl">{item.categoryIcon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm truncate">
                {item.subcategoryName ? `${item.categoryName} / ${item.subcategoryName}` : item.categoryName}
              </p>
            </div>
            <p className="text-white text-sm font-semibold shrink-0">
              {txType === "expense" ? "−" : "+"}€{item.amount.toFixed(2)}
            </p>
            <button onClick={() => removeItem(item.id)} className="text-[#6b7280] shrink-0 p-1">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add item form */}
      {addingItem ? (
        <div className="mx-4 bg-[#111] rounded-2xl p-4 space-y-4">
          <input
            type="text"
            inputMode="decimal"
            value={itemForm.amount}
            onChange={(e) => setItemForm((f) => ({ ...f, amount: e.target.value.replace(",", ".") }))}
            placeholder="0.00"
            autoFocus
            className="w-full bg-[#1a1a1a] rounded-xl px-4 py-4 text-white font-black text-center outline-none"
            style={{ fontSize: "32px" }}
          />
          <div className="grid grid-cols-4 gap-2">
            {filteredCategories.map((c) => (
              <button key={c.id} onClick={() => selectCategory(c.id)}
                className={cn("flex flex-col items-center gap-1 py-3 rounded-xl border transition-all",
                  itemForm.categoryId === c.id ? "border-[#00FF85] bg-[#00FF85]/10" : "border-white/10 bg-[#1a1a1a]")}>
                <span className="text-xl">{c.icon}</span>
                <span className="text-[9px] text-[#6b7280] text-center leading-tight px-1 line-clamp-2">{c.name}</span>
              </button>
            ))}
          </div>
          {subcategories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {subcategories.map((s) => (
                <button key={s.id}
                  onClick={() => setItemForm((f) => ({ ...f, subcategoryId: f.subcategoryId === s.id ? "" : s.id }))}
                  className={cn("px-3 py-1.5 rounded-xl text-xs border transition-all",
                    itemForm.subcategoryId === s.id ? "border-[#00FF85] text-[#00FF85] bg-[#00FF85]/10" : "border-white/10 text-[#6b7280]")}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setAddingItem(false); setItemForm({ amount: "", categoryId: "", subcategoryId: "" }); }}
              className="flex-1 py-3 bg-[#1a1a1a] rounded-xl text-[#6b7280] text-sm">
              Cancel
            </button>
            <button onClick={addItemToCheck}
              disabled={!itemForm.amount || !itemForm.categoryId}
              className="flex-1 py-3 bg-[#00FF85] rounded-xl text-black font-bold text-sm disabled:opacity-40">
              Add
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingItem(true)}
          className="mx-4 w-[calc(100%-32px)] py-4 border-2 border-dashed border-white/20 rounded-2xl text-[#6b7280] text-sm flex items-center justify-center gap-2">
          <Plus size={18} /> Add item
        </button>
      )}

      {items.length > 0 && (
        <div className="mx-4 mt-4 space-y-3">
          <div className="flex justify-between items-center bg-[#111] rounded-2xl px-4 py-4">
            <p className="text-[#6b7280] font-medium">Total</p>
            <p className="text-white text-2xl font-black">
              {txType === "expense" ? "−" : "+"}€{total.toFixed(2)}
            </p>
          </div>

          <div>
            <p className="text-[#6b7280] text-xs mb-2">Account</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setSelectedAccountId(a.id)}
                  className={cn("shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all",
                    selectedAccountId === a.id ? "border-[#00FF85] text-[#00FF85] bg-[#00FF85]/10" : "border-white/10 text-[#6b7280]")}>
                  <span>{a.icon}</span><span>{a.name}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={saveCheck} disabled={!selectedAccountId || saving}
            className="w-full h-14 bg-[#00FF85] text-black font-black text-base rounded-2xl disabled:opacity-40">
            {saving ? "Saving..." : `Save ${items.length} item${items.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

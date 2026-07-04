"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FinanceAccount, FLCategory } from "@/lib/types";
import { getRates, toEurFromRates } from "@/lib/monobank";
import { showToast } from "@/components/ui/Toaster";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

type TxType = "expense" | "income" | "transfer";

export default function AddPage() {
  const [txType, setTxType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [selectedSubcat, setSelectedSubcat] = useState<FLCategory | null>(null);
  const [subSearch, setSubSearch] = useState("");
  const [note, setNote] = useState("");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [allCategories, setAllCategories] = useState<FLCategory[]>([]);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState({ uahToEur: 0.024, usdToEur: 0.92 });

  // New category sheet state
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");
  const [newCatType, setNewCatType] = useState<"expense" | "income">("expense");
  const [creatingCat, setCreatingCat] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserId(user.id);
    const [{ data: accs }, { data: cats }, fetchedRates] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("fl_categories").select("*").eq("user_id", user.id).order("sort_order"),
      getRates(),
    ]);
    setAccounts(accs ?? []);
    setAllCategories(cats ?? []);
    setRates(fetchedRates);
    if (accs?.length) {
      setSelectedAccountId(accs[0].id);
      setToAccountId(accs[1]?.id ?? accs[0].id);
    }
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  // Currency derived from selected account
  const currency = accounts.find(a => a.id === selectedAccountId)?.currency ?? "EUR";

  const filteredCategories = allCategories.filter(c => c.type === txType && !c.parent_id);

  const matchingSubs = selectedCatId
    ? allCategories.filter(c => c.parent_id === selectedCatId && c.name.toLowerCase().includes(subSearch.toLowerCase()))
    : [];

  async function createAndSelectSubcat(name: string) {
    if (!selectedCatId || !userId) return;
    const { data } = await supabase.from("fl_categories").insert({
      user_id: userId,
      name: name.trim(),
      icon: "▸",
      type: txType,
      color: "#6b7280",
      parent_id: selectedCatId,
      sort_order: 0,
    }).select().single();
    if (data) {
      setAllCategories(prev => [...prev, data as FLCategory]);
      setSelectedSubcat(data as FLCategory);
      setSubSearch("");
    }
  }

  async function createCategory() {
    if (!newCatName.trim() || !newCatIcon.trim() || !userId) return;
    setCreatingCat(true);
    const { data } = await supabase.from("fl_categories").insert({
      user_id: userId,
      name: newCatName.trim(),
      icon: newCatIcon.trim(),
      type: newCatType,
      color: "#6b7280",
      parent_id: null,
      sort_order: allCategories.length,
    }).select().single();
    if (data) {
      setAllCategories(prev => [...prev, data as FLCategory]);
      setSelectedCatId(data.id);
      setSelectedSubcat(null);
      setSubSearch("");
    }
    setNewCatName("");
    setNewCatIcon("");
    setCreatingCat(false);
    setShowAddCategory(false);
    showToast("Category created ✓");
  }

  async function save() {
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!parsedAmount || isNaN(parsedAmount)) {
      showToast("Enter an amount", "error");
      return;
    }
    if (txType !== "transfer" && !selectedCatId) {
      showToast("Select a category", "error");
      return;
    }
    if (!selectedAccountId) {
      showToast("Select an account", "error");
      return;
    }

    setSaving(true);
    const freshRates = await getRates();
    const { uahToEur, usdToEur } = freshRates;

    let amountEur = parsedAmount;
    if (currency === "UAH") amountEur = parsedAmount * uahToEur;
    if (currency === "USD") amountEur = parsedAmount * usdToEur;

    const sign = txType === "expense" ? -1 : 1;
    const signedAmount = txType === "transfer" ? -parsedAmount : sign * parsedAmount;
    const signedEur = txType === "transfer" ? -amountEur : sign * amountEur;

    const date = new Date().toISOString().split("T")[0];

    await supabase.from("fl_transactions").insert({
      user_id: userId,
      account_id: selectedAccountId,
      category_id: txType !== "transfer" ? selectedCatId : null,
      subcategory_id: selectedSubcat?.id ?? null,
      amount: signedAmount,
      currency,
      amount_eur: Math.round(signedEur * 100) / 100,
      description: note || null,
      date,
      is_transfer: txType === "transfer",
      source: "manual",
    });

    // Update account balance
    const acc = accounts.find(a => a.id === selectedAccountId);
    if (acc) {
      await supabase.from("finance_accounts").update({
        current_balance: Math.round((acc.current_balance + signedAmount) * 100) / 100,
      }).eq("id", selectedAccountId);
    }

    // If transfer, also add income to target account
    if (txType === "transfer" && toAccountId && toAccountId !== selectedAccountId) {
      const toAcc = accounts.find(a => a.id === toAccountId);
      await supabase.from("fl_transactions").insert({
        user_id: userId,
        account_id: toAccountId,
        category_id: null,
        subcategory_id: null,
        amount: parsedAmount,
        currency,
        amount_eur: Math.round(amountEur * 100) / 100,
        description: note || null,
        date,
        is_transfer: true,
        source: "manual",
      });
      if (toAcc) {
        await supabase.from("finance_accounts").update({
          current_balance: Math.round((toAcc.current_balance + parsedAmount) * 100) / 100,
        }).eq("id", toAccountId);
      }
    }

    // Reset
    setAmount("");
    setSelectedCatId(null);
    setSelectedSubcat(null);
    setSubSearch("");
    setNote("");
    setSaving(false);
    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
    showToast("Saved! ✓");

    // Refresh accounts
    const { data: refreshed } = await supabase.from("finance_accounts").select("*").eq("user_id", userId).order("sort_order");
    setAccounts(refreshed ?? []);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe pb-32">
      <header className="px-4 pt-4 pb-3">
        <h1 className="text-2xl font-black text-white">Add</h1>
      </header>

      {/* Amount input */}
      <div className="mx-4 mb-4 bg-[#111111] rounded-2xl p-5">
        <div className="flex items-center justify-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(",", "."))}
            placeholder="0.00"
            autoFocus
            className="text-center bg-transparent text-white outline-none"
            style={{ fontSize: "48px", fontWeight: 900, width: "200px" }}
          />
          <span className="text-[#6b7280] text-lg font-semibold">{currency}</span>
        </div>
        {currency === "UAH" && amount && !isNaN(parseFloat(amount)) && (
          <p className="text-[#6b7280] text-xs text-center mt-1">
            ≈ €{(parseFloat(amount) * rates.uahToEur).toFixed(2)}
          </p>
        )}
      </div>

      {/* Expense / Income / Transfer toggle */}
      <div className="flex mx-4 bg-[#1a1a1a] rounded-xl p-1 mb-4">
        <button
          onClick={() => setTxType("expense")}
          className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
            txType === "expense" ? "bg-[#ef4444] text-white" : "text-[#6b7280]"
          )}
        >
          Expense
        </button>
        <button
          onClick={() => setTxType("income")}
          className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
            txType === "income" ? "bg-[#00FF85] text-black" : "text-[#6b7280]"
          )}
        >
          Income
        </button>
        <button
          onClick={() => setTxType("transfer")}
          className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
            txType === "transfer" ? "bg-[#6b7280] text-white" : "text-[#6b7280]"
          )}
        >
          Transfer
        </button>
      </div>

      {/* Account selector */}
      <div className="mx-4 mb-4">
        <p className="text-[#6b7280] text-xs mb-2">
          {txType === "transfer" ? "From account" : "Account"}
        </p>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {accounts.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAccountId(a.id)}
              className={cn("shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all",
                selectedAccountId === a.id ? "border-[#00FF85] text-[#00FF85] bg-[#00FF85]/10" : "border-white/10 text-[#6b7280]"
              )}
            >
              <span>{a.icon}</span><span>{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Transfer: To account */}
      {txType === "transfer" && (
        <div className="mx-4 mb-4">
          <p className="text-[#6b7280] text-xs mb-2">To account</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {accounts.map(a => (
              <button
                key={a.id}
                onClick={() => setToAccountId(a.id)}
                className={cn("shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all",
                  toAccountId === a.id ? "border-[#00FF85] text-[#00FF85] bg-[#00FF85]/10" : "border-white/10 text-[#6b7280]"
                )}
              >
                <span>{a.icon}</span><span>{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category grid — only for non-transfer */}
      {txType !== "transfer" && (
        <div className="mx-4 mb-4">
          <p className="text-[#6b7280] text-xs mb-2">Category</p>
          <div className="grid grid-cols-4 gap-2">
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCatId(selectedCatId === cat.id ? null : cat.id);
                  setSelectedSubcat(null);
                  setSubSearch("");
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-2xl border aspect-square transition-all",
                  selectedCatId === cat.id
                    ? "border-[#00FF85] bg-[#00FF85]/10"
                    : "border-white/10 bg-[#1a1a1a]"
                )}
              >
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-[10px] text-[#6b7280] text-center leading-tight px-1 line-clamp-2">
                  {cat.name}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                setNewCatType(txType === "income" ? "income" : "expense");
                setShowAddCategory(true);
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/20 bg-transparent aspect-square"
            >
              <Plus size={22} className="text-[#6b7280]" />
              <span className="text-[10px] text-[#6b7280]">New</span>
            </button>
          </div>
        </div>
      )}

      {/* Subcategory search */}
      {txType !== "transfer" && selectedCatId && (
        <div className="mx-4 mb-4">
          <p className="text-[#6b7280] text-xs mb-2">Subcategory</p>
          <input
            value={subSearch}
            onChange={e => setSubSearch(e.target.value)}
            placeholder="Search or create subcategory..."
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none"
            style={{ fontSize: "16px" }}
          />
          {subSearch.length > 0 && (
            <div className="mt-2 bg-[#111] rounded-xl overflow-hidden">
              {matchingSubs.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSubcat(s); setSubSearch(""); }}
                  className="w-full px-4 py-3 text-left text-white text-sm border-b border-white/5 last:border-0"
                >
                  {s.name}
                </button>
              ))}
              {subSearch.trim() && !matchingSubs.find(s => s.name.toLowerCase() === subSearch.toLowerCase()) && (
                <button
                  onClick={() => createAndSelectSubcat(subSearch.trim())}
                  className="w-full px-4 py-3 text-left text-[#00FF85] text-sm flex items-center gap-2"
                >
                  <Plus size={14} /> Create &quot;{subSearch}&quot;
                </button>
              )}
            </div>
          )}
          {selectedSubcat && (
            <div className="mt-2 flex items-center gap-2">
              <span className="px-3 py-1.5 bg-[#00FF85]/10 border border-[#00FF85] rounded-xl text-[#00FF85] text-xs">
                {selectedSubcat.name}
              </span>
              <button onClick={() => { setSelectedSubcat(null); setSubSearch(""); }}>
                <X size={14} className="text-[#6b7280]" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Note */}
      <div className="mx-4 mb-4">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Save button */}
      <div className="mx-4">
        <button
          onClick={save}
          disabled={saving}
          className="w-full h-14 bg-[#00FF85] text-black font-black text-base rounded-2xl disabled:opacity-40 transition-all"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* New Category bottom sheet */}
      <BottomSheet open={showAddCategory} onClose={() => setShowAddCategory(false)} title="New Category">
        <div className="space-y-4 pb-6">
          <Input
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="Category name"
            className="bg-[#1a1a1a] border-white/10 text-white h-12"
          />
          <Input
            value={newCatIcon}
            onChange={e => setNewCatIcon(e.target.value)}
            placeholder="Pick emoji 👆"
            className="bg-[#1a1a1a] border-white/10 text-white h-12 text-2xl"
          />
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map(t => (
              <button
                key={t}
                onClick={() => setNewCatType(t)}
                className={cn("py-2.5 rounded-xl text-sm font-semibold",
                  newCatType === t ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]"
                )}
              >
                {t === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>
          <Button
            onClick={createCategory}
            disabled={!newCatName.trim() || !newCatIcon.trim() || creatingCat}
            className="w-full h-12 bg-[#00FF85] text-black font-bold rounded-2xl"
          >
            Create
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

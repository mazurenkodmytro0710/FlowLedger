"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FinanceAccount, FLCategory } from "@/lib/types";
import { getRates, toEurFromRates } from "@/lib/monobank";
import { showToast } from "@/components/ui/Toaster";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { format } from "date-fns";

type TxType = "expense" | "income" | "transfer";
type Currency = "EUR" | "UAH" | "USD";

export default function AddPage() {
  const [txType, setTxType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [eurPreview, setEurPreview] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [selectedSubcat, setSelectedSubcat] = useState<FLCategory | null>(null);
  const [subSearch, setSubSearch] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [allCategories, setAllCategories] = useState<FLCategory[]>([]);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"expense" | "income">("expense");
  const [newCatEmoji, setNewCatEmoji] = useState("📦");
  const [creatingCat, setCreatingCat] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserId(user.id);
    const [{ data: accs }, { data: cats }] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("fl_categories").select("*").eq("user_id", user.id).order("sort_order"),
    ]);
    setAccounts(accs ?? []);
    setAllCategories(cats ?? []);
    if (accs?.length) {
      setSelectedAccountId(accs[0].id);
      setToAccountId(accs[1]?.id ?? accs[0].id);
    }
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  // EUR preview
  useEffect(() => {
    if (currency === "EUR" || !amount) { setEurPreview(null); return; }
    const parsed = parseFloat(amount.replace(",", "."));
    if (isNaN(parsed)) { setEurPreview(null); return; }
    getRates().then((r) => {
      setEurPreview(toEurFromRates(parsed, currency, r));
    });
  }, [amount, currency]);

  const filteredRootCats = allCategories.filter((c) => c.type === txType && !c.parent_id);
  const visibleCats = filteredRootCats.slice(0, 7);
  const hiddenCatsCount = filteredRootCats.length - 7;

  const matchingSubs = selectedCatId
    ? allCategories.filter((c) => c.parent_id === selectedCatId && c.name.toLowerCase().includes(subSearch.toLowerCase()))
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
      setAllCategories((prev) => [...prev, data as FLCategory]);
      setSelectedSubcat(data as FLCategory);
      setSubSearch("");
    }
  }

  async function createCategory() {
    if (!newCatName.trim() || !userId) return;
    setCreatingCat(true);
    const { data } = await supabase.from("fl_categories").insert({
      user_id: userId,
      name: newCatName.trim(),
      icon: newCatEmoji,
      type: newCatType,
      color: "#6b7280",
      parent_id: null,
      sort_order: allCategories.length,
    }).select().single();
    if (data) {
      setAllCategories((prev) => [...prev, data as FLCategory]);
      setSelectedCatId(data.id);
      setSelectedSubcat(null);
      setSubSearch("");
    }
    setNewCatName("");
    setCreatingCat(false);
    setCatSheetOpen(false);
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
    const rates = await getRates();
    const { uahToEur, usdToEur } = rates;

    let amountEur = parsedAmount;
    if (currency === "UAH") amountEur = parsedAmount * uahToEur;
    if (currency === "USD") amountEur = parsedAmount * usdToEur;

    const sign = txType === "expense" ? -1 : 1;
    const signedAmount = txType === "transfer" ? -parsedAmount : sign * parsedAmount;
    const signedEur = txType === "transfer" ? -amountEur : sign * amountEur;

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
    });

    // Update account balance
    const acc = accounts.find((a) => a.id === selectedAccountId);
    if (acc) {
      await supabase.from("finance_accounts").update({
        current_balance: Math.round((acc.current_balance + signedAmount) * 100) / 100,
      }).eq("id", selectedAccountId);
    }

    // If transfer, also add income to target account
    if (txType === "transfer" && toAccountId && toAccountId !== selectedAccountId) {
      const toAcc = accounts.find((a) => a.id === toAccountId);
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
        <div className="flex items-center justify-center gap-3 mb-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))}
            placeholder="0.00"
            autoFocus
            className="text-center bg-transparent text-white outline-none flex-1"
            style={{ fontSize: "48px", fontWeight: 900 }}
          />
          <div className="flex flex-col gap-1">
            {(["EUR", "UAH", "USD"] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn("px-2 py-1 rounded-lg text-xs font-bold transition-all",
                  currency === c ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {eurPreview !== null && (
          <p className="text-[#6b7280] text-sm text-center">≈ €{eurPreview.toFixed(2)}</p>
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
          {accounts.map((a) => (
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
            {accounts.map((a) => (
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

      {/* Category selector */}
      {txType !== "transfer" && (
        <div className="mx-4 mb-4">
          <p className="text-[#6b7280] text-xs mb-2">Category</p>
          <div className="flex flex-wrap gap-2">
            {visibleCats.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCatId(selectedCatId === cat.id ? null : cat.id);
                  setSelectedSubcat(null);
                  setSubSearch("");
                }}
                className={cn("flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border min-w-[72px] transition-all",
                  selectedCatId === cat.id ? "border-[#00FF85] bg-[#00FF85]/10 text-[#00FF85]" : "border-white/10 text-[#6b7280]"
                )}
              >
                <span className="text-xl">{cat.icon}</span>
                <span className="text-[10px] text-center leading-tight">{cat.name}</span>
              </button>
            ))}
            {hiddenCatsCount > 0 && (
              <button
                onClick={() => setCatSheetOpen(true)}
                className="flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border border-white/10 min-w-[72px] text-[#6b7280]"
              >
                <span className="text-xl">+{hiddenCatsCount}</span>
                <span className="text-[10px] text-center leading-tight">more</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Subcategory search */}
      {txType !== "transfer" && selectedCatId && (
        <div className="mx-4 mb-4">
          <p className="text-[#6b7280] text-xs mb-2">Subcategory</p>
          <input
            value={subSearch}
            onChange={(e) => setSubSearch(e.target.value)}
            placeholder="Search or create subcategory..."
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none"
            style={{ fontSize: "16px" }}
          />
          {subSearch.length > 0 && (
            <div className="mt-2 bg-[#111] rounded-xl overflow-hidden">
              {matchingSubs.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSubcat(s); setSubSearch(""); }}
                  className="w-full px-4 py-3 text-left text-white text-sm border-b border-white/5 last:border-0"
                >
                  {s.name}
                </button>
              ))}
              {subSearch.trim() && !matchingSubs.find((s) => s.name.toLowerCase() === subSearch.toLowerCase()) && (
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

      {/* Date + Note */}
      <div className="mx-4 mb-4 space-y-2">
        <div className="flex items-center gap-2 bg-[#111111] rounded-xl px-4 py-3">
          <span className="text-[#6b7280] text-xs">Date:</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-white text-sm outline-none"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
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

      {/* Full category sheet */}
      <BottomSheet open={catSheetOpen} onClose={() => setCatSheetOpen(false)} title="All categories">
        <div className="pb-6">
          {/* Create new category form */}
          <div className="mb-4 bg-[#1a1a1a] rounded-2xl p-4 space-y-3">
            <p className="text-[#6b7280] text-xs font-semibold uppercase tracking-wider">New category</p>
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Name"
              className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none"
              style={{ fontSize: "16px" }}
            />
            <div className="flex gap-2">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewCatType(t)}
                  className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-all",
                    newCatType === t ? "bg-[#00FF85] text-black" : "bg-[#111] text-[#6b7280]"
                  )}
                >
                  {t === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>
            <input
              value={newCatEmoji}
              onChange={(e) => setNewCatEmoji(e.target.value)}
              placeholder="Pick emoji 👆"
              className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none"
              style={{ fontSize: "16px" }}
            />
            <button
              onClick={createCategory}
              disabled={!newCatName.trim() || creatingCat}
              className="w-full py-3 bg-[#00FF85] text-black font-bold rounded-xl text-sm disabled:opacity-40"
            >
              Create
            </button>
          </div>

          {/* All categories grid */}
          <div className="flex flex-wrap gap-2">
            {allCategories.filter((c) => c.type === txType && !c.parent_id).map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCatId(cat.id);
                  setSelectedSubcat(null);
                  setSubSearch("");
                  setCatSheetOpen(false);
                }}
                className={cn("flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border min-w-[72px] transition-all",
                  selectedCatId === cat.id ? "border-[#00FF85] bg-[#00FF85]/10 text-[#00FF85]" : "border-white/10 text-[#6b7280]"
                )}
              >
                <span className="text-xl">{cat.icon}</span>
                <span className="text-[10px] text-center leading-tight">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FinanceAccount, FLCategory } from "@/lib/types";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/defaults";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { showToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { Plus, Trash2, LogOut, Download, Pencil } from "lucide-react";

type TabId = "accounts" | "categories" | "export" | "account";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "accounts", label: "Accounts", icon: "💳" },
  { id: "categories", label: "Categories", icon: "📂" },
  { id: "export", label: "Export", icon: "📤" },
  { id: "account", label: "Account", icon: "⚙️" },
];

const CURRENCIES = ["EUR", "UAH", "USD"] as const;
const ACCOUNT_ICONS = ["💳", "💵", "💶", "💷", "🏦", "💰", "📱", "🏧"];
const CAT_EMOJIS = ["🍕","🚌","🎬","💊","👕","🏠","💪","📦","💼","💻","🎁","↩️","💰","🛒","☕","🍺","✈️","🎮","📚","🔧","🌿","🎵","🏋️","🎯","🐾","🏥","📸"];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("accounts");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FLCategory[]>([]);
  const [categoryType, setCategoryType] = useState<"expense" | "income">("expense");
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const router = useRouter();
  const supabase = createClient();

  // Account form
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
  const [accForm, setAccForm] = useState<{ name: string; icon: string; currency: string; balance: string; isSavings: boolean }>({ name: "", icon: "💳", currency: "EUR", balance: "0", isSavings: false });

  // Category form
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", icon: "📦", type: "expense" as "expense" | "income", parentId: "" });
  const [addSubFor, setAddSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");

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

    // Seed default categories if none exist
    if (!cats?.length) {
      const toInsert = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map((c, i) => ({
        user_id: user.id, name: c.name, icon: c.icon, type: c.type, color: "#6b7280", sort_order: i,
      }));
      const { data: seeded } = await supabase.from("fl_categories").insert(toInsert).select();
      setCategories(seeded ?? []);
    } else {
      setCategories(cats ?? []);
    }
  }

  async function addAccount() {
    if (!accForm.name.trim()) return;
    await supabase.from("finance_accounts").insert({
      user_id: userId, name: accForm.name.trim(), icon: accForm.icon,
      currency: accForm.currency, current_balance: parseFloat(accForm.balance) || 0,
      is_savings: accForm.isSavings, include_in_total: true, sort_order: accounts.length,
    });
    setAddAccountOpen(false);
    setAccForm({ name: "", icon: "💳", currency: "EUR", balance: "0", isSavings: false });
    await load();
    showToast("Account added ✓");
  }

  async function saveEditAccount() {
    if (!editingAccount) return;
    await supabase.from("finance_accounts").update({
      name: accForm.name.trim(), icon: accForm.icon, currency: accForm.currency,
      current_balance: parseFloat(accForm.balance) || 0, is_savings: accForm.isSavings,
    }).eq("id", editingAccount.id);
    setEditAccountOpen(false);
    setEditingAccount(null);
    await load();
    showToast("Account updated ✓");
  }

  async function deleteAccount(id: string) {
    if (!confirm("Delete this account? All its transactions will remain.")) return;
    await supabase.from("finance_accounts").delete().eq("id", id);
    await load();
    showToast("Account deleted");
  }

  async function toggleIncludeInTotal(acc: FinanceAccount) {
    await supabase
      .from("finance_accounts")
      .update({ include_in_total: !acc.include_in_total })
      .eq("id", acc.id);
    await load();
  }

  async function addCategory() {
    if (!catForm.name.trim()) return;
    await supabase.from("fl_categories").insert({
      user_id: userId, name: catForm.name.trim(), icon: catForm.icon,
      type: catForm.type, color: "#6b7280",
      parent_id: catForm.parentId || null, sort_order: categories.length,
    });
    setAddCatOpen(false);
    setCatForm({ name: "", icon: "📦", type: "expense", parentId: "" });
    await load();
    showToast("Category added ✓");
  }

  async function addSubcategory(parentId: string) {
    if (!newSubName.trim()) return;
    await supabase.from("fl_categories").insert({
      user_id: userId, name: newSubName.trim(), icon: "▸",
      type: categoryType, color: "#6b7280", parent_id: parentId, sort_order: 0,
    });
    setAddSubFor(null);
    setNewSubName("");
    await load();
    showToast("Subcategory added ✓");
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete category?")) return;
    await supabase.from("fl_categories").delete().eq("parent_id", id);
    await supabase.from("fl_categories").delete().eq("id", id);
    await load();
    showToast("Deleted");
  }

  async function exportJSON() {
    const [accs, cats, txs] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("user_id", userId),
      supabase.from("fl_categories").select("*").eq("user_id", userId),
      supabase.from("fl_transactions").select("*").eq("user_id", userId),
    ]);
    const blob = new Blob([JSON.stringify({ accounts: accs.data, categories: cats.data, transactions: txs.data, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `flowledger-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  const rootCategories = categories.filter((c) => c.type === categoryType && !c.parent_id);
  const getSubcats = (id: string) => categories.filter((c) => c.parent_id === id);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-black text-white">⚙️ Settings</h1>
      </header>

      <div className="flex overflow-x-auto gap-2 px-4 py-3 border-b border-white/5 scrollbar-hide">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
              activeTab === tab.id ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-gray-400"
            )}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 py-4 pb-28 space-y-3">

        {/* ACCOUNTS */}
        {activeTab === "accounts" && (
          <div className="space-y-3">
            {accounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between bg-[#111] rounded-2xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{acc.icon}</span>
                  <div>
                    <p className="text-white font-medium text-sm">{acc.name}</p>
                    <p className="text-[#6b7280] text-xs">{acc.currency} · {acc.current_balance.toFixed(2)}{acc.is_savings ? " · savings" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleIncludeInTotal(acc)} title="Include in total balance">
                    <div className={cn("w-11 h-6 rounded-full transition-all relative", acc.include_in_total ? "bg-[#00FF85]" : "bg-[#333]")}>
                      <div className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all", acc.include_in_total ? "right-0.5" : "left-0.5")} />
                    </div>
                  </button>
                  <button onClick={() => {
                    setEditingAccount(acc);
                    setAccForm({ name: acc.name, icon: acc.icon, currency: acc.currency, balance: String(acc.current_balance), isSavings: acc.is_savings });
                    setEditAccountOpen(true);
                  }} className="p-2 text-[#6b7280]"><Pencil size={15} /></button>
                  <button onClick={() => deleteAccount(acc.id)} className="p-2 text-[#6b7280]"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
            <button onClick={() => setAddAccountOpen(true)}
              className="w-full bg-[#111111]/50 border border-dashed border-white/10 rounded-2xl p-4 flex items-center justify-center gap-2 text-[#6b7280] text-sm">
              <Plus size={16} /> Add account
            </button>
          </div>
        )}

        {/* CATEGORIES */}
        {activeTab === "categories" && (
          <div className="space-y-3">
            <div className="flex bg-[#1a1a1a] rounded-xl p-1">
              {(["expense", "income"] as const).map((t) => (
                <button key={t} onClick={() => setCategoryType(t)}
                  className={cn("flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all",
                    categoryType === t ? (t === "expense" ? "bg-[#ef4444] text-white" : "bg-[#00FF85] text-black") : "text-[#6b7280]")}>
                  {t === "expense" ? "💸 Expenses" : "💰 Income"}
                </button>
              ))}
            </div>
            {rootCategories.map((cat) => {
              const subs = getSubcats(cat.id);
              const isOpen = expandedCatId === cat.id;
              return (
                <div key={cat.id} className="bg-[#111111] rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => setExpandedCatId(isOpen ? null : cat.id)} className="flex items-center gap-3 flex-1 text-left">
                      <span className="text-2xl">{cat.icon}</span>
                      <div>
                        <p className="text-white font-semibold text-sm">{cat.name}</p>
                        <p className="text-[#6b7280] text-xs">{subs.length} subcategories</p>
                      </div>
                    </button>
                    <button onClick={() => deleteCategory(cat.id)} className="p-1 text-[#6b7280] active:text-[#ef4444]">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-white/5 px-4 pb-3 pt-2 space-y-1">
                      {subs.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 py-1">
                          <span className="text-[#6b7280] text-xs">└</span>
                          <span className="text-white/80 text-sm flex-1">{s.name}</span>
                          <button onClick={() => deleteCategory(s.id)} className="p-1 text-[#6b7280]/50 active:text-[#ef4444]">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      {addSubFor === cat.id ? (
                        <div className="flex gap-2 pt-1">
                          <Input value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                            placeholder="Subcategory name" autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") addSubcategory(cat.id); if (e.key === "Escape") setAddSubFor(null); }}
                            className="flex-1 bg-[#1a1a1a] border-white/10 text-white h-9 text-xs" />
                          <button onClick={() => addSubcategory(cat.id)} className="px-3 py-2 bg-[#00FF85] rounded-xl text-black text-xs font-bold">Add</button>
                        </div>
                      ) : (
                        <button onClick={() => setAddSubFor(cat.id)} className="text-[#6b7280] text-xs flex items-center gap-1 pt-1">
                          <Plus size={12} /> Add subcategory
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={() => { setCatForm((f) => ({ ...f, type: categoryType, parentId: "" })); setAddCatOpen(true); }}
              className="w-full bg-[#111111]/50 border border-dashed border-white/10 rounded-2xl p-4 flex items-center justify-center gap-2 text-[#6b7280] text-sm">
              <Plus size={16} /> Add category
            </button>
          </div>
        )}

        {/* EXPORT */}
        {activeTab === "export" && (
          <div className="bg-[#111111] rounded-2xl overflow-hidden">
            <button onClick={exportJSON} className="w-full flex items-center justify-between px-4 py-4">
              <span className="text-white text-sm">Export all data (JSON)</span>
              <Download size={16} className="text-[#6b7280]" />
            </button>
          </div>
        )}

        {/* ACCOUNT */}
        {activeTab === "account" && (
          <div className="bg-[#111111] rounded-2xl overflow-hidden">
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
              className="w-full flex items-center gap-3 px-4 py-4">
              <LogOut size={18} className="text-[#6b7280]" />
              <span className="text-white text-sm">Sign out</span>
            </button>
          </div>
        )}
      </div>

      {/* Add account sheet */}
      <BottomSheet open={addAccountOpen} onClose={() => setAddAccountOpen(false)} title="New Account">
        <div className="space-y-4 pb-6">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {ACCOUNT_ICONS.map((ic) => (
              <button key={ic} onClick={() => setAccForm((f) => ({ ...f, icon: ic }))}
                className={cn("shrink-0 w-12 h-12 rounded-xl text-2xl flex items-center justify-center border",
                  accForm.icon === ic ? "border-[#00FF85] bg-[#00FF85]/10" : "border-white/10 bg-[#1a1a1a]")}>
                {ic}
              </button>
            ))}
          </div>
          <Input value={accForm.name} onChange={(e) => setAccForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Account name" className="bg-[#1a1a1a] border-white/10 text-white h-12" />
          <div className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((cur) => (
              <button key={cur} onClick={() => setAccForm((f) => ({ ...f, currency: cur }))}
                className={cn("py-2.5 rounded-xl text-sm font-semibold border transition-all",
                  accForm.currency === cur ? "border-[#00FF85] text-[#00FF85] bg-[#00FF85]/10" : "border-white/10 text-[#6b7280] bg-[#1a1a1a]")}>
                {cur}
              </button>
            ))}
          </div>
          <div>
            <Label className="text-[#6b7280] text-xs">Starting balance</Label>
            <Input type="text" inputMode="decimal" value={accForm.balance}
              onChange={(e) => setAccForm((f) => ({ ...f, balance: e.target.value }))}
              className="mt-1 bg-[#1a1a1a] border-white/10 text-white h-11" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setAccForm((f) => ({ ...f, isSavings: !f.isSavings }))}
              className={cn("relative w-10 h-5 rounded-full transition-colors", accForm.isSavings ? "bg-[#00FF85]" : "bg-[#333]")}>
              <div className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform", accForm.isSavings ? "right-0.5" : "left-0.5")} />
            </button>
            <span className="text-white text-sm">Savings account</span>
          </div>
          <Button onClick={addAccount} disabled={!accForm.name.trim()}
            className="w-full h-12 bg-[#00FF85] text-black font-bold rounded-2xl">
            Add Account
          </Button>
        </div>
      </BottomSheet>

      {/* Edit account sheet */}
      <BottomSheet open={editAccountOpen} onClose={() => setEditAccountOpen(false)} title="Edit Account">
        <div className="space-y-4 pb-6">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {ACCOUNT_ICONS.map((ic) => (
              <button key={ic} onClick={() => setAccForm((f) => ({ ...f, icon: ic }))}
                className={cn("shrink-0 w-12 h-12 rounded-xl text-2xl flex items-center justify-center border",
                  accForm.icon === ic ? "border-[#00FF85] bg-[#00FF85]/10" : "border-white/10 bg-[#1a1a1a]")}>
                {ic}
              </button>
            ))}
          </div>
          <Input value={accForm.name} onChange={(e) => setAccForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Account name" className="bg-[#1a1a1a] border-white/10 text-white h-12" />
          <div>
            <Label className="text-[#6b7280] text-xs">Balance</Label>
            <Input type="text" inputMode="decimal" value={accForm.balance}
              onChange={(e) => setAccForm((f) => ({ ...f, balance: e.target.value }))}
              className="mt-1 bg-[#1a1a1a] border-white/10 text-white h-11" />
          </div>
          <Button onClick={saveEditAccount} disabled={!accForm.name.trim()}
            className="w-full h-12 bg-[#00FF85] text-black font-bold rounded-2xl">
            Save
          </Button>
        </div>
      </BottomSheet>

      {/* Add category sheet */}
      <BottomSheet open={addCatOpen} onClose={() => setAddCatOpen(false)} title="New Category">
        <div className="space-y-4 pb-6">
          <div className="grid grid-cols-9 gap-1.5">
            {CAT_EMOJIS.map((e) => (
              <button key={e} onClick={() => setCatForm((f) => ({ ...f, icon: e }))}
                className={cn("h-10 rounded-xl flex items-center justify-center text-lg border transition-all",
                  catForm.icon === e ? "border-[#00FF85] bg-[#00FF85]/10" : "border-white/10 bg-[#1a1a1a]")}>
                {e}
              </button>
            ))}
          </div>
          <Input value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Category name" className="bg-[#1a1a1a] border-white/10 text-white h-12" />
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((t) => (
              <button key={t} onClick={() => setCatForm((f) => ({ ...f, type: t }))}
                className={cn("py-2.5 rounded-xl text-sm font-semibold transition-all",
                  catForm.type === t ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]")}>
                {t === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>
          <Button onClick={addCategory} disabled={!catForm.name.trim()}
            className="w-full h-12 bg-[#00FF85] text-black font-bold rounded-2xl">
            Add Category
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

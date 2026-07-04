"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
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
import { Download, LogOut, Pencil, Plus, Trash2 } from "lucide-react";

type TabId = "accounts" | "categories" | "export" | "account";

interface AiReportRow {
  generated_at: string;
  report_json: {
    text?: string;
  };
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "accounts", label: "Accounts", icon: "💳" },
  { id: "categories", label: "Categories", icon: "📂" },
  { id: "export", label: "Export", icon: "📤" },
  { id: "account", label: "Account", icon: "⚙️" },
];

const CURRENCIES = ["EUR", "UAH", "USD"] as const;
const ACCOUNT_ICONS = ["💳", "💵", "💶", "💷", "🏦", "💰", "📱", "🏧"];
const CAT_EMOJIS = ["🍕", "🚌", "🎬", "💊", "👕", "🏠", "💪", "📦", "💼", "💻", "🎁", "↩️", "💰", "🛒", "☕", "🍺", "✈️", "🎮", "📚", "🔧", "🌿", "🎵", "🏋️", "🎯", "🐾", "🏥", "📸"];

function sanitizeDecimalInput(value: string, previous: string): string {
  const nextValue = value.replace(",", ".").replace(/[^0-9.]/g, "");
  return (nextValue.match(/\./g) || []).length > 1 ? previous : nextValue;
}

function normalizeDecimalInput(value: string): string {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? value : parsed.toFixed(2);
}

function parseBalanceValue(value: string): number {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("accounts");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FLCategory[]>([]);
  const [categoryType, setCategoryType] = useState<"expense" | "income">("expense");
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [grokApiKey, setGrokApiKey] = useState("");
  const [aiReportEnabled, setAiReportEnabled] = useState(false);
  const [lastReport, setLastReport] = useState<AiReportRow | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
  const [accForm, setAccForm] = useState<{ name: string; icon: string; currency: string; balance: string; isSavings: boolean }>({
    name: "",
    icon: "💳",
    currency: "EUR",
    balance: "0.00",
    isSavings: false,
  });

  const [addCatOpen, setAddCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", icon: "📦", type: "expense" as "expense" | "income", parentId: "" });
  const [addSubFor, setAddSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);

    const [{ data: accs }, { data: cats }, { data: profile }, { data: latestReport }] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("fl_categories").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("profiles").select("grok_api_key, ai_report_enabled").eq("id", user.id).maybeSingle(),
      supabase
        .from("ai_reports")
        .select("report_json, generated_at")
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setAccounts(accs ?? []);
    setGrokApiKey(profile?.grok_api_key ?? "");
    setAiReportEnabled(Boolean(profile?.ai_report_enabled));
    setLastReport(latestReport ? (latestReport as AiReportRow) : null);

    if (!cats?.length) {
      const toInsert = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map((category, index) => ({
        user_id: user.id,
        name: category.name,
        icon: category.icon,
        type: category.type,
        color: "#6b7280",
        sort_order: index,
      }));
      const { data: seeded } = await supabase.from("fl_categories").insert(toInsert).select();
      setCategories(seeded ?? []);
      return;
    }

    setCategories(cats ?? []);
  }

  async function saveProfile(nextValues?: { grokApiKey?: string; aiReportEnabled?: boolean }) {
    if (!userId) {
      return false;
    }

    const nextKey = nextValues?.grokApiKey ?? grokApiKey;
    const nextEnabled = nextValues?.aiReportEnabled ?? aiReportEnabled;

    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        grok_api_key: nextKey.trim() || null,
        ai_report_enabled: nextEnabled,
      },
      { onConflict: "id" }
    );

    if (error) {
      showToast("Unable to save AI settings", "error");
      return false;
    }

    return true;
  }

  async function saveGrokKey() {
    const ok = await saveProfile({ grokApiKey });
    if (ok) {
      showToast("AI settings saved ✓");
    }
  }

  async function toggleAiReport() {
    const nextValue = !aiReportEnabled;
    setAiReportEnabled(nextValue);
    const ok = await saveProfile({ aiReportEnabled: nextValue });
    if (!ok) {
      setAiReportEnabled(!nextValue);
      return;
    }
    showToast(nextValue ? "AI report enabled ✓" : "AI report disabled");
  }

  async function generateReportNow() {
    setReportBusy(true);

    try {
      const response = await fetch("/api/ai-report", { method: "POST" });
      const payload = (await response.json()) as { error?: string; report?: string; generatedAt?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate report");
      }

      if (payload.report && payload.generatedAt) {
        setLastReport({
          generated_at: payload.generatedAt,
          report_json: { text: payload.report },
        });
      }

      showToast("Report generated ✓");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to generate report", "error");
    } finally {
      setReportBusy(false);
    }
  }

  function updateBalanceInput(value: string) {
    setAccForm((form) => ({
      ...form,
      balance: sanitizeDecimalInput(value, form.balance),
    }));
  }

  function normalizeBalanceInput() {
    setAccForm((form) => ({
      ...form,
      balance: normalizeDecimalInput(form.balance),
    }));
  }

  async function addAccount() {
    if (!accForm.name.trim()) {
      return;
    }

    await supabase.from("finance_accounts").insert({
      user_id: userId,
      name: accForm.name.trim(),
      icon: accForm.icon,
      currency: accForm.currency,
      current_balance: parseBalanceValue(accForm.balance),
      is_savings: accForm.isSavings,
      include_in_total: true,
      sort_order: accounts.length,
    });

    setAddAccountOpen(false);
    setAccForm({ name: "", icon: "💳", currency: "EUR", balance: "0.00", isSavings: false });
    await load();
    showToast("Account added ✓");
  }

  async function saveEditAccount() {
    if (!editingAccount) {
      return;
    }

    await supabase
      .from("finance_accounts")
      .update({
        name: accForm.name.trim(),
        icon: accForm.icon,
        currency: accForm.currency,
        current_balance: parseBalanceValue(accForm.balance),
        is_savings: accForm.isSavings,
      })
      .eq("id", editingAccount.id);

    setEditAccountOpen(false);
    setEditingAccount(null);
    await load();
    showToast("Account updated ✓");
  }

  async function deleteAccount(id: string) {
    if (!confirm("Delete this account? All its transactions will remain.")) {
      return;
    }

    await supabase.from("finance_accounts").delete().eq("id", id);
    await load();
    showToast("Account deleted");
  }

  async function toggleIncludeInTotal(acc: FinanceAccount) {
    await supabase.from("finance_accounts").update({ include_in_total: !acc.include_in_total }).eq("id", acc.id);
    await load();
  }

  async function addCategory() {
    if (!catForm.name.trim()) {
      return;
    }

    await supabase.from("fl_categories").insert({
      user_id: userId,
      name: catForm.name.trim(),
      icon: catForm.icon,
      type: catForm.type,
      color: "#6b7280",
      parent_id: catForm.parentId || null,
      sort_order: categories.length,
    });

    setAddCatOpen(false);
    setCatForm({ name: "", icon: "📦", type: "expense", parentId: "" });
    await load();
    showToast("Category added ✓");
  }

  async function addSubcategory(parentId: string) {
    if (!newSubName.trim()) {
      return;
    }

    await supabase.from("fl_categories").insert({
      user_id: userId,
      name: newSubName.trim(),
      icon: "▸",
      type: categoryType,
      color: "#6b7280",
      parent_id: parentId,
      sort_order: 0,
    });

    setAddSubFor(null);
    setNewSubName("");
    await load();
    showToast("Subcategory added ✓");
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete category?")) {
      return;
    }

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

    const blob = new Blob(
      [
        JSON.stringify(
          {
            accounts: accs.data,
            categories: cats.data,
            transactions: txs.data,
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `flowledger-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  }

  const rootCategories = categories.filter((category) => category.type === categoryType && !category.parent_id);
  const getSubcats = (id: string) => categories.filter((category) => category.parent_id === id);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-safe">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-black text-white">⚙️ Settings</h1>
      </header>

      <div className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-white/5 px-4 py-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              activeTab === tab.id ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-gray-400"
            )}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3 px-4 py-4 pb-28">
        {activeTab === "accounts" && (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between rounded-2xl bg-[#111] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{acc.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{acc.name}</p>
                    <p className="text-xs text-[#6b7280]">
                      {acc.currency} · {acc.current_balance.toFixed(2)}
                      {acc.is_savings ? " · savings" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleIncludeInTotal(acc)} title="Include in total balance">
                    <div className={cn("relative h-6 w-11 rounded-full transition-all", acc.include_in_total ? "bg-[#00FF85]" : "bg-[#333]")}>
                      <div className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", acc.include_in_total ? "right-0.5" : "left-0.5")} />
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setEditingAccount(acc);
                      setAccForm({
                        name: acc.name,
                        icon: acc.icon,
                        currency: acc.currency,
                        balance: acc.current_balance.toFixed(2),
                        isSavings: acc.is_savings,
                      });
                      setEditAccountOpen(true);
                    }}
                    className="p-2 text-[#6b7280]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => deleteAccount(acc.id)} className="p-2 text-[#6b7280]">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => setAddAccountOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-[#111111]/50 p-4 text-sm text-[#6b7280]"
            >
              <Plus size={16} /> Add account
            </button>
          </div>
        )}

        {activeTab === "categories" && (
          <div className="space-y-3">
            <div className="flex rounded-xl bg-[#1a1a1a] p-1">
              {(["expense", "income"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setCategoryType(type)}
                  className={cn(
                    "flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all",
                    categoryType === type
                      ? type === "expense"
                        ? "bg-[#ef4444] text-white"
                        : "bg-[#00FF85] text-black"
                      : "text-[#6b7280]"
                  )}
                >
                  {type === "expense" ? "💸 Expenses" : "💰 Income"}
                </button>
              ))}
            </div>

            {rootCategories.map((cat) => {
              const subs = getSubcats(cat.id);
              const isOpen = expandedCatId === cat.id;

              return (
                <div key={cat.id} className="overflow-hidden rounded-2xl bg-[#111111]">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => setExpandedCatId(isOpen ? null : cat.id)} className="flex flex-1 items-center gap-3 text-left">
                      <span className="text-2xl">{cat.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{cat.name}</p>
                        <p className="text-xs text-[#6b7280]">{subs.length} subcategories</p>
                      </div>
                    </button>
                    <button onClick={() => deleteCategory(cat.id)} className="p-1 text-[#6b7280] active:text-[#ef4444]">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="space-y-1 border-t border-white/5 px-4 pb-3 pt-2">
                      {subs.map((subcat) => (
                        <div key={subcat.id} className="flex items-center gap-2 py-1">
                          <span className="text-xs text-[#6b7280]">└</span>
                          <span className="flex-1 text-sm text-white/80">{subcat.name}</span>
                          <button onClick={() => deleteCategory(subcat.id)} className="p-1 text-[#6b7280]/50 active:text-[#ef4444]">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}

                      {addSubFor === cat.id ? (
                        <div className="flex gap-2 pt-1">
                          <Input
                            value={newSubName}
                            onChange={(event) => setNewSubName(event.target.value)}
                            placeholder="Subcategory name"
                            autoFocus
                            onKeyDown={(event) => {
                              if (event.key === "Enter") addSubcategory(cat.id);
                              if (event.key === "Escape") setAddSubFor(null);
                            }}
                            className="h-9 flex-1 border-white/10 bg-[#1a1a1a] text-xs text-white"
                          />
                          <button onClick={() => addSubcategory(cat.id)} className="rounded-xl bg-[#00FF85] px-3 py-2 text-xs font-bold text-black">
                            Add
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setAddSubFor(cat.id)} className="flex items-center gap-1 pt-1 text-xs text-[#6b7280]">
                          <Plus size={12} /> Add subcategory
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => {
                setCatForm((form) => ({ ...form, type: categoryType, parentId: "" }));
                setAddCatOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-[#111111]/50 p-4 text-sm text-[#6b7280]"
            >
              <Plus size={16} /> Add category
            </button>
          </div>
        )}

        {activeTab === "export" && (
          <div className="overflow-hidden rounded-2xl bg-[#111111]">
            <button onClick={exportJSON} className="flex w-full items-center justify-between px-4 py-4">
              <span className="text-sm text-white">Export all data (JSON)</span>
              <Download size={16} className="text-[#6b7280]" />
            </button>
          </div>
        )}

        {activeTab === "account" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-[#111] p-4 space-y-4">
              <p className="font-bold text-white">🤖 AI Weekly Report</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">Weekly spending report</p>
                  <p className="text-xs text-[#6b7280]">Every Monday morning via push</p>
                </div>
                <button onClick={toggleAiReport}>
                  <div className={cn("h-6 w-11 rounded-full transition-all", aiReportEnabled ? "bg-[#00FF85]" : "bg-[#333]")}>
                    <div className={cn("mt-0.5 h-5 w-5 rounded-full bg-white transition-all", aiReportEnabled ? "ml-5" : "ml-0.5")} />
                  </div>
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs text-[#6b7280]">Grok API Key</p>
                <input
                  type="password"
                  value={grokApiKey}
                  onChange={(event) => setGrokApiKey(event.target.value)}
                  onBlur={saveGrokKey}
                  placeholder="xai-..."
                  className="w-full rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm text-white outline-none"
                  style={{ fontSize: "16px" }}
                />
              </div>

              <button
                onClick={generateReportNow}
                disabled={reportBusy}
                className="w-full rounded-xl bg-[#1a1a1a] py-3 text-sm text-[#6b7280] disabled:opacity-50"
              >
                {reportBusy ? "Generating..." : "Generate report now"}
              </button>

              {lastReport && (
                <div className="mt-3 rounded-xl bg-[#1a1a1a] p-4">
                  <p className="mb-2 text-xs text-[#6b7280]">
                    Last report · {format(new Date(lastReport.generated_at), "d MMM")}
                  </p>
                  <p className="text-sm leading-relaxed text-white">{lastReport.report_json.text}</p>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl bg-[#111111]">
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/login");
                }}
                className="flex w-full items-center gap-3 px-4 py-4"
              >
                <LogOut size={18} className="text-[#6b7280]" />
                <span className="text-sm text-white">Sign out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomSheet open={addAccountOpen} onClose={() => setAddAccountOpen(false)} title="New Account">
        <div className="space-y-4 pb-6">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {ACCOUNT_ICONS.map((icon) => (
              <button
                key={icon}
                onClick={() => setAccForm((form) => ({ ...form, icon }))}
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-2xl",
                  accForm.icon === icon ? "border-[#00FF85] bg-[#00FF85]/10" : "border-white/10 bg-[#1a1a1a]"
                )}
              >
                {icon}
              </button>
            ))}
          </div>

          <Input
            value={accForm.name}
            onChange={(event) => setAccForm((form) => ({ ...form, name: event.target.value }))}
            placeholder="Account name"
            className="h-12 border-white/10 bg-[#1a1a1a] text-white"
          />

          <div className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((currency) => (
              <button
                key={currency}
                onClick={() => setAccForm((form) => ({ ...form, currency }))}
                className={cn(
                  "rounded-xl border py-2.5 text-sm font-semibold transition-all",
                  accForm.currency === currency
                    ? "border-[#00FF85] bg-[#00FF85]/10 text-[#00FF85]"
                    : "border-white/10 bg-[#1a1a1a] text-[#6b7280]"
                )}
              >
                {currency}
              </button>
            ))}
          </div>

          <div>
            <Label className="text-xs text-[#6b7280]">Starting balance</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={accForm.balance}
              onChange={(event) => updateBalanceInput(event.target.value)}
              onBlur={normalizeBalanceInput}
              placeholder="0.00"
              style={{ fontSize: "16px" }}
              className="mt-1 h-11 border-white/10 bg-[#1a1a1a] text-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAccForm((form) => ({ ...form, isSavings: !form.isSavings }))}
              className={cn("relative h-5 w-10 rounded-full transition-colors", accForm.isSavings ? "bg-[#00FF85]" : "bg-[#333]")}
            >
              <div className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", accForm.isSavings ? "right-0.5" : "left-0.5")} />
            </button>
            <span className="text-sm text-white">Savings account</span>
          </div>

          <Button onClick={addAccount} disabled={!accForm.name.trim()} className="h-12 w-full rounded-2xl bg-[#00FF85] font-bold text-black">
            Add Account
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={editAccountOpen} onClose={() => setEditAccountOpen(false)} title="Edit Account">
        <div className="space-y-4 pb-6">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {ACCOUNT_ICONS.map((icon) => (
              <button
                key={icon}
                onClick={() => setAccForm((form) => ({ ...form, icon }))}
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-2xl",
                  accForm.icon === icon ? "border-[#00FF85] bg-[#00FF85]/10" : "border-white/10 bg-[#1a1a1a]"
                )}
              >
                {icon}
              </button>
            ))}
          </div>

          <Input
            value={accForm.name}
            onChange={(event) => setAccForm((form) => ({ ...form, name: event.target.value }))}
            placeholder="Account name"
            className="h-12 border-white/10 bg-[#1a1a1a] text-white"
          />

          <div className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((currency) => (
              <button
                key={currency}
                onClick={() => setAccForm((form) => ({ ...form, currency }))}
                className={cn(
                  "rounded-xl border py-2.5 text-sm font-semibold transition-all",
                  accForm.currency === currency
                    ? "border-[#00FF85] bg-[#00FF85]/10 text-[#00FF85]"
                    : "border-white/10 bg-[#1a1a1a] text-[#6b7280]"
                )}
              >
                {currency}
              </button>
            ))}
          </div>

          <div>
            <Label className="text-xs text-[#6b7280]">Balance</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={accForm.balance}
              onChange={(event) => updateBalanceInput(event.target.value)}
              onBlur={normalizeBalanceInput}
              placeholder="0.00"
              style={{ fontSize: "16px" }}
              className="mt-1 h-11 border-white/10 bg-[#1a1a1a] text-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAccForm((form) => ({ ...form, isSavings: !form.isSavings }))}
              className={cn("relative h-5 w-10 rounded-full transition-colors", accForm.isSavings ? "bg-[#00FF85]" : "bg-[#333]")}
            >
              <div className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", accForm.isSavings ? "right-0.5" : "left-0.5")} />
            </button>
            <span className="text-sm text-white">Savings account</span>
          </div>

          <Button onClick={saveEditAccount} disabled={!accForm.name.trim()} className="h-12 w-full rounded-2xl bg-[#00FF85] font-bold text-black">
            Save
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={addCatOpen} onClose={() => setAddCatOpen(false)} title="New Category">
        <div className="space-y-4 pb-6">
          <div className="grid grid-cols-9 gap-1.5">
            {CAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setCatForm((form) => ({ ...form, icon: emoji }))}
                className={cn(
                  "flex h-10 items-center justify-center rounded-xl border text-lg transition-all",
                  catForm.icon === emoji ? "border-[#00FF85] bg-[#00FF85]/10" : "border-white/10 bg-[#1a1a1a]"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>

          <Input
            value={catForm.name}
            onChange={(event) => setCatForm((form) => ({ ...form, name: event.target.value }))}
            placeholder="Category name"
            className="h-12 border-white/10 bg-[#1a1a1a] text-white"
          />

          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setCatForm((form) => ({ ...form, type }))}
                className={cn(
                  "rounded-xl py-2.5 text-sm font-semibold transition-all",
                  catForm.type === type ? "bg-[#00FF85] text-black" : "bg-[#1a1a1a] text-[#6b7280]"
                )}
              >
                {type === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>

          <Button onClick={addCategory} disabled={!catForm.name.trim()} className="h-12 w-full rounded-2xl bg-[#00FF85] font-bold text-black">
            Add Category
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

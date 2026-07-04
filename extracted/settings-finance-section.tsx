/**
 * Finance section extracted from T6X settings/page.tsx
 * For reference when building FlowLedger settings.
 *
 * State variables needed:
 *   const [financeSub, setFinanceSub] = useState<"accounts" | "categories">("accounts");
 *   const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
 *   const [editBalanceAccount, setEditBalanceAccount] = useState<FinanceAccount | null>(null);
 *   const [editBalanceValue, setEditBalanceValue] = useState("");
 *   const [addAccountOpen, setAddAccountOpen] = useState(false);
 *   const [newAccName, setNewAccName] = useState("");
 *   const [newAccCurrency, setNewAccCurrency] = useState<"UAH" | "EUR" | "USD">("EUR");
 *   const [newAccBalance, setNewAccBalance] = useState("0");
 *   const [newAccSavings, setNewAccSavings] = useState(false);
 *   const [categories, setCategories] = useState<ExpenseCategory[]>([]);
 *   const [subcatsMap, setSubcatsMap] = useState<Record<string, ExpenseCategory[]>>({});
 *   const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
 *   const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
 *   const [newSubName, setNewSubName] = useState("");
 *   const [addCatOpen, setAddCatOpen] = useState(false);
 *   const [newCatName, setNewCatName] = useState("");
 *   const [newCatEmoji, setNewCatEmoji] = useState("🛒");
 *   const [categoryType, setCategoryType] = useState<"expense" | "income">("expense");
 *
 * DB queries to add to load() Promise.all:
 *   supabase.from("expense_categories").select("*").eq("user_id", user.id).is("parent_id", null).order("created_at"),
 *   supabase.from("finance_accounts").select("*").eq("user_id", user.id).order("sort_order"),
 *   // After load: setCategories(catList); setAccounts(accnts ?? []);
 *   // + income categories seeding logic (see T6X settings/page.tsx lines 162-175)
 *
 * DB types needed: ExpenseCategory, FinanceAccount from @/lib/types
 */

const EMOJI_LIST = [
  "🛒","🚗","🎮","✈️","💊","👕","🏠","📱","🍕","☕",
  "💈","🎓","💪","📚","🐾","🎵","🍺","💡","🔧","💰",
  "🎁","🏥","✂️","🌿","🎯","🏋️","💻","🚌","🍔","🎪",
];

// ── Finance categories functions ──

async function loadSubcats(catId: string) {
  const { data } = await supabase.from("expense_categories").select("*").eq("parent_id", catId).order("created_at");
  setSubcatsMap((p) => ({ ...p, [catId]: data ?? [] }));
}

async function addCategory() {
  if (!newCatName.trim()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("expense_categories").insert({ user_id: user.id, name: newCatName.trim(), icon: newCatEmoji, color: "#6b7280", parent_id: null, transaction_type: categoryType });
  setNewCatName(""); setNewCatEmoji("🛒"); setAddCatOpen(false);
  await load();
  showToast("Категорію додано ✓");
}

async function deleteCategory(id: string) {
  if (!confirm("Видалити категорію?")) return;
  await supabase.from("expense_categories").delete().eq("parent_id", id);
  await supabase.from("expense_categories").delete().eq("id", id);
  await load();
  showToast("Видалено");
}

async function addSubcategory(parentId: string) {
  if (!newSubName.trim()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("expense_categories").insert({ user_id: user.id, name: newSubName.trim(), icon: "▸", color: "#6b7280", parent_id: parentId });
  setNewSubName(""); setAddingSubFor(null);
  await loadSubcats(parentId);
  showToast("Підкатегорію додано ✓");
}

async function deleteSubcat(id: string, parentId: string) {
  await supabase.from("expense_categories").delete().eq("id", id);
  await loadSubcats(parentId);
}

// ── Finance accounts functions ──

async function addAccount() {
  if (!newAccName.trim()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("finance_accounts").insert({
    user_id: user.id, name: newAccName.trim(), currency: newAccCurrency,
    current_balance: parseFloat(newAccBalance) || 0,
    is_savings: newAccSavings, include_in_total: true,
    icon: newAccSavings ? "🏦" : "💳", sort_order: accounts.length,
  });
  setNewAccName(""); setNewAccCurrency("EUR"); setNewAccBalance("0"); setNewAccSavings(false);
  setAddAccountOpen(false);
  await load();
  showToast("Рахунок додано ✓");
}

async function deleteAccount(id: string) {
  if (!confirm("Видалити рахунок?")) return;
  await supabase.from("finance_accounts").delete().eq("id", id);
  await load();
  showToast("Видалено");
}

async function saveBalance() {
  if (!editBalanceAccount) return;
  const newBal = parseFloat(editBalanceValue.replace(",", "."));
  if (isNaN(newBal)) return;
  await supabase.from("finance_accounts")
    .update({ current_balance: Math.round(newBal * 100) / 100 })
    .eq("id", editBalanceAccount.id);
  await load();
  setEditBalanceAccount(null);
  showToast("Баланс оновлено ✓");
}

// ── Finance JSX section (activeTab === "finance") ──

export const FinanceSettingsSection = () => (
  <div className="space-y-4">
    {/* Sub-tabs */}
    <div className="grid grid-cols-2 gap-1 p-1 bg-[#1a1a1a] rounded-2xl">
      {(["accounts", "categories"] as const).map((s) => (
        <button key={s} onClick={() => setFinanceSub(s)}
          className={cn("py-2.5 rounded-xl text-xs font-semibold transition-all",
            financeSub === s ? "bg-[#00FF85] text-black" : "text-[#6b7280]")}>
          {s === "accounts" ? "Рахунки" : "Категорії"}
        </button>
      ))}
    </div>

    {/* Рахунки */}
    {financeSub === "accounts" && (
      <div className="space-y-3">
        {accounts.length === 0 && (
          <p className="text-[#6b7280] text-sm text-center py-4">Немає рахунків</p>
        )}
        {accounts.map((acc) => (
          <div key={acc.id} className="bg-[#111111] rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{acc.icon}</span>
              <div>
                <p className="text-white font-semibold text-sm">{acc.name}</p>
                <p className="text-[#6b7280] text-xs">{acc.currency} · {acc.current_balance}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setEditBalanceAccount(acc); setEditBalanceValue(String(acc.current_balance)); }}
                className="text-[#6b7280] active:text-[#00FF85] p-1"
              >
                <Pencil size={15} />
              </button>
              <button onClick={() => deleteAccount(acc.id)} className="text-[#6b7280] active:text-[#ef4444] p-1">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setAddAccountOpen(true)}
          className="w-full bg-[#111111]/50 border border-dashed border-white/10 rounded-2xl p-4 flex items-center justify-center gap-2 text-[#6b7280] text-sm"
        >
          <Plus size={16} /> Додати рахунок
        </button>
      </div>
    )}

    {/* Категорії */}
    {financeSub === "categories" && (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#1a1a1a] rounded-2xl">
          <button onClick={() => setCategoryType("expense")}
            className={cn("py-2 rounded-xl text-xs font-semibold transition-all",
              categoryType === "expense" ? "bg-[#00FF85] text-black" : "text-[#6b7280]")}>
            💸 Витрати
          </button>
          <button onClick={() => setCategoryType("income")}
            className={cn("py-2 rounded-xl text-xs font-semibold transition-all",
              categoryType === "income" ? "bg-[#00FF85] text-black" : "text-[#6b7280]")}>
            💰 Доходи
          </button>
        </div>
        <div className="flex justify-end">
          <button onClick={() => setAddCatOpen(true)}
            className="flex items-center gap-1 text-[#00FF85] text-xs font-semibold">
            <Plus size={14} /> Додати {categoryType === "income" ? "дохід" : "витрату"}
          </button>
        </div>
        {/* categories list ... see T6X settings page lines 867–939 */}
      </div>
    )}
  </div>
);

// ── Bottom Sheets ──
// Add account, Edit balance, Add category sheets — see T6X settings/page.tsx lines 1172–1266

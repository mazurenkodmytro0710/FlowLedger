import { format, subDays } from "date-fns";

interface SupabaseLike {
  from: (...args: any[]) => any;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface TransactionRow {
  amount: number;
  amount_eur: number | null;
  category_id: string | null;
  subcategory_id: string | null;
  date: string;
  description: string | null;
}

export interface GeneratedAiReport {
  reportText: string;
  generatedAt: string;
  summary: Record<string, number>;
  weekStart: string;
  weekEnd: string;
}

export async function generateWeeklyFinanceReport({
  supabase,
  userId,
  grokApiKey,
}: {
  supabase: SupabaseLike;
  userId: string;
  grokApiKey: string;
}): Promise<GeneratedAiReport> {
  const today = new Date();
  const generatedAt = today.toISOString();
  const weekStart = format(subDays(today, 7), "yyyy-MM-dd");
  const weekEnd = format(today, "yyyy-MM-dd");

  const [{ data: txs, error: txError }, { data: categories, error: catError }] = await Promise.all([
    supabase
      .from("fl_transactions")
      .select("amount, amount_eur, category_id, subcategory_id, date, description")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .eq("is_transfer", false)
      .lt("amount", 0),
    supabase.from("fl_categories").select("id, name").eq("user_id", userId),
  ]);

  if (txError) {
    throw new Error(txError.message);
  }

  if (catError) {
    throw new Error(catError.message);
  }

  const categoryMap = Object.fromEntries(((categories ?? []) as CategoryRow[]).map((category) => [category.id, category.name]));
  const summary = ((txs ?? []) as TransactionRow[]).reduce<Record<string, number>>((acc, tx) => {
    const categoryName = tx.category_id ? categoryMap[tx.category_id] ?? "Other" : "Other";
    const subcategoryName = tx.subcategory_id ? categoryMap[tx.subcategory_id] ?? "Other" : null;
    const key = subcategoryName ? `${categoryName} / ${subcategoryName}` : categoryName;
    acc[key] = (acc[key] ?? 0) + Math.abs(tx.amount_eur ?? tx.amount);
    return acc;
  }, {});

  const totalSpent = Object.values(summary).reduce((sum, value) => sum + value, 0);

  const summaryText = Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => `${label}: EUR ${value.toFixed(2)}`)
    .join("\n");

  let reportText = "No spending recorded in the last 7 days. Nice and quiet week.";

  if (summaryText) {
    const prompt = `You are a personal finance coach. Analyze this week's spending and give actionable advice.

Total spent: EUR ${totalSpent.toFixed(2)}

Breakdown:
${summaryText}

Give a short report (3-5 sentences): what went well, what to cut, one specific tip for next week. Be direct and friendly.`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grokApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    reportText = payload.choices?.[0]?.message?.content?.trim() || "Report unavailable";
  }

  const { error: insertError } = await supabase.from("ai_reports").insert({
    user_id: userId,
    week_start: weekStart,
    week_end: weekEnd,
    report_json: { text: reportText, summary },
    generated_at: generatedAt,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { reportText, generatedAt, summary, weekStart, weekEnd };
}

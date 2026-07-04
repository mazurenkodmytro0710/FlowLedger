import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklyFinanceReport } from "@/lib/ai-report";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("grok_api_key, ai_report_enabled")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.grok_api_key) {
    return NextResponse.json({ error: "Add a Grok API key in Settings first." }, { status: 400 });
  }

  try {
    const result = await generateWeeklyFinanceReport({
      supabase,
      userId: user.id,
      grokApiKey: profile.grok_api_key,
    });

    return NextResponse.json({
      ok: true,
      report: result.reportText,
      generatedAt: result.generatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

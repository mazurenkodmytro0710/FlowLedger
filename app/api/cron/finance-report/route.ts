import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { generateWeeklyFinanceReport } from "@/lib/ai-report";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, grok_api_key, ai_report_enabled")
    .eq("ai_report_enabled", true);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const enabledProfiles = (profiles ?? []).filter(
    (profile) => Boolean(profile.grok_api_key && profile.ai_report_enabled)
  );

  const settled = await Promise.allSettled(
    enabledProfiles.map((profile) =>
      generateWeeklyFinanceReport({
        supabase,
        userId: profile.id,
        grokApiKey: profile.grok_api_key as string,
      })
    )
  );

  const generated = settled.filter((result) => result.status === "fulfilled").length;
  const failed = settled
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => String(result.reason));

  return NextResponse.json({
    ok: true,
    processed: enabledProfiles.length,
    generated,
    failed,
  });
}

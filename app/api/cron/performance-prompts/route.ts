import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const supabase = await createClient();
    let sent = 0;

    // Get previous month key (e.g., "2026-03")
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = prevMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Get active past performance records
    const { data: records } = await supabase
      .from("past_performance")
      .select("*, organizations(id, name)")
      .not("period_of_performance", "is", null);

    if (!records || records.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    for (const record of records) {
      // Check if there's already a log for the previous month
      const logs: Record<string, string>[] = record.monthly_logs ?? [];
      const hasLog = logs.some((log: Record<string, string>) => Object.keys(log).some((k) => k.startsWith(monthKey)));

      if (hasLog) continue;

      const orgId = record.organization_id;
      const orgName = record.organizations?.name ?? "Your organization";

      // Get users for this org
      const { data: users } = await supabase
        .from("users")
        .select("email, full_name")
        .eq("organization_id", orgId);

      if (!users || users.length === 0) continue;

      const html = `
        <div style="background:#f8f9fb;padding:32px;font-family:system-ui,-apple-system,sans-serif;">
          <div style="max-width:560px;margin:0 auto;">
            <h1 style="color:#0f172a;font-size:18px;margin-bottom:4px;">Monthly Performance Log Reminder</h1>
            <p style="color:#64748b;font-size:14px;margin-bottom:24px;">${orgName}</p>
            <div style="background:#ffffff;border:1px solid #e5e7eb;padding:16px;margin-bottom:16px;">
              <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px 0;">Contract</p>
              <p style="color:#0f172a;font-size:14px;margin:0 0 12px 0;">${record.contract_title}</p>
              <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px 0;">Agency</p>
              <p style="color:#0f172a;font-size:14px;margin:0 0 12px 0;">${record.agency}</p>
              <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px 0;">Missing Log For</p>
              <p style="color:#f59e0b;font-size:14px;margin:0;">${monthLabel}</p>
            </div>
            <p style="color:#64748b;font-size:13px;margin-bottom:16px;">
              No performance log was recorded for ${monthLabel}. Regular monthly logging strengthens your past performance record for future proposals.
            </p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/past-performance" style="display:inline-block;background:#2563eb;color:white;padding:8px 20px;font-size:13px;text-decoration:none;">Add Performance Log</a>
          </div>
        </div>
      `;

      for (const u of users) {
        try {
          await resend.emails.send({
            from: "ContractsIntel <reminders@contractsintel.com>",
            to: u.email,
            subject: `Performance log needed: ${record.contract_title} — ${monthLabel}`,
            html,
          });
          sent++;
        } catch (err) {
          console.error(`Failed to send performance prompt to ${u.email}:`, err);
        }
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Performance prompts error:", error);
    return NextResponse.json({ error: "Failed to send performance prompts" }, { status: 500 });
  }
}

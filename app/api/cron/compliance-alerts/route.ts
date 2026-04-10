import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const ALERT_WINDOWS = [90, 60, 30, 14, 7, 3, 1];

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const supabase = await createClient();
    let sent = 0;

    for (const days of ALERT_WINDOWS) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const dateStr = targetDate.toISOString().split("T")[0];

      // Find compliance items due on this target date
      const { data: items } = await supabase
        .from("compliance_items")
        .select("*, organizations(id, name)")
        .eq("due_date", dateStr)
        .neq("status", "complete");

      if (!items || items.length === 0) continue;

      for (const item of items) {
        const orgId = item.organization_id;
        const orgName = item.organizations?.name ?? "Your organization";

        // Get users for this org
        const { data: users } = await supabase
          .from("users")
          .select("email, full_name")
          .eq("organization_id", orgId);

        if (!users || users.length === 0) continue;

        const urgencyColor = days <= 7 ? "#ef4444" : days <= 30 ? "#f59e0b" : "#3b82f6";
        const urgencyLabel = days <= 3 ? "URGENT" : days <= 7 ? "Due Soon" : "Upcoming";

        const html = `
          <div style="background:#f8f9fb;padding:32px;font-family:system-ui,-apple-system,sans-serif;">
            <div style="max-width:560px;margin:0 auto;">
              <div style="border-left:3px solid ${urgencyColor};padding-left:16px;margin-bottom:24px;">
                <span style="color:${urgencyColor};font-size:10px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">${urgencyLabel} — ${days} day${days === 1 ? "" : "s"} remaining</span>
                <h1 style="color:#0f172a;font-size:18px;margin:8px 0 4px 0;">Compliance Alert: ${item.title}</h1>
                <p style="color:#64748b;font-size:14px;margin:0;">${orgName}</p>
              </div>
              <div style="background:#ffffff;border:1px solid #e5e7eb;padding:16px;margin-bottom:16px;">
                <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px 0;">Category</p>
                <p style="color:#0f172a;font-size:14px;margin:0 0 12px 0;">${item.category}</p>
                <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px 0;">Due Date</p>
                <p style="color:#0f172a;font-size:14px;margin:0 0 12px 0;">${new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                ${item.details ? `<p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px 0;">Details</p><p style="color:#64748b;font-size:13px;margin:0;">${item.details}</p>` : ""}
              </div>
              <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/compliance" style="display:inline-block;background:#2563eb;color:white;padding:8px 20px;font-size:13px;text-decoration:none;">View in Dashboard</a>
            </div>
          </div>
        `;

        for (const u of users) {
          try {
            await resend.emails.send({
              from: "ContractsIntel <alerts@contractsintel.com>",
              to: u.email,
              subject: `[${urgencyLabel}] ${item.title} due in ${days} day${days === 1 ? "" : "s"}`,
              html,
            });
            sent++;
          } catch (err) {
            console.error(`Failed to send compliance alert to ${u.email}:`, err);
          }
        }
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Compliance alerts error:", error);
    return NextResponse.json({ error: "Failed to send compliance alerts" }, { status: 500 });
  }
}

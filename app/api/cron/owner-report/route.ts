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

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString();

    // New signups this week
    const { count: newSignups } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgoStr);

    // Total orgs by plan
    const { data: allOrgs } = await supabase
      .from("organizations")
      .select("plan");

    const planCounts: Record<string, number> = {};
    (allOrgs ?? []).forEach((o: any) => {
      planCounts[o.plan] = (planCounts[o.plan] ?? 0) + 1;
    });

    // MRR calculation
    const prices: Record<string, number> = { discovery: 0, bd_pro: 999, team: 2500 };
    const mrr = Object.entries(planCounts).reduce((sum, [plan, count]) => sum + (prices[plan] ?? 0) * count, 0);

    // Conversions this week (plan changed from discovery)
    const { count: conversions } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .neq("plan", "discovery")
      .gte("created_at", weekAgoStr);

    // New leads this week
    const { count: newLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgoStr);

    // Opportunities scraped this week
    const { count: newOpps } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgoStr);

    const html = `
      <div style="background:#f8f9fb;padding:32px;font-family:system-ui,-apple-system,sans-serif;">
        <div style="max-width:560px;margin:0 auto;">
          <h1 style="color:#0f172a;font-size:20px;margin-bottom:4px;">Weekly Owner Report</h1>
          <p style="color:#64748b;font-size:14px;margin-bottom:24px;">
            ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>

          <div style="background:#ffffff;border:1px solid #e5e7eb;padding:16px;margin-bottom:16px;">
            <h2 style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px 0;">Growth</h2>
            <table style="width:100%;">
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">New Signups</td>
                <td style="color:#0f172a;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${newSignups ?? 0}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">New Leads</td>
                <td style="color:#0f172a;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${newLeads ?? 0}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">Conversions</td>
                <td style="color:#22c55e;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${conversions ?? 0}</td>
              </tr>
            </table>
          </div>

          <div style="background:#ffffff;border:1px solid #e5e7eb;padding:16px;margin-bottom:16px;">
            <h2 style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px 0;">Revenue</h2>
            <table style="width:100%;">
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">MRR</td>
                <td style="color:#22c55e;font-size:16px;font-family:monospace;text-align:right;padding:4px 0;">$${mrr.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">Discovery</td>
                <td style="color:#0f172a;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${planCounts["discovery"] ?? 0}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">BD Pro</td>
                <td style="color:#0f172a;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${planCounts["bd_pro"] ?? 0}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">Team</td>
                <td style="color:#0f172a;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${planCounts["team"] ?? 0}</td>
              </tr>
            </table>
          </div>

          <div style="background:#ffffff;border:1px solid #e5e7eb;padding:16px;margin-bottom:16px;">
            <h2 style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px 0;">System Health</h2>
            <table style="width:100%;">
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">Opportunities Scraped</td>
                <td style="color:#0f172a;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${newOpps ?? 0}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:13px;padding:4px 0;">Total Organizations</td>
                <td style="color:#0f172a;font-size:13px;font-family:monospace;text-align:right;padding:4px 0;">${allOrgs?.length ?? 0}</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: "ContractsIntel <system@contractsintel.com>",
      to: "support@contractsintel.com",
      subject: `Weekly Report: ${newSignups ?? 0} signups, $${mrr.toLocaleString()} MRR`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Owner report error:", error);
    return NextResponse.json({ error: "Failed to send owner report" }, { status: 500 });
  }
}

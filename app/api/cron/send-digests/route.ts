import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { sendDigestSummary } from "@/lib/webhook-notify";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY not set", sent: 0 });

    const resend = new Resend(resendKey);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch ALL orgs (don't filter by digest_enabled — column may not exist)
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name, notification_preferences");

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ success: true, sent: 0, reason: "no orgs" });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const org of orgs) {
      // Get users for this org
      const { data: users } = await supabase
        .from("users")
        .select("email, full_name")
        .eq("organization_id", org.id);

      if (!users || users.length === 0) continue;

      // Get top 10 matches with opportunities
      const { data: matches } = await supabase
        .from("opportunity_matches")
        .select("match_score, bid_recommendation, recommendation_reasoning, opportunities(*)")
        .eq("organization_id", org.id)
        .eq("is_demo", false)
        .order("match_score", { ascending: false })
        .limit(10);

      if (!matches || matches.length === 0) continue;

      const appUrl = "https://contractsintel.com";
      const firstName = users[0].full_name?.split(" ")[0] || org.name;

      const opportunityRows = matches
        .map((m: any) => {
          const opp = m.opportunities;
          if (!opp) return "";
          const deadline = opp.response_deadline
            ? new Date(opp.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "TBD";
          const value = (opp.estimated_value || opp.value_estimate)
            ? `$${Number(opp.estimated_value || opp.value_estimate).toLocaleString()}`
            : "TBD";
          const scoreColor = m.match_score >= 80 ? "#059669" : m.match_score >= 60 ? "#2563eb" : "#d97706";
          const recColor = m.bid_recommendation === "bid" ? "#059669" : m.bid_recommendation === "monitor" ? "#d97706" : "#94a3b8";
          const recLabel = m.bid_recommendation === "bid" ? "BID" : m.bid_recommendation === "monitor" ? "MONITOR" : "REVIEW";
          const title = (opp.title || "Untitled").replace(/^\[[^\]]*\]\s*/, "").substring(0, 60);

          return `<tr>
            <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
              <a href="${appUrl}/dashboard/opportunity/${opp.id}" style="color:#0f172a;text-decoration:none;font-weight:600;font-size:14px;">${title}</a>
              <div style="color:#64748b;font-size:12px;margin-top:2px;">${opp.agency || "Unknown"}</div>
            </td>
            <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">
              <span style="color:${scoreColor};font-weight:700;font-size:16px;">${m.match_score}</span>
            </td>
            <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">${value}</td>
            <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">${deadline}</td>
            <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;">
              <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;color:${recColor};background:${recColor}15;">${recLabel}</span>
            </td>
          </tr>`;
        })
        .join("");

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:15px;font-weight:700;color:#2563eb;">ContractsIntel</span>
    </div>
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="padding:24px 24px 16px;">
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:400;color:#0f172a;font-family:Georgia,serif;">Good morning, ${firstName}</h1>
        <p style="margin:0;font-size:14px;color:#64748b;">Here are your top ${matches.length} contract matches today.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:500;">Opportunity</th>
            <th style="padding:8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:500;">Score</th>
            <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:500;">Value</th>
            <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:500;">Deadline</th>
            <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:500;">Rec</th>
          </tr>
        </thead>
        <tbody>${opportunityRows}</tbody>
      </table>
      <div style="padding:16px 24px 24px;text-align:center;">
        <a href="${appUrl}/dashboard" style="display:inline-block;padding:10px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View All Matches</a>
      </div>
    </div>
    <div style="margin-top:20px;padding:16px 20px;background:white;border-radius:10px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:500;">New on ContractsIntel</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
        <strong style="color:#2563eb;">RFP Document Chat</strong> — Upload any solicitation and ask AI questions about it.
        <strong style="color:#7c3aed;">Pink-Team Review</strong> — AI scores your proposal draft before submission.
        <strong style="color:#059669;">Market Intelligence</strong> — USASpending data for your NAICS codes.
        <a href="${appUrl}/dashboard" style="color:#2563eb;text-decoration:none;font-weight:600;">Try them now →</a>
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:24px;">
      ContractsIntel — Government contract intelligence<br>
      <a href="${appUrl}/dashboard/settings" style="color:#94a3b8;">Manage email preferences</a> · <a href="${appUrl}/dashboard/settings" style="color:#94a3b8;">Set up Slack/Teams webhooks</a>
    </p>
  </div>
</body>
</html>`;

      for (const u of users) {
        try {
          await resend.emails.send({
            from: "ContractsIntel <digest@contractsintel.com>",
            replyTo: "ralph@contractsintel.com",
            to: u.email,
            subject: `${matches.length} contract matches for ${org.name}`,
            html,
          });
          sent++;
        } catch (err: any) {
          errors.push(`${u.email}: ${err?.message || "unknown"}`);
        }
      }

      // Send webhook notification if configured
      const notifPrefs = (org.notification_preferences || {}) as Record<string, any>;
      const webhookUrl = notifPrefs.webhook_url;
      const webhookPlatform = notifPrefs.webhook_platform;

      if (webhookUrl && webhookPlatform) {
        try {
          const topMatch = matches[0] as any;
          const topTitle = (topMatch.opportunities?.title || "Untitled")
            .replace(/^\[[^\]]*\]\s*/, "")
            .substring(0, 60);
          const topScore = topMatch.match_score;

          await sendDigestSummary(
            webhookUrl,
            webhookPlatform,
            matches.length,
            topTitle,
            topScore
          );
        } catch (err: any) {
          errors.push(`webhook(${org.name}): ${err?.message || "unknown"}`);
        }
      }
    }

    return NextResponse.json({ success: true, sent, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    console.error("Send digests error:", error);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

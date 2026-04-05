import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const supabase = await createClient();

    // Fetch orgs with digest enabled
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("digest_enabled", true);

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    let sent = 0;

    for (const org of orgs) {
      // Get users for this org
      const { data: users } = await supabase
        .from("users")
        .select("email, full_name")
        .eq("organization_id", org.id);

      if (!users || users.length === 0) continue;

      // Get top 10 matches
      const { data: matches } = await supabase
        .from("opportunity_matches")
        .select("match_score, bid_recommendation, reasoning, opportunities(title, agency, response_deadline, estimated_value, set_aside)")
        .eq("organization_id", org.id)
        .order("match_score", { ascending: false })
        .limit(10);

      if (!matches || matches.length === 0) continue;

      const opportunityRows = matches
        .map((m: any) => {
          const opp = m.opportunities;
          if (!opp) return "";
          const deadline = opp.response_deadline
            ? new Date(opp.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "TBD";
          const value = opp.estimated_value ? `$${Number(opp.estimated_value).toLocaleString()}` : "N/A";
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #1e2535;color:#e8edf8;font-size:13px;">${opp.title}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #1e2535;color:#8b9ab5;font-size:13px;">${opp.agency}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #1e2535;color:#8b9ab5;font-size:13px;">${value}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #1e2535;color:#8b9ab5;font-size:13px;">${deadline}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #1e2535;color:#3b82f6;font-size:13px;">${m.match_score}%</td>
          </tr>`;
        })
        .join("");

      const html = `
        <div style="background:#080a0f;padding:32px;font-family:system-ui,-apple-system,sans-serif;">
          <div style="max-width:640px;margin:0 auto;">
            <h1 style="color:#e8edf8;font-size:20px;margin-bottom:4px;">Daily Opportunity Digest</h1>
            <p style="color:#8b9ab5;font-size:14px;margin-bottom:24px;">${org.name} — Top ${matches.length} matches</p>
            <table style="width:100%;border-collapse:collapse;background:#0d1018;border:1px solid #1e2535;">
              <thead>
                <tr style="background:#111520;">
                  <th style="padding:8px 12px;text-align:left;color:#4a5a75;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">Title</th>
                  <th style="padding:8px 12px;text-align:left;color:#4a5a75;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">Agency</th>
                  <th style="padding:8px 12px;text-align:left;color:#4a5a75;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">Value</th>
                  <th style="padding:8px 12px;text-align:left;color:#4a5a75;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">Deadline</th>
                  <th style="padding:8px 12px;text-align:left;color:#4a5a75;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">Match</th>
                </tr>
              </thead>
              <tbody>${opportunityRows}</tbody>
            </table>
            <p style="color:#4a5a75;font-size:12px;margin-top:24px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard" style="color:#3b82f6;text-decoration:none;">View in Dashboard</a>
            </p>
          </div>
        </div>
      `;

      for (const u of users) {
        try {
          await resend.emails.send({
            from: "ContractsIntel <digest@contractsintel.com>",
            to: u.email,
            subject: `Daily Digest: ${matches.length} opportunities for ${org.name}`,
            html,
          });
          sent++;
        } catch (err) {
          console.error(`Failed to send digest to ${u.email}:`, err);
        }
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Send digests error:", error);
    return NextResponse.json({ error: "Failed to send digests" }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(request: NextRequest) {
  try {
    // Authenticate caller and derive org
    const authSupabase = await createAuthClient();
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userRecord } = await authSupabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const organizationId = userRecord.organization_id;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const resend = new Resend(resendApiKey);

    // Find high-score matches from the last 4 hours that haven't been notified
    const { data: matches, error: matchError } = await supabase
      .from("opportunity_matches")
      .select(`
        id,
        match_score,
        recommendation_reasoning,
        opportunity_id,
        organization_id,
        opportunities (
          id,
          title,
          agency,
          source_url,
          value_estimate,
          response_deadline
        )
      `)
      .eq("organization_id", organizationId)
      .gte("match_score", 85)
      .gte("created_at", new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
      .or("notification_sent.is.null,notification_sent.eq.false");

    if (matchError) {
      console.error("[new-match] Error querying matches:", matchError);
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({ sent: 0, message: "No new high-score matches to notify" });
    }

    // Look up org users to get email addresses
    const { data: orgUsers } = await supabase
      .from("users")
      .select("id, email")
      .eq("organization_id", organizationId);

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json({ sent: 0, message: "No users found for this organization" });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const match of matches) {
      const opp = (match as any).opportunities;
      if (!opp) continue;

      const score = match.match_score;
      const title = opp.title || "Untitled Opportunity";
      const agency = opp.agency || "Unknown Agency";
      const value = opp.value_estimate
        ? `$${(opp.value_estimate / 1_000_000).toFixed(1)}M`
        : "Not specified";
      const deadline = opp.response_deadline
        ? new Date(opp.response_deadline).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Not specified";
      const sourceUrl = opp.source_url || "#";
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.contractsintel.com"}/dashboard`;

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="border-left: 4px solid #2563eb; padding: 16px; background: #f8fafc; margin-bottom: 20px;">
            <h2 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px;">New High-Match Opportunity</h2>
            <p style="margin: 0; color: #64748b; font-size: 14px;">Match Score: <strong style="color: #2563eb;">${score}%</strong></p>
          </div>

          <h3 style="color: #0f172a; font-size: 16px; margin-bottom: 12px;">${title}</h3>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 120px;">Agency</td>
              <td style="padding: 8px 0; color: #0f172a; font-size: 13px;">${agency}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Est. Value</td>
              <td style="padding: 8px 0; color: #0f172a; font-size: 13px;">${value}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Deadline</td>
              <td style="padding: 8px 0; color: #0f172a; font-size: 13px;">${deadline}</td>
            </tr>
          </table>

          ${match.recommendation_reasoning ? `<p style="color: #475569; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${match.recommendation_reasoning}</p>` : ""}

          <div style="margin-bottom: 12px;">
            <a href="${sourceUrl}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; font-size: 13px; font-weight: 500; margin-right: 8px;">View Opportunity</a>
            <a href="${dashboardUrl}" style="display: inline-block; padding: 10px 20px; border: 1px solid #e2e8f0; color: #475569; text-decoration: none; font-size: 13px;">Open Dashboard</a>
          </div>

          <p style="color: #94a3b8; font-size: 11px; margin-top: 24px;">ContractsIntel - Government Contract Intelligence</p>
        </div>
      `;

      for (const user of orgUsers) {
        if (!user.email) continue;

        try {
          await resend.emails.send({
            from: "intel@contractsintel.com",
            to: user.email,
            subject: `New high-match opportunity: ${title.substring(0, 80)} — Score: ${score}`,
            html: htmlBody,
          });
          sent++;
        } catch (emailErr) {
          const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          console.error(`[new-match] Failed to send to ${user.email}:`, msg);
          errors.push(`${user.email}: ${msg}`);
        }
      }

      // Mark match as notified
      await supabase
        .from("opportunity_matches")
        .update({ notification_sent: true })
        .eq("id", match.id);
    }

    return NextResponse.json({
      sent,
      matches_processed: matches.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[new-match] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

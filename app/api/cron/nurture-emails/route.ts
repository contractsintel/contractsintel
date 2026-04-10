import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const NURTURE_SEQUENCE = [
  {
    stage: 0,
    days: 0,
    subject: "Your SAM.gov Audit Report is Ready",
    body: (name: string) => `
      <h1 style="color:#0f172a;font-size:18px;">Your Audit Report is Ready</h1>
      <p style="color:#64748b;font-size:14px;">Hi ${name},</p>
      <p style="color:#64748b;font-size:14px;">Thanks for running your free SAM.gov audit with ContractsIntel. Your report is ready and waiting in your dashboard.</p>
      <p style="color:#64748b;font-size:14px;">We found opportunities matched to your profile, compliance gaps to address, and actionable next steps to strengthen your government contracting position.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard" style="display:inline-block;background:#2563eb;color:white;padding:10px 24px;font-size:14px;text-decoration:none;margin-top:12px;">View Your Report</a>
    `,
  },
  {
    stage: 1,
    days: 3,
    subject: "3 things most GovCon companies miss on SAM.gov",
    body: (name: string) => `
      <h1 style="color:#0f172a;font-size:18px;">3 Common SAM.gov Mistakes</h1>
      <p style="color:#64748b;font-size:14px;">Hi ${name},</p>
      <p style="color:#64748b;font-size:14px;">After analyzing thousands of contractor profiles, we see three mistakes over and over:</p>
      <ol style="color:#64748b;font-size:14px;">
        <li style="margin-bottom:8px;"><strong style="color:#0f172a;">Wrong NAICS codes</strong> — Missing codes means missing opportunities. Most contractors list too few.</li>
        <li style="margin-bottom:8px;"><strong style="color:#0f172a;">Expired certifications</strong> — Lapsed certs can disqualify you from set-aside contracts.</li>
        <li style="margin-bottom:8px;"><strong style="color:#0f172a;">No past performance tracking</strong> — Without documented performance, you cannot compete.</li>
      </ol>
      <p style="color:#64748b;font-size:14px;">ContractsIntel monitors all of this automatically.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard" style="display:inline-block;background:#2563eb;color:white;padding:10px 24px;font-size:14px;text-decoration:none;margin-top:12px;">Check Your Profile</a>
    `,
  },
  {
    stage: 2,
    days: 7,
    subject: "Your daily opportunity digest is waiting",
    body: (name: string) => `
      <h1 style="color:#0f172a;font-size:18px;">Never Miss an Opportunity</h1>
      <p style="color:#64748b;font-size:14px;">Hi ${name},</p>
      <p style="color:#64748b;font-size:14px;">Did you know ContractsIntel scans SAM.gov daily and scores every opportunity against your company profile?</p>
      <p style="color:#64748b;font-size:14px;">Our users see an average of 12 matched opportunities per week. Enable your daily digest to get the top matches delivered to your inbox every morning.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/settings" style="display:inline-block;background:#2563eb;color:white;padding:10px 24px;font-size:14px;text-decoration:none;margin-top:12px;">Enable Daily Digest</a>
    `,
  },
  {
    stage: 3,
    days: 10,
    subject: "How BD Pro users win 3x more contracts",
    body: (name: string) => `
      <h1 style="color:#0f172a;font-size:18px;">Win More with BD Pro</h1>
      <p style="color:#64748b;font-size:14px;">Hi ${name},</p>
      <p style="color:#64748b;font-size:14px;">BD Pro members use AI-powered proposal drafts, full compliance monitoring, and past performance builders to win contracts faster.</p>
      <p style="color:#64748b;font-size:14px;">On average, BD Pro users submit proposals 60% faster and track 4x more opportunities in their pipeline.</p>
      <p style="color:#64748b;font-size:14px;">Upgrade today for $999/mo — less than a single billable hour on most government contracts.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/settings" style="display:inline-block;background:#2563eb;color:white;padding:10px 24px;font-size:14px;text-decoration:none;margin-top:12px;">Upgrade to BD Pro</a>
    `,
  },
  {
    stage: 4,
    days: 14,
    subject: "Last chance: Your pipeline is waiting",
    body: (name: string) => `
      <h1 style="color:#0f172a;font-size:18px;">Your Pipeline Needs Attention</h1>
      <p style="color:#64748b;font-size:14px;">Hi ${name},</p>
      <p style="color:#64748b;font-size:14px;">It has been two weeks since you ran your SAM.gov audit. In that time, dozens of new opportunities matching your profile have been posted.</p>
      <p style="color:#64748b;font-size:14px;">Government contracts move fast. The average response window is just 30 days. Log in today to review your matches and start building your pipeline.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/pipeline" style="display:inline-block;background:#2563eb;color:white;padding:10px 24px;font-size:14px;text-decoration:none;margin-top:12px;">View Your Pipeline</a>
    `,
  },
];

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const supabase = await createClient();
    let sent = 0;

    // Get all leads
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .lt("nurture_stage", 5);

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const now = new Date();

    for (const lead of leads) {
      const stage = lead.nurture_stage ?? 0;
      const sequence = NURTURE_SEQUENCE.find((s) => s.stage === stage);
      if (!sequence) continue;

      const createdAt = new Date(lead.created_at);
      const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceCreation < sequence.days) continue;

      const name = lead.name ?? lead.email?.split("@")[0] ?? "there";

      const html = `
        <div style="background:#f8f9fb;padding:32px;font-family:system-ui,-apple-system,sans-serif;">
          <div style="max-width:560px;margin:0 auto;">
            ${sequence.body(name)}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px 0;" />
            <p style="color:#94a3b8;font-size:11px;">ContractsIntel — Government Contracting Intelligence</p>
          </div>
        </div>
      `;

      try {
        await resend.emails.send({
          from: "ContractsIntel <hello@contractsintel.com>",
          to: lead.email,
          subject: sequence.subject,
          html,
        });
        sent++;

        // Advance nurture stage
        await supabase
          .from("leads")
          .update({ nurture_stage: stage + 1 })
          .eq("id", lead.id);
      } catch (err) {
        console.error(`Failed to send nurture email to ${lead.email}:`, err);
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Nurture emails error:", error);
    return NextResponse.json({ error: "Failed to send nurture emails" }, { status: 500 });
  }
}

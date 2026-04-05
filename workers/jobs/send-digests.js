const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const config = require('../config');

async function run() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  const resend = new Resend(config.resend.apiKey);

  // Get all active users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, company_name, plan')
    .in('plan', ['discovery', 'bdpro', 'team', 'trial']);

  if (!profiles?.length) {
    console.log('  No active subscribers for digests');
    return;
  }

  let sent = 0;

  for (const profile of profiles) {
    // Get their top matches from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: matches } = await supabase
      .from('user_matches')
      .select(`
        match_score,
        bid_recommendation,
        reasoning,
        contracts (title, agency, response_deadline, raw_json, notice_id)
      `)
      .eq('user_id', profile.id)
      .gte('created_at', yesterday)
      .order('match_score', { ascending: false })
      .limit(10);

    if (!matches?.length) continue;

    // Build digest email
    const contractRows = matches.map((m) => {
      const c = m.contracts;
      const deadline = c.response_deadline
        ? new Date(c.response_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'TBD';
      const scoreColor = m.match_score >= 70 ? '#22c55e' : m.match_score >= 40 ? '#eab308' : '#6b7280';
      const recBadge = m.bid_recommendation === 'bid'
        ? '<span style="background:#22c55e;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;">BID</span>'
        : m.bid_recommendation === 'review'
          ? '<span style="background:#eab308;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;">REVIEW</span>'
          : '<span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;">NO-BID</span>';

      return `
        <tr style="border-bottom:1px solid #1e2535;">
          <td style="padding:16px;">
            <div style="font-weight:600;color:#e8edf8;margin-bottom:4px;">${c.title}</div>
            <div style="font-size:13px;color:#8b9ab5;">${c.agency}</div>
            <div style="font-size:12px;color:#4a5a75;margin-top:4px;">${m.reasoning}</div>
          </td>
          <td style="padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:${scoreColor};">${m.match_score}</div>
          </td>
          <td style="padding:16px;text-align:center;">${recBadge}</td>
          <td style="padding:16px;text-align:center;color:#8b9ab5;font-size:13px;">${deadline}</td>
        </tr>`;
    }).join('');

    const html = `
      <div style="background:#080a0f;color:#e8edf8;font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:32px;">
        <div style="border-bottom:1px solid #1e2535;padding-bottom:16px;margin-bottom:24px;">
          <h1 style="font-size:20px;margin:0;">
            <span style="color:#2563eb;">ContractsIntel</span> Daily Brief
          </h1>
          <p style="color:#8b9ab5;font-size:13px;margin:4px 0 0;">
            ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <p style="color:#8b9ab5;margin-bottom:24px;">
          Hi ${profile.full_name || 'there'}, here are your top contract matches for today:
        </p>

        <table style="width:100%;border-collapse:collapse;background:#0d1018;border:1px solid #1e2535;">
          <thead>
            <tr style="border-bottom:1px solid #1e2535;">
              <th style="padding:12px 16px;text-align:left;color:#4a5a75;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Opportunity</th>
              <th style="padding:12px 16px;text-align:center;color:#4a5a75;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Score</th>
              <th style="padding:12px 16px;text-align:center;color:#4a5a75;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Action</th>
              <th style="padding:12px 16px;text-align:center;color:#4a5a75;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Deadline</th>
            </tr>
          </thead>
          <tbody>${contractRows}</tbody>
        </table>

        <div style="margin-top:24px;text-align:center;">
          <a href="https://contractsintel.com/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;text-decoration:none;font-weight:600;font-size:14px;">
            View All Matches →
          </a>
        </div>

        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1e2535;color:#4a5a75;font-size:11px;text-align:center;">
          ContractsIntel · <a href="https://contractsintel.com/dashboard/settings" style="color:#4a5a75;">Manage preferences</a>
        </div>
      </div>`;

    try {
      await resend.emails.send({
        from: config.resend.fromEmail,
        to: profile.email,
        subject: `${matches.length} contract matches for ${profile.company_name || 'you'} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        html,
      });
      sent++;
    } catch (err) {
      console.log(`  Failed to send digest to ${profile.email}: ${err.message}`);
    }
  }

  console.log(`  Sent ${sent} digest emails to ${profiles.length} subscribers`);
}

module.exports = { run };

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

async function run() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  // Get all users with profiles
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, company_name, naics_codes, certifications, plan')
    .neq('plan', 'cancelled');

  if (profileErr || !profiles?.length) {
    console.log(`  No active profiles to match (${profileErr?.message || '0 users'})`);
    return;
  }

  // Get contracts from last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: contracts } = await supabase
    .from('contracts')
    .select('*')
    .gte('created_at', weekAgo)
    .limit(200);

  if (!contracts?.length) {
    console.log('  No recent contracts to match');
    return;
  }

  console.log(`  Matching ${contracts.length} contracts against ${profiles.length} users`);

  for (const profile of profiles) {
    // Check which contracts already matched
    const { data: existing } = await supabase
      .from('user_matches')
      .select('contract_id')
      .eq('user_id', profile.id);

    const existingIds = new Set((existing || []).map((e) => e.contract_id));
    const newContracts = contracts.filter((c) => !existingIds.has(c.id));

    if (newContracts.length === 0) continue;

    // Use Claude to score matches
    const contractSummaries = newContracts.slice(0, 50).map((c) => ({
      id: c.id,
      title: c.title,
      agency: c.agency,
      naics: c.raw_json?.naicsCode || 'N/A',
      setAside: c.raw_json?.typeOfSetAsideDescription || 'None',
      deadline: c.response_deadline,
    }));

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are a government contracting advisor. Score how well each contract matches this company profile.

Company: ${profile.company_name || 'Unknown'}
NAICS Codes: ${(profile.naics_codes || []).join(', ') || 'Not specified'}
Certifications: ${(profile.certifications || []).join(', ') || 'None'}

Contracts to evaluate:
${JSON.stringify(contractSummaries, null, 2)}

For each contract, return a JSON array with:
- id: the contract id
- score: 0-100 match score
- recommendation: "bid" or "no-bid" or "review"
- reasoning: one sentence why

Return ONLY valid JSON array, no other text.`
        }],
      });

      const text = response.content[0].text;
      const matches = JSON.parse(text);

      const matchBatch = matches
        .filter((m) => m.score >= 20)
        .map((m) => ({
          user_id: profile.id,
          contract_id: m.id,
          match_score: m.score,
          bid_recommendation: m.recommendation,
          reasoning: m.reasoning,
        }));

      if (matchBatch.length > 0) {
        const { error: matchErr } = await supabase
          .from('user_matches')
          .upsert(matchBatch, { onConflict: 'user_id,contract_id', ignoreDuplicates: true });

        if (matchErr) console.log(`  Match error for ${profile.email}: ${matchErr.message}`);
        else console.log(`  ${profile.email}: ${matchBatch.length} matches found`);
      }
    } catch (err) {
      console.log(`  AI scoring failed for ${profile.email}: ${err.message}`);
    }
  }
}

module.exports = { run };

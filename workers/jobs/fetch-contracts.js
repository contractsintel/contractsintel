const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

async function run() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  // Get SAM API key from database
  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('key_value')
    .eq('key_name', 'sam_api_key')
    .single();

  if (!keyRow) throw new Error('SAM API key not found in api_keys table');

  const samApiKey = keyRow.key_value;

  // Build date range (last 7 days for daily runs)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

  const endpoints = [
    `https://api.sam.gov/opportunities/v2/search?api_key=${samApiKey}&postedFrom=${fmt(sevenDaysAgo)}&postedTo=${fmt(now)}&limit=1000&offset=0`,
    `https://api.sam.gov/prod/opportunities/v2/search?api_key=${samApiKey}&postedFrom=${fmt(sevenDaysAgo)}&postedTo=${fmt(now)}&limit=1000&offset=0`,
  ];

  let opportunities = [];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        opportunities = data.opportunitiesData || data.opportunities || [];
        if (opportunities.length > 0) {
          console.log(`  Fetched ${opportunities.length} opportunities from SAM.gov`);
          break;
        }
      }
    } catch (err) {
      console.log(`  SAM endpoint failed: ${err.message}`);
    }
  }

  if (opportunities.length === 0) {
    console.log('  SAM.gov returned 0 opportunities (API may be down)');
    return { contracts: 0, leads: 0 };
  }

  // Upsert contracts
  const contractBatch = opportunities.map((opp) => ({
    notice_id: opp.noticeId,
    title: opp.title || 'Untitled',
    agency: opp.fullParentPathName || 'Unknown',
    posted_date: opp.postedDate || null,
    response_deadline: opp.responseDeadLine || null,
    description: opp.description || null,
    raw_json: opp,
  }));

  const { data: upserted, error: contractErr } = await supabase
    .from('contracts')
    .upsert(contractBatch, { onConflict: 'notice_id', ignoreDuplicates: false })
    .select('notice_id');

  if (contractErr) throw new Error(`Contract upsert: ${contractErr.message}`);
  console.log(`  Upserted ${upserted?.length || 0} contracts`);

  // Extract leads
  const leadBatch = [];
  for (const opp of opportunities) {
    for (const contact of (opp.pointOfContact || [])) {
      if (contact.email) {
        leadBatch.push({
          notice_id: opp.noticeId,
          email: contact.email.toLowerCase().trim(),
          agency: opp.fullParentPathName || 'Unknown',
          contract_title: opp.title || 'Untitled',
          contact_name: contact.fullName || null,
          contact_phone: contact.phone || null,
          contact_type: contact.type || null,
        });
      }
    }
  }

  if (leadBatch.length > 0) {
    const { data: leads, error: leadErr } = await supabase
      .from('leads')
      .upsert(leadBatch, { onConflict: 'notice_id,email', ignoreDuplicates: true })
      .select('id');

    if (leadErr) console.log(`  Lead upsert warning: ${leadErr.message}`);
    else console.log(`  Upserted ${leads?.length || 0} leads`);
  }

  return { contracts: upserted?.length || 0, leads: leadBatch.length };
}

module.exports = { run };

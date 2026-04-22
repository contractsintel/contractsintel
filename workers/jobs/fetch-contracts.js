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

  // SAM caps each response at 1000 rows. High-volume windows need paging or
  // results are silently truncated. Loop with offset += limit until the page
  // is short (no more rows) or we hit a safety cap.
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 10;

  const baseEndpoints = [
    'https://api.sam.gov/opportunities/v2/search',
    'https://api.sam.gov/prod/opportunities/v2/search',
  ];

  let opportunities = [];
  const postedFromStr = fmt(sevenDaysAgo);
  const postedToStr = fmt(now);
  let hitCap = false;
  let lastPageSize = 0;

  for (const base of baseEndpoints) {
    try {
      const acc = [];
      let localHitCap = false;
      let localLastPageSize = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${base}?api_key=${samApiKey}&postedFrom=${postedFromStr}&postedTo=${postedToStr}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
        const res = await fetch(url);
        if (!res.ok) {
          // On any non-OK (including 429), stop paging this endpoint — no point burning quota.
          if (page === 0) throw new Error(`SAM returned ${res.status}`);
          break;
        }
        const data = await res.json();
        const batch = data.opportunitiesData || data.opportunities || [];
        acc.push(...batch);
        localLastPageSize = batch.length;
        if (batch.length < PAGE_SIZE) break;
        // Completed a full last page — we're exiting on the cap.
        if (page === MAX_PAGES - 1) localHitCap = true;
      }
      if (acc.length > 0) {
        opportunities = acc;
        hitCap = localHitCap;
        lastPageSize = localLastPageSize;
        console.log(`  Fetched ${opportunities.length} opportunities from SAM.gov`);
        break;
      }
    } catch (err) {
      console.log(`  SAM endpoint failed: ${err.message}`);
    }
  }

  // Pagination-cap alert: surface silent-truncation risk in cron_alerts so
  // the daily digest (PR 4) picks it up.
  if (hitCap) {
    await supabase.from('cron_alerts').insert({
      severity: 'warn',
      source: 'sam-pagination-cap-hit',
      message: `SAM pagination hit MAX_PAGES=${MAX_PAGES} cap, possible silent truncation. postedFrom=${postedFromStr} postedTo=${postedToStr}`,
      context: {
        postedFrom: postedFromStr,
        postedTo: postedToStr,
        total_ingested: opportunities.length,
        last_page_size: lastPageSize,
        max_pages: MAX_PAGES,
        page_size: PAGE_SIZE,
        route: 'workers/fetch-contracts',
      },
    });
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

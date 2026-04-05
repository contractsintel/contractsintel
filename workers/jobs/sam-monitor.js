const { Resend } = require('resend');
const config = require('../config');

async function run() {
  const endpoints = [
    `https://api.sam.gov/opportunities/v2/search?api_key=${config.sam.apiKey}&postedFrom=04/01/2026&postedTo=04/05/2026&limit=1`,
    `https://api.sam.gov/prod/opportunities/v2/search?api_key=${config.sam.apiKey}&postedFrom=04/01/2026&postedTo=04/05/2026&limit=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const count = data?.totalRecords || data?.opportunitiesData?.length || 0;
        console.log(`  SAM.gov API is BACK ONLINE! Records: ${count}`);

        // Send notification email
        const resend = new Resend(config.resend.apiKey);
        await resend.emails.send({
          from: config.resend.fromEmail,
          to: 'ralph@contractsintel.com',
          subject: '✅ SAM.gov API is back online',
          html: `
            <div style="font-family:sans-serif;padding:20px;">
              <h2>SAM.gov API is back online</h2>
              <p>The SAM.gov Opportunities API is responding successfully.</p>
              <p>Records found: <strong>${count}</strong></p>
              <p>The daily scraper will automatically pull new contracts tonight at 2 AM ET.</p>
              <p>You can also trigger a manual fetch now by visiting:</p>
              <p><a href="https://qpyskwvhgclrlychhxjk.supabase.co/functions/v1/fetch-contracts">Run fetch-contracts</a></p>
            </div>
          `,
        });
        console.log('  Notification sent to ralph@contractsintel.com');
        return { online: true, records: count };
      }
    } catch (err) {
      // Continue to next endpoint
    }
  }

  console.log('  SAM.gov API still offline (404)');
  return { online: false };
}

module.exports = { run };

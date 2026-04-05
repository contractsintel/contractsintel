const cron = require('node-cron');

console.log('ContractsIntel Workers starting...');
console.log(`Time: ${new Date().toISOString()}`);

// Daily SAM.gov fetch — 2:00 AM ET
cron.schedule('0 6 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Running: fetch-contracts`);
  try {
    await require('./jobs/fetch-contracts').run();
    console.log(`[${new Date().toISOString()}] Completed: fetch-contracts`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed: fetch-contracts`, err.message);
  }
}, { timezone: 'America/New_York' });

// Contract matching — 3:00 AM ET (after fetch)
cron.schedule('0 7 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Running: match-contracts`);
  try {
    await require('./jobs/match-contracts').run();
    console.log(`[${new Date().toISOString()}] Completed: match-contracts`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed: match-contracts`, err.message);
  }
}, { timezone: 'America/New_York' });

// Daily digest emails — 7:00 AM ET
cron.schedule('0 11 * * 1-5', async () => {
  console.log(`[${new Date().toISOString()}] Running: send-digests`);
  try {
    await require('./jobs/send-digests').run();
    console.log(`[${new Date().toISOString()}] Completed: send-digests`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed: send-digests`, err.message);
  }
}, { timezone: 'America/New_York' });

// Support inbox responder — every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Running: support-responder`);
  try {
    await require('./jobs/support-responder').run();
    console.log(`[${new Date().toISOString()}] Completed: support-responder`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed: support-responder`, err.message);
  }
});

// SAM.gov API monitor — every hour until it's back online
cron.schedule('0 * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Running: sam-monitor`);
  try {
    const result = await require('./jobs/sam-monitor').run();
    if (result.online) {
      console.log(`[${new Date().toISOString()}] SAM.gov is BACK! Triggering immediate fetch...`);
      await require('./jobs/fetch-contracts').run();
      await require('./jobs/match-contracts').run();
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed: sam-monitor`, err.message);
  }
});

console.log('Cron jobs scheduled:');
console.log('  - fetch-contracts:    2:00 AM ET daily');
console.log('  - match-contracts:    3:00 AM ET daily');
console.log('  - send-digests:       7:00 AM ET Mon-Fri');
console.log('  - support-responder:  every 10 minutes');
console.log('  - sam-monitor:        every hour (until API returns)');
console.log('Workers ready.');

const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
(async () => {
  try {
    const env = fs.readFileSync('.env', 'utf8');
    const adminLine = env.split(/\r?\n/).find(l => l.startsWith('ADMIN_KEY=')) || '';
    const admin = adminLine.split('=')[1] || '';

    const listRes = await fetch('http://localhost:6001/api/admin/social/accounts', { headers: { 'x-admin-key': admin } });
    const listJson = await listRes.json();
    const accounts = listJson.accounts || [];
    console.log(`Found ${accounts.length} accounts`);
    for (const a of accounts) {
      console.log(`Refreshing ${a.id} (${a.provider})`);
      try {
        const r = await fetch(`http://localhost:6001/api/admin/social/refresh/${a.id}`, { method: 'POST', headers: { 'x-admin-key': admin } });
        const jr = await r.json().catch(() => null);
        console.log(' ->', jr);
      } catch (e) {
        console.error(' -> error', e && e.message ? e.message : e);
      }
      await new Promise(res => setTimeout(res, 300));
    }
  } catch (e) {
    console.error('ERROR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
(async () => {
  try {
    const env = fs.readFileSync('.env', 'utf8');
    const adminLine = env.split(/\r?\n/).find(l => l.startsWith('ADMIN_KEY=')) || '';
    const admin = adminLine.split('=')[1] || '';
    const id = process.argv[2];
    if (!id) return console.error('Usage: node tools/get_account.js <ACCOUNT_ID>');
    const res = await fetch(`http://localhost:6001/api/admin/social/account/${id}`, { headers: { 'x-admin-key': admin } });
    const json = await res.text();
    console.log(json);
  } catch (e) {
    console.error('ERROR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();

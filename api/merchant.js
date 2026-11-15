export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return res.status(500).json({ error: 'Env missing' });

    const name = String(req.query.store || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing store' });

    const r = await fetch(
      `${url}/rest/v1/stores?name=eq.${encodeURIComponent(name)}` +
        `&select=name,merchant_code,status,plan,replies_quota,replies_used,plan_expires_at`,
      { headers: { Authorization: `Bearer ${key}`, apikey: key } }
    );
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
    if (!Array.isArray(data) || !data[0]) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    return res.status(200).json(data[0]);
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

function headersFor(key) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  };
}

async function getStoreId(url, key, name) {
  const r = await fetch(
    `${url}/rest/v1/stores?name=eq.${encodeURIComponent(name)}&select=id`,
    { headers: headersFor(key) }
  );
  const found = await r.json();
  return Array.isArray(found) && found[0]?.id ? found[0].id : null;
}

export default async function handler(req, res) {
  try {
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return res.status(500).json({ error: 'Env missing' });

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const name = String(req.query.store || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing store' });

    const storeId = await getStoreId(url, key, name);
    if (!storeId) return res.status(200).json({ items: [] });

    const r = await fetch(
      `${url}/rest/v1/auto_replies?store_id=eq.${storeId}` +
        `&select=id,keywords,kind,content,media_id,created_at&order=created_at.asc`,
      { headers: headersFor(key) }
    );
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
    return res.status(200).json({ items: data });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

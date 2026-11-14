export default async function handler(req, res) {
  try {
    const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
    const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: 'Env missing' });
    }

    const name = String(req.query.store || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Missing store' });
    }

    const headers = {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    };

    const storeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/stores?name=eq.${encodeURIComponent(name)}&select=id`,
      { headers }
    );
    const stores = await storeRes.json();
    const storeId = Array.isArray(stores) ? stores[0]?.id : null;
    if (!storeId) {
      return res.status(200).json({ items: [] });
    }

    const itemsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/text_items?store_id=eq.${storeId}&select=id,content,created_at&order=created_at.asc`,
      { headers }
    );
    const items = await itemsRes.json();
    if (!itemsRes.ok) {
      return res.status(500).json({ error: 'Load failed', details: items });
    }

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

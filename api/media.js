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

    if (req.method === 'GET') {
      const name = String(req.query.store || '').trim();
      if (!name) return res.status(400).json({ error: 'Missing store' });

      const storeId = await getStoreId(url, key, name);
      if (!storeId) return res.status(200).json({ items: [] });

      const r = await fetch(
        `${url}/rest/v1/media_files?store_id=eq.${storeId}&select=id,kind,storage_path,original_name,created_at&order=created_at.asc`,
        { headers: headersFor(key) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    if (req.method === 'DELETE') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const id = String(body?.id || '');
      const path = String(body?.path || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });
      if (!path || path.includes('..') || path.startsWith('/')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const fileRes = await fetch(
        `${url}/storage/v1/object/media/${encodeURI(path)}`,
        { method: 'DELETE', headers: headersFor(key) }
      );
      if (!fileRes.ok && fileRes.status !== 404) {
        const text = await fileRes.text();
        return res.status(500).json({ error: 'Storage delete failed', status: fileRes.status, details: text.slice(0, 300) });
      }

      const rowRes = await fetch(`${url}/rest/v1/media_files?id=eq.${id}`, {
        method: 'DELETE',
        headers: headersFor(key),
      });
      if (!rowRes.ok) {
        const text = await rowRes.text();
        return res.status(500).json({ error: 'Record delete failed', status: rowRes.status, details: text.slice(0, 300) });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

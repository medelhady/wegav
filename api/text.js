const MAX_CHARS = 1000;

function headersFor(key) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  };
}

async function getStoreId(url, key, name, create) {
  const r = await fetch(
    `${url}/rest/v1/stores?name=eq.${encodeURIComponent(name)}&select=id`,
    { headers: headersFor(key) }
  );
  const found = await r.json();
  if (Array.isArray(found) && found[0]?.id) return found[0].id;
  if (!create) return null;

  const c = await fetch(`${url}/rest/v1/stores`, {
    method: 'POST',
    headers: { ...headersFor(key), Prefer: 'return=representation' },
    body: JSON.stringify({ name }),
  });
  const created = await c.json();
  return Array.isArray(created) ? created[0]?.id : null;
}

async function listTexts(url, key, storeId) {
  const r = await fetch(
    `${url}/rest/v1/text_items?store_id=eq.${storeId}&select=id,content,created_at&order=created_at.asc`,
    { headers: headersFor(key) }
  );
  return { ok: r.ok, data: await r.json() };
}

async function addText(url, key, name, content) {
  const storeId = await getStoreId(url, key, name, true);
  if (!storeId) return { status: 500, body: { error: 'Could not get store id' } };

  const r = await fetch(`${url}/rest/v1/text_items`, {
    method: 'POST',
    headers: { ...headersFor(key), Prefer: 'return=representation' },
    body: JSON.stringify({ store_id: storeId, content }),
  });
  const data = await r.json();
  if (!r.ok) return { status: 500, body: { error: 'Save failed', details: data } };
  return { status: 200, body: { ok: true, item: data[0] } };
}

async function deleteText(url, key, id) {
  const r = await fetch(`${url}/rest/v1/text_items?id=eq.${id}`, {
    method: 'DELETE',
    headers: headersFor(key),
  });
  if (!r.ok) {
    const details = await r.text();
    return { status: 500, body: { error: 'Delete failed', details: details.slice(0, 300) } };
  }
  return { status: 200, body: { ok: true } };
}

export default async function handler(req, res) {
  try {
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return res.status(500).json({ error: 'Env missing' });

    if (req.method === 'GET') {
      const name = String(req.query.store || '').trim();
      if (!name) return res.status(400).json({ error: 'Missing store' });
      const storeId = await getStoreId(url, key, name, false);
      if (!storeId) return res.status(200).json({ items: [] });
      const { ok, data } = await listTexts(url, key, storeId);
      if (!ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    if (req.method === 'POST') {
      const name = String(body.store || '').trim();
      const content = String(body.content || '').trim();
      if (!name) return res.status(400).json({ error: 'Missing store' });
      if (!content) return res.status(400).json({ error: 'النص فارغ' });
      if (content.length > MAX_CHARS) {
        return res.status(400).json({ error: 'النص أطول من ' + MAX_CHARS + ' حرف' });
      }
      const out = await addText(url, key, name, content);
      return res.status(out.status).json(out.body);
    }

    if (req.method === 'DELETE') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });
      const out = await deleteText(url, key, id);
      return res.status(out.status).json(out.body);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

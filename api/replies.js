const TEXT_MAX = 1000;
const KEYWORDS_MAX = 20;
const KEYWORD_LEN_MAX = 60;

function headersFor(key) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  };
}

function normalize(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseKeywords(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[,،\n]/);
  const cleaned = list.map(normalize).filter(Boolean);
  return [...new Set(cleaned)];
}

async function getStoreId(url, key, name) {
  const r = await fetch(
    `${url}/rest/v1/stores?name=eq.${encodeURIComponent(name)}&select=id`,
    { headers: headersFor(key) }
  );
  const found = await r.json();
  return Array.isArray(found) && found[0]?.id ? found[0].id : null;
}

async function findConflicts(url, key, storeId, keywords) {
  const r = await fetch(
    `${url}/rest/v1/auto_replies?store_id=eq.${storeId}&select=id,keywords`,
    { headers: headersFor(key) }
  );
  const rows = await r.json();
  if (!Array.isArray(rows)) return [];
  const conflicts = [];
  for (const row of rows) {
    for (const k of row.keywords || []) {
      if (keywords.includes(k)) conflicts.push(k);
    }
  }
  return [...new Set(conflicts)];
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
        `${url}/rest/v1/auto_replies?store_id=eq.${storeId}` +
          `&select=id,keywords,kind,content,media_id,created_at&order=created_at.asc`,
        { headers: headersFor(key) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    if (req.method === 'POST') {
      const name = String(body.store || '').trim();
      const kind = String(body.kind || '');
      const keywords = parseKeywords(body.keywords);

      if (!name) return res.status(400).json({ error: 'Missing store' });
      if (!['text', 'audio', 'image', 'video'].includes(kind)) {
        return res.status(400).json({ error: 'Invalid kind' });
      }
      if (keywords.length === 0) {
        return res.status(400).json({ error: 'اكتب كلمة واحدة على الأقل' });
      }
      if (keywords.length > KEYWORDS_MAX) {
        return res.status(400).json({ error: 'أقصى عدد للكلمات ' + KEYWORDS_MAX });
      }
      if (keywords.some(k => k.length > KEYWORD_LEN_MAX)) {
        return res.status(400).json({ error: 'إحدى الكلمات طويلة جداً' });
      }

      let content = null;
      let mediaId = null;
      if (kind === 'text') {
        content = String(body.content || '').trim();
        if (!content) return res.status(400).json({ error: 'الرد النصي فارغ' });
        if (content.length > TEXT_MAX) {
          return res.status(400).json({ error: 'الرد أطول من ' + TEXT_MAX + ' حرف' });
        }
      } else {
        mediaId = String(body.media_id || '');
        if (!/^[0-9a-f-]{36}$/i.test(mediaId)) {
          return res.status(400).json({ error: 'اختر ملفاً صالحاً' });
        }
      }

      const storeId = await getStoreId(url, key, name);
      if (!storeId) return res.status(404).json({ error: 'المتجر غير موجود' });

      const conflicts = await findConflicts(url, key, storeId, keywords);
      if (conflicts.length > 0) {
        return res.status(409).json({
          error: 'هذه الكلمات مستخدمة في رد آخر: ' + conflicts.join('، '),
        });
      }

      const r = await fetch(`${url}/rest/v1/auto_replies`, {
        method: 'POST',
        headers: { ...headersFor(key), Prefer: 'return=representation' },
        body: JSON.stringify({
          store_id: storeId,
          keywords,
          kind,
          content,
          media_id: mediaId,
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Save failed', details: data });
      return res.status(200).json({ ok: true, item: data[0] });
    }

    if (req.method === 'DELETE') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });

      const r = await fetch(`${url}/rest/v1/auto_replies?id=eq.${id}`, {
        method: 'DELETE',
        headers: headersFor(key),
      });
      if (!r.ok) return res.status(500).json({ error: 'Delete failed', status: r.status });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

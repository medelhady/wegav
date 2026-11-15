const KEYWORD_MAX = 60;
const TEXT_MAX = 1000;

function headersFor(key) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  };
}

// تطبيع الكلمة: حروف صغيرة، بدون تشكيل، ومسافات مفردة
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
        `${url}/rest/v1/auto_replies?store_id=eq.${storeId}` +
          `&select=id,keyword,kind,content,media_id,created_at&order=created_at.asc`,
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
      const keyword = body.keyword ? normalize(body.keyword) : null;
      if (!name) return res.status(400).json({ error: 'Missing store' });
      if (!['text', 'audio', 'image', 'video'].includes(kind)) {
        return res.status(400).json({ error: 'Invalid kind' });
      }
      if (keyword && keyword.length > KEYWORD_MAX) {
        return res.status(400).json({ error: 'الكلمة طويلة جداً' });
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

      const r = await fetch(`${url}/rest/v1/auto_replies`, {
        method: 'POST',
        headers: { ...headersFor(key), Prefer: 'return=representation' },
        body: JSON.stringify({
          store_id: storeId,
          keyword,
          kind,
          content,
          media_id: mediaId,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        const dup = JSON.stringify(data).includes('duplicate');
        return res.status(dup ? 409 : 500).json({
          error: dup ? 'هذه الكلمة موجودة مسبقاً في ردودك' : 'Save failed',
          details: data,
        });
      }
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

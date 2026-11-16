const KEY_RE = /^[A-Za-z]{3,60}$/;
const MAX_LEN = 1000;

function sbHeaders(key) {
  return { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
}

export default async function handler(req, res) {
  try {
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const adminPass = (process.env.ADMIN_PASSWORD || '').trim();
    if (!url || !key || !adminPass) return res.status(500).json({ error: 'Env missing' });

    const pass = String(req.headers['x-admin-password'] || '');
    if (pass !== adminPass) return res.status(401).json({ error: 'كلمة السر غير صحيحة' });

    if (req.method === 'GET') {
      const r = await fetch(
        `${url}/rest/v1/bot_messages?select=key,label,value,default_value&order=key.asc`,
        { headers: sbHeaders(key) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      body = body || {};

      const k = String(body.key || '');
      if (!KEY_RE.test(k)) return res.status(400).json({ error: 'مفتاح غير صالح' });

      let value;
      if (body.restore) {
        const gr = await fetch(
          `${url}/rest/v1/bot_messages?key=eq.${k}&select=default_value`,
          { headers: sbHeaders(key) }
        );
        const rows = await gr.json();
        if (!Array.isArray(rows) || !rows[0]) return res.status(404).json({ error: 'الرسالة غير موجودة' });
        value = rows[0].default_value;
      } else {
        value = String(body.value || '').trim();
        if (!value) return res.status(400).json({ error: 'النص فارغ' });
        if (value.length > MAX_LEN) {
          return res.status(400).json({ error: 'النص أطول من ' + MAX_LEN + ' حرف' });
        }
      }

      const pr = await fetch(`${url}/rest/v1/bot_messages?key=eq.${k}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
        body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
      });
      if (!pr.ok) return res.status(500).json({ error: 'Update failed' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

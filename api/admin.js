function sbHeaders(key) {
  return { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
}

export default async function handler(req, res) {
  try {
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const adminPass = (process.env.ADMIN_PASSWORD || '').trim();
    if (!url || !key || !adminPass) return res.status(500).json({ error: 'Env missing' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    // كل الطلبات تتطلب كلمة السر
    const pass = String(req.headers['x-admin-password'] || '');
    if (pass !== adminPass) return res.status(401).json({ error: 'كلمة السر غير صحيحة' });

    if (req.method === 'GET') {
      const r = await fetch(
        `${url}/rest/v1/stores?select=id,name,phone,merchant_code,status,plan,replies_quota,replies_used,plan_expires_at,created_at&order=created_at.desc`,
        { headers: sbHeaders(key) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    if (req.method === 'POST') {
      const id = String(body.id || '');
      const action = String(body.action || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });

      let patch = null;
      if (action === 'pause') patch = { status: 'paused' };
      else if (action === 'suspend') patch = { status: 'suspended' };
      else if (action === 'activate') patch = { status: 'active' };
      else if (action === 'paid') {
        const quota = Number(body.quota || 500);
        const months = Number(body.months || 1);
        const expires = new Date();
        expires.setMonth(expires.getMonth() + months);
        patch = {
          plan: 'paid',
          replies_quota: quota,
          replies_used: 0,
          plan_expires_at: expires.toISOString(),
          status: 'active',
        };
      } else if (action === 'reset') {
        patch = { replies_used: 0 };
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const r = await fetch(`${url}/rest/v1/stores?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return res.status(500).json({ error: 'Update failed' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

const TRIAL_REPLIES = 50;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return res.status(500).json({ error: 'Env missing' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const phone = String(body.phone || '').replace(/\D/g, '');
    const name = String(body.name || '').trim();

    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
    }
    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ error: 'اسم المتجر يجب أن يكون بين 2 و 60 حرفاً' });
    }

    const headers = {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    };

    // 1) هل الرقم مسجل مسبقاً؟
    const existRes = await fetch(
      `${url}/rest/v1/stores?phone=eq.${phone}&select=name,merchant_code,status`,
      { headers }
    );
    const exist = await existRes.json();
    if (Array.isArray(exist) && exist[0]) {
      return res.status(409).json({
        error: 'هذا الرقم مسجل مسبقاً',
        merchant_code: exist[0].merchant_code,
      });
    }

    // 2) توليد كود فريد من 3 أرقام (100 إلى 999)
    let code = null;
    for (let i = 0; i < 30 && !code; i++) {
      const candidate = String(100 + Math.floor(Math.random() * 900));
      const check = await fetch(
        `${url}/rest/v1/stores?merchant_code=eq.${candidate}&select=id`,
        { headers }
      );
      const taken = await check.json();
      if (Array.isArray(taken) && taken.length === 0) code = candidate;
    }
    if (!code) {
      return res.status(500).json({ error: 'تعذر توليد كود، حاول مرة أخرى' });
    }

    // 3) إنشاء الحساب بالتجربة المجانية
    const createRes = await fetch(`${url}/rest/v1/stores`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        name,
        phone,
        merchant_code: code,
        status: 'active',
        plan: 'trial',
        replies_quota: TRIAL_REPLIES,
        replies_used: 0,
      }),
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      return res.status(500).json({ error: 'فشل إنشاء الحساب', details: created });
    }

    return res.status(200).json({
      ok: true,
      name,
      phone,
      merchant_code: code,
      replies_quota: TRIAL_REPLIES,
    });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

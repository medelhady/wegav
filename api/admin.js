function sbHeaders(key) {
  return { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
}

async function sbDelete(url, key, path) {
  return fetch(`${url}${path}`, {
    method: 'DELETE',
    headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
  });
}

async function deleteStoreData(url, key, storeId) {
  const mr = await fetch(
    `${url}/rest/v1/media_files?store_id=eq.${storeId}&select=storage_path`,
    { headers: sbHeaders(key) }
  );
  const files = await mr.json();
  if (Array.isArray(files) && files.length > 0) {
    const paths = files.map(f => f.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await fetch(`${url}/storage/v1/object/media`, {
        method: 'DELETE',
        headers: sbHeaders(key),
        body: JSON.stringify({ prefixes: paths }),
      });
    }
  }

  const r = await sbDelete(url, key, `/rest/v1/stores?id=eq.${storeId}`);
  if (!r.ok) {
    const text = await r.text();
    throw new Error('فشل حذف المتجر: ' + text.slice(0, 200));
  }
}

function toInt(v, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
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

    const pass = String(req.headers['x-admin-password'] || '');
    if (pass !== adminPass) return res.status(401).json({ error: 'كلمة السر غير صحيحة' });

    if (req.method === 'GET') {
      // قائمة الأكواد النشطة: ?codes=1
      if (req.query && req.query.codes === '1') {
        const now = encodeURIComponent(new Date().toISOString());
        const r = await fetch(
          `${url}/rest/v1/access_codes?expires_at=gt.${now}&revoked=eq.false&select=id,code,topic,kind,bound_phone,expires_at,stores(name)&order=created_at.desc&limit=300`,
          { headers: sbHeaders(key) }
        );
        const data = await r.json();
        if (!r.ok) return res.status(500).json({ error: 'Load codes failed', details: data });
        return res.status(200).json({ items: data });
      }

      const r = await fetch(
        `${url}/rest/v1/stores?select=id,name,phone,merchant_code,status,plan,replies_quota,replies_used,plan_expires_at,private_enabled,public_codes_enabled,notify_quota,notify_unit_price,notify_used,created_at&order=created_at.desc`,
        { headers: sbHeaders(key) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    if (req.method === 'POST') {
      const action = String(body.action || '');

      // إلغاء كود معين: يستخدم معرّف الكود وليس معرّف المتجر
      if (action === 'revoke_code') {
        const cid = String(body.code_id || '');
        if (!/^[0-9a-f-]{36}$/i.test(cid)) return res.status(400).json({ error: 'Invalid code id' });
        const r = await fetch(`${url}/rest/v1/access_codes?id=eq.${cid}`, {
          method: 'PATCH',
          headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
          body: JSON.stringify({ revoked: true }),
        });
        if (!r.ok) return res.status(500).json({ error: 'Revoke failed' });
        return res.status(200).json({ ok: true });
      }

      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });

      if (action === 'delete') {
        const confirmName = String(body.confirm_name || '').trim();
        const sr = await fetch(
          `${url}/rest/v1/stores?id=eq.${id}&select=name`,
          { headers: sbHeaders(key) }
        );
        const [store] = await sr.json();
        if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });
        if (confirmName !== store.name) {
          return res.status(400).json({ error: 'اسم التأكيد غير مطابق' });
        }
        await deleteStoreData(url, key, id);
        return res.status(200).json({ ok: true });
      }

      let patch = null;
      if (action === 'pause') patch = { status: 'paused' };
      else if (action === 'suspend') patch = { status: 'suspended' };
      else if (action === 'activate') patch = { status: 'active' };
      else if (action === 'private_on') patch = { private_enabled: true };
      else if (action === 'private_off') patch = { private_enabled: false };
      else if (action === 'public_on') patch = { public_codes_enabled: true };
      else if (action === 'public_off') patch = { public_codes_enabled: false };
      else if (action === 'notify_set') {
        const quota = toInt(body.quota, 100000);
        const unit = toInt(body.unit_price, 1000000);
        if (quota === null) return res.status(400).json({ error: 'عدد الإشعارات غير صالح' });
        if (unit === null) return res.status(400).json({ error: 'سعر الإشعار غير صالح' });
        patch = { notify_quota: quota, notify_unit_price: unit };
      }
      else if (action === 'notify_reset') {
        patch = { notify_used: 0 };
      }
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

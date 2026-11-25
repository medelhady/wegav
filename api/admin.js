const GRAPH = 'https://graph.facebook.com/v21.0';

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
  await fetch(`${url}/rest/v1/wa_sessions?active_store_id=eq.${storeId}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
    body: JSON.stringify({ active_store_id: null, access_code_id: null, state: 'idle' }),
  }).catch(() => null);

  const tables = ['access_redemptions', 'access_codes', 'auto_replies', 'store_customers'];
  for (const t of tables) {
    await fetch(`${url}/rest/v1/${t}?store_id=eq.${storeId}`, {
      method: 'DELETE',
      headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
    }).catch(() => null);
  }

  const mr = await fetch(
    `${url}/rest/v1/media_files?store_id=eq.${storeId}&select=storage_path`,
    { headers: sbHeaders(key) }
  );
  const files = await mr.json().catch(() => []);
  if (Array.isArray(files) && files.length > 0) {
    const paths = files.map(f => f.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await fetch(`${url}/storage/v1/object/media`, {
        method: 'DELETE',
        headers: sbHeaders(key),
        body: JSON.stringify({ prefixes: paths }),
      }).catch(() => null);
    }
  }
  await fetch(`${url}/rest/v1/media_files?store_id=eq.${storeId}`, {
    method: 'DELETE',
    headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
  }).catch(() => null);

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

async function verifyWhatsAppNumber(phoneNumberId, token) {
  const r = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) {
    return { ok: false, error: d?.error?.message || 'تعذر الوصول إلى الرقم بهذا التوكن' };
  }
  return {
    ok: true,
    display: d.display_phone_number || '',
    verified_name: d.verified_name || '',
  };
}

async function subscribeWaba(wabaId, token) {
  const r = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) {
    return { ok: false, error: d?.error?.message || 'خطأ غير معروف' };
  }
  return { ok: true };
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
        `${url}/rest/v1/stores?select=id,name,phone,merchant_code,status,plan,replies_quota,replies_used,plan_expires_at,private_enabled,public_codes_enabled,notify_quota,notify_unit_price,notify_used,wa_phone_number_id,wa_display_phone,wa_verified_name,created_at&order=created_at.desc`,
        { headers: sbHeaders(key) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    if (req.method === 'POST') {
      const action = String(body.action || '');

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

      if (action === 'wa_connect') {
        const phoneNumberId = String(body.phone_number_id || '').trim();
        const wabaId = String(body.waba_id || '').trim();
        const token = String(body.token || '').trim();

        if (!/^\d{5,25}$/.test(phoneNumberId)) {
          return res.status(400).json({ error: 'معرّف الرقم (Phone Number ID) غير صالح' });
        }
        if (!/^\d{5,25}$/.test(wabaId)) {
          return res.status(400).json({ error: 'معرّف حساب واتساب للأعمال (WABA ID) غير صالح' });
        }
        if (token.length < 20) {
          return res.status(400).json({ error: 'التوكن قصير جداً' });
        }

        const saveRes = await fetch(`${url}/rest/v1/stores?id=eq.${id}`, {
          method: 'PATCH',
          headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
          body: JSON.stringify({
            wa_phone_number_id: phoneNumberId,
            wa_token: token,
          }),
        });
        if (!saveRes.ok) {
          const text = await saveRes.text();
          if (text.includes('duplicate') || text.includes('23505')) {
            return res.status(400).json({ error: 'هذا الرقم مربوط بمتجر آخر' });
          }
          return res.status(500).json({ error: 'فشل الحفظ في قاعدة البيانات: ' + text.slice(0, 200) });
        }

        const check = await verifyWhatsAppNumber(phoneNumberId, token);
        if (check.ok) {
          await fetch(`${url}/rest/v1/stores?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
            body: JSON.stringify({
              wa_display_phone: check.display,
              wa_verified_name: check.verified_name,
            }),
          }).catch(() => null);
        }

        const sub = await subscribeWaba(wabaId, token);

        return res.status(200).json({
          ok: true,
          saved: true,
          verified: check.ok,
          verify_error: check.ok ? null : check.error,
          subscribed: sub.ok,
          subscribe_error: sub.ok ? null : sub.error,
          display: check.ok ? check.display : '',
        });
      }

      if (action === 'wa_disconnect') {
        const r = await fetch(`${url}/rest/v1/stores?id=eq.${id}`, {
          method: 'PATCH',
          headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
          body: JSON.stringify({
            wa_phone_number_id: null,
            wa_token: null,
            wa_display_phone: null,
            wa_verified_name: null,
          }),
        });
        if (!r.ok) return res.status(500).json({ error: 'فشل فصل الرقم' });
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

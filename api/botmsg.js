export const config = {
  api: { bodyParser: false },
};

const KEY_RE = /^[A-Za-z]{3,60}$/;
const TEXT_MAX = 1000;
const MAX_BYTES = 4 * 1024 * 1024;
const KINDS = ['audio', 'image', 'video'];
const ALL_KINDS = ['text', ...KINDS];

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sbHeaders(key) {
  return { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
}

async function getRow(url, key, k) {
  const r = await fetch(
    `${url}/rest/v1/bot_messages?key=eq.${k}&select=kind,media_path,default_value`,
    { headers: sbHeaders(key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function patchRow(url, key, k, patch) {
  const r = await fetch(`${url}/rest/v1/bot_messages?key=eq.${k}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('update failed');
}

async function removeFile(url, key, path) {
  if (!path) return;
  await fetch(`${url}/storage/v1/object/media`, {
    method: 'DELETE',
    headers: sbHeaders(key),
    body: JSON.stringify({ prefixes: [path] }),
  });
}

async function handleUpload(url, key, req, res, raw, k) {
  const kind = String(req.headers['x-media-kind'] || '');
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'نوع الملف غير صالح' });
  if (raw.length === 0) return res.status(400).json({ error: 'الملف فارغ' });
  if (raw.length > MAX_BYTES) {
    return res.status(413).json({ error: 'الملف أكبر من 4 ميغابايت' });
  }

  const row = await getRow(url, key, k);
  if (!row) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  const ext = String(req.headers['x-file-ext'] || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const contentType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
  const path = `bot/${k}/${Date.now()}.${ext}`;

  const up = await fetch(`${url}/storage/v1/object/media/${encodeURI(path)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: raw,
  });
  if (!up.ok) {
    const details = await up.text();
    return res.status(500).json({ error: 'فشل رفع الملف', details: details.slice(0, 200) });
  }

  await patchRow(url, key, k, { kind, media_path: path });
  if (row.media_path) await removeFile(url, key, row.media_path);
  return res.status(200).json({ ok: true, path });
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
        `${url}/rest/v1/bot_messages?select=key,label,value,default_value,kind,media_path&order=key.asc`,
        { headers: sbHeaders(key) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Load failed', details: data });
      return res.status(200).json({ items: data });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const raw = await readBody(req);

    // رفع ملف: الطلب يحمل ترويسة X-Msg-Key
    const msgKey = String(req.headers['x-msg-key'] || '');
    if (msgKey) {
      if (!KEY_RE.test(msgKey)) return res.status(400).json({ error: 'مفتاح غير صالح' });
      return handleUpload(url, key, req, res, raw, msgKey);
    }

    let body = {};
    try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { body = {}; }

    const k = String(body.key || '');
    if (!KEY_RE.test(k)) return res.status(400).json({ error: 'مفتاح غير صالح' });

    const row = await getRow(url, key, k);
    if (!row) return res.status(404).json({ error: 'الرسالة غير موجودة' });

    if (body.restore) {
      await removeFile(url, key, row.media_path);
      await patchRow(url, key, k, { value: row.default_value, kind: 'text', media_path: null });
      return res.status(200).json({ ok: true });
    }

    if (body.remove_media) {
      await removeFile(url, key, row.media_path);
      await patchRow(url, key, k, { kind: 'text', media_path: null });
      return res.status(200).json({ ok: true });
    }

    if (body.kind !== undefined) {
      const kind = String(body.kind);
      if (!ALL_KINDS.includes(kind)) return res.status(400).json({ error: 'نوع غير صالح' });
      if (kind === 'text') {
        await removeFile(url, key, row.media_path);
        await patchRow(url, key, k, { kind: 'text', media_path: null });
      } else {
        await patchRow(url, key, k, { kind });
      }
      return res.status(200).json({ ok: true });
    }

    if (body.value !== undefined) {
      const value = String(body.value).trim();
      if (!value) return res.status(400).json({ error: 'النص فارغ' });
      if (value.length > TEXT_MAX) {
        return res.status(400).json({ error: 'النص أطول من ' + TEXT_MAX + ' حرف' });
      }
      await patchRow(url, key, k, { value });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'لا يوجد تغيير' });
  } catch (err) {
    return res.status(500).json({ error: 'exception', message: String(err?.message || err) });
  }
}

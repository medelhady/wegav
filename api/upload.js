export const config = {
  api: { bodyParser: false },
};

const BUCKET = 'media';
const MAX_BYTES = 4 * 1024 * 1024;
const KINDS = ['audio', 'image', 'video'];

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function safeFileName(ext) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}.${ext}`;
}

async function parseRes(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
}

async function handleUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Env missing', hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_KEY });
  }

  let storeName = '';
  try {
    storeName = decodeURIComponent(req.headers['x-store-name'] || '').trim();
  } catch {
    storeName = '';
  }
  if (!storeName) {
    return res.status(400).json({ error: 'Missing store name' });
  }

  const kind = String(req.headers['x-media-kind'] || '');
  if (!KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Invalid media kind' });
  }

  const ext = String(req.headers['x-file-ext'] || 'bin')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase() || 'bin';

  const contentType = req.headers['content-type'] || 'application/octet-stream';

  const body = await readBody(req);
  if (body.length === 0) {
    return res.status(400).json({ error: 'Empty file' });
  }
  if (body.length > MAX_BYTES) {
    return res.status(413).json({ error: 'File too large (max 4MB)' });
  }

  const jsonHeaders = {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
  };

  // 1) البحث عن المتجر أو إنشاؤه
  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/stores?name=eq.${encodeURIComponent(storeName)}&select=id`,
    { headers: jsonHeaders }
  );
  const found = await parseRes(findRes);
  if (!findRes.ok) {
    return res.status(500).json({ step: 'find-store', status: findRes.status, details: found });
  }
  let storeId = Array.isArray(found) ? found[0]?.id : undefined;

  if (!storeId) {
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/stores`, {
      method: 'POST',
      headers: { ...jsonHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ name: storeName }),
    });
    const created = await parseRes(createRes);
    if (!createRes.ok) {
      return res.status(500).json({ step: 'create-store', status: createRes.status, details: created });
    }
    storeId = Array.isArray(created) ? created[0]?.id : undefined;
  }

  if (!storeId) {
    return res.status(500).json({ step: 'store-id', error: 'Could not get store id' });
  }

  // 2) المسار يعتمد على معرّف المتجر (لاتيني دائماً) وليس على الاسم العربي
  const path = `${storeId}/${kind}/${safeFileName(ext)}`;
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body,
  });
  if (!uploadRes.ok) {
    const details = await parseRes(uploadRes);
    return res.status(500).json({ step: 'upload', status: uploadRes.status, details });
  }

  // 3) تسجيل الملف في جدول media_files
  const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/media_files`, {
    method: 'POST',
    headers: { ...jsonHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      store_id: storeId,
      kind,
      storage_path: path,
      mime_type: contentType,
      size_bytes: body.length,
    }),
  });
  if (!saveRes.ok) {
    const details = await parseRes(saveRes);
    return res.status(500).json({ step: 'save-record', status: saveRes.status, details });
  }

  return res.status(200).json({ ok: true, store: storeName, kind, path });
}

export default async function handler(req, res) {
  try {
    return await handleUpload(req, res);
  } catch (err) {
    return res.status(500).json({
      step: 'exception',
      message: String(err?.message || err),
      cause: String(err?.cause?.message || err?.cause || ''),
    });
  }
}

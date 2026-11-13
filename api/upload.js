export const config = {
  api: { bodyParser: false },
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server is not configured' });
  }

  const rawStore = req.headers['x-store-name'] || '';
  let storeName = '';
  try {
    storeName = decodeURIComponent(rawStore).trim();
  } catch {
    storeName = '';
  }
  if (!storeName) {
    return res.status(400).json({ error: 'Missing store name' });
  }

  const folder = storeName.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 50) || 'store';

  const ext = (req.headers['x-file-ext'] || 'bin')
    .toString()
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase() || 'bin';

  const contentType = req.headers['content-type'] || 'application/octet-stream';

  const body = await readBody(req);
  if (body.length === 0) {
    return res.status(400).json({ error: 'Empty file' });
  }
  if (body.length > 4 * 1024 * 1024) {
    return res.status(413).json({ error: 'File too large (max 4MB)' });
  }

  const fileName = `${Date.now()}.${ext}`;
  const path = `${encodeURIComponent(folder)}/${fileName}`;
  const url = `${SUPABASE_URL}/storage/v1/object/voices/${path}`;

  const uploadRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body,
  });

  const data = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    return res.status(500).json({ error: 'Upload failed', details: data });
  }

  return res.status(200).json({ ok: true, store: storeName, path: `${folder}/${fileName}` });
}

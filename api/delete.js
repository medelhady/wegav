export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Env missing' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const path = String(body?.path || '');
  if (!path || path.includes('..') || path.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const headers = {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  };

  // 1) حذف الملف من التخزين
  const fileRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/media/${encodeURI(path)}`,
    { method: 'DELETE', headers }
  );
  if (!fileRes.ok && fileRes.status !== 404) {
    const text = await fileRes.text();
    return res.status(500).json({ error: 'Storage delete failed', status: fileRes.status, details: text.slice(0, 300) });
  }

  // 2) حذف السجل من جدول media_files
  const rowRes = await fetch(
    `${SUPABASE_URL}/rest/v1/media_files?storage_path=eq.${encodeURIComponent(path)}`,
    { method: 'DELETE', headers }
  );
  if (!rowRes.ok) {
    const text = await rowRes.text();
    return res.status(500).json({ error: 'Record delete failed', status: rowRes.status, details: text.slice(0, 300) });
  }

  return res.status(200).json({ ok: true });
}

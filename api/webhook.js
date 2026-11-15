const GRAPH = 'https://graph.facebook.com/v21.0';
const BUCKET = 'media';
const MAX_BYTES = 4 * 1024 * 1024;
const TEXT_MAX = 1000;
const KEYWORDS_MAX = 20;
const KEYWORD_LEN_MAX = 60;
const MEDIA_TYPES = ['audio', 'image', 'video'];

const EXT_BY_MIME = {
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr', 'audio/aac': 'aac',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
};

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

function parseKeywords(text) {
  const list = String(text || '').split(/[,،\n]/).map(normalize).filter(Boolean);
  return [...new Set(list)];
}

const ADD_CMD = normalize('إضافة');
const CANCEL_CMD = normalize('إلغاء');

function sbHeaders(key) {
  return { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
}

async function sbInsert(cfg, table, row) {
  const r = await fetch(`${cfg.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(table + ' insert failed: ' + JSON.stringify(d).slice(0, 200));
  return d[0];
}

async function getSession(cfg, phone) {
  const r = await fetch(`${cfg.url}/rest/v1/wa_sessions?phone=eq.${phone}&select=*`, {
    headers: sbHeaders(cfg.key),
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : { phone, state: 'idle' };
}

async function setSession(cfg, phone, patch) {
  const r = await fetch(`${cfg.url}/rest/v1/wa_sessions?on_conflict=phone`, {
    method: 'POST',
    headers: { ...sbHeaders(cfg.key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ phone, ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('session save failed');
}

async function findStoreByPhone(cfg, from) {
  // رقم واتساب يأتي بمفتاح الدولة 222، ونخزّنه غالباً بدونه
  const local = from.length > 8 && from.startsWith('222') ? from.slice(3) : from;
  const r = await fetch(
    `${cfg.url}/rest/v1/stores?phone=in.(${from},${local})&select=id,name,status`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function findConflicts(cfg, storeId, keywords) {
  const r = await fetch(
    `${cfg.url}/rest/v1/auto_replies?store_id=eq.${storeId}&select=keywords`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  const hit = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const k of row.keywords || []) {
      if (keywords.includes(k)) hit.add(k);
    }
  }
  return [...hit];
}

async function sendText(cfg, phoneNumberId, to, body) {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) console.error('send failed', r.status, (await r.text()).slice(0, 200));
}

// تحميل الملف من Meta ثم حفظه في Supabase وتسجيله في media_files
async function storeIncomingMedia(cfg, store, msg, type) {
  const obj = msg[type] || {};
  if (!obj.id) throw new Error('no media id');

  const metaRes = await fetch(`${GRAPH}/${obj.id}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const meta = await metaRes.json();
  if (!meta.url) throw new Error('no media url');
  if (meta.file_size && meta.file_size > MAX_BYTES) throw new Error('file too large');

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!fileRes.ok) throw new Error('media download failed');
  const buf = Buffer.from(await fileRes.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('file too large');

  const mime = String(obj.mime_type || meta.mime_type || 'application/octet-stream').split(';')[0];
  const ext = EXT_BY_MIME[mime] || 'bin';
  const path = `${store.id}/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const up = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      apikey: cfg.key,
      'Content-Type': mime,
      'x-upsert': 'false',
    },
    body: buf,
  });
  if (!up.ok) throw new Error('storage upload failed');

  const row = await sbInsert(cfg, 'media_files', {
    store_id: store.id,
    kind: type,
    storage_path: path,
    original_name: obj.filename || `${type}.${ext}`,
    mime_type: mime,
    size_bytes: buf.length,
  });
  return row.id;
}

async function handleMessage(cfg, phoneNumberId, msg) {
  const from = String(msg.from || '');
  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';
  const cmd = normalize(text);
  const isMedia = MEDIA_TYPES.includes(type);

  const store = await findStoreByPhone(cfg, from);
  if (!store) {
    return sendText(cfg, phoneNumberId, from,
      'مرحباً، أرسل كود المتجر المكون من 3 أرقام للحصول على الردود.');
  }

  if (store.status !== 'active') {
    return sendText(cfg, phoneNumberId, from, 'حسابك موقوف حالياً، تواصل مع الإدارة.');
  }

  const session = await getSession(cfg, from);

  if (cmd === CANCEL_CMD || text === '0') {
    await setSession(cfg, from, { state: 'idle', keywords: [], pending_text: null, pending_media_id: null });
    return sendText(cfg, phoneNumberId, from, 'تم الإلغاء. أرسل "إضافة" لإضافة رد جديد.');
  }

  if (cmd === ADD_CMD) {
    await setSession(cfg, from, { state: 'await_reply', keywords: [], pending_text: null, pending_media_id: null });
    return sendText(cfg, phoneNumberId, from,
      'أرسل الرد الآن: نص، أو صوت، أو صورة، أو فيديو.');
  }

  if (session.state === 'await_reply') {
    if (type === 'text' && text) {
      if (text.length > TEXT_MAX) {
        return sendText(cfg, phoneNumberId, from, 'النص طويل جداً (الحد 1000 حرف).');
      }
      await setSession(cfg, from, { state: 'await_keywords', pending_text: text, pending_media_id: null });
      return sendText(cfg, phoneNumberId, from,
        'تم استلام النص. اكتب الكلمات التي سيرد بها، مفصولة بفاصلة.');
    }
    if (isMedia) {
      const mediaId = await storeIncomingMedia(cfg, store, msg, type);
      await setSession(cfg, from, { state: 'await_keywords', pending_text: null, pending_media_id: mediaId });
      return sendText(cfg, phoneNumberId, from,
        'تم استلام الملف. اكتب الكلمات التي سيرد بها، مفصولة بفاصلة.');
    }
    return sendText(cfg, phoneNumberId, from, 'أرسل نصاً أو صوتاً أو صورة أو فيديو.');
  }

  if (session.state === 'await_keywords') {
    if (isMedia) {
      const mediaId = await storeIncomingMedia(cfg, store, msg, type);
      await setSession(cfg, from, { pending_media_id: mediaId, pending_text: null });
      return sendText(cfg, phoneNumberId, from, 'تم استبدال الملف. اكتب الكلمات الآن.');
    }

    if (type === 'text' && text) {
      const keywords = parseKeywords(text);
      if (keywords.length === 0 || keywords.length > KEYWORDS_MAX) {
        return sendText(cfg, phoneNumberId, from,
          'اكتب من 1 إلى ' + KEYWORDS_MAX + ' كلمة، مفصولة بفاصلة.');
      }
      if (keywords.some(k => k.length > KEYWORD_LEN_MAX)) {
        return sendText(cfg, phoneNumberId, from, 'إحدى الكلمات طويلة جداً.');
      }

      const conflicts = await findConflicts(cfg, store.id, keywords);
      if (conflicts.length > 0) {
        return sendText(cfg, phoneNumberId, from,
          'هذه الكلمات مستخدمة في رد آخر: ' + conflicts.join('، '));
      }

      let row;
      if (session.pending_text) {
        row = { store_id: store.id, keywords, kind: 'text', content: session.pending_text, media_id: null };
      } else if (session.pending_media_id) {
        const mr = await fetch(
          `${cfg.url}/rest/v1/media_files?id=eq.${session.pending_media_id}&select=kind`,
          { headers: sbHeaders(cfg.key) }
        );
        const [mf] = await mr.json();
        if (!mf) return sendText(cfg, phoneNumberId, from, 'تعذر العثور على الملف، أعد الإضافة.');
        row = { store_id: store.id, keywords, kind: mf.kind, content: null, media_id: session.pending_media_id };
      } else {
        return sendText(cfg, phoneNumberId, from, 'أرسل نصاً أو ملفاً أولاً، ثم الكلمات.');
      }

      await sbInsert(cfg, 'auto_replies', row);
      await setSession(cfg, from, { state: 'idle', keywords: [], pending_text: null, pending_media_id: null });
      return sendText(cfg, phoneNumberId, from,
        '✓ تم حفظ الرد. الكلمات: ' + keywords.join('، '));
    }
  }

  return sendText(cfg, phoneNumberId, from,
    'أرسل "إضافة" لإضافة رد جديد، أو "إلغاء" للإلغاء.');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const cfg = {
    url: (process.env.SUPABASE_URL || '').trim(),
    key: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    token: (process.env.WHATSAPP_TOKEN || '').trim(),
  };

  try {
    const body = req.body || {};
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        for (const msg of value.messages || []) {
          try {
            await handleMessage(cfg, phoneNumberId, msg);
          } catch (err) {
            console.error('handleMessage error:', err?.message || err);
          }
        }
      }
    }
  } catch (err) {
    console.error('webhook error:', err?.message || err);
  }

  return res.status(200).send('ok');
}

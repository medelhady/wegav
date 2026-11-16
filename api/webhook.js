const GRAPH = 'https://graph.facebook.com/v21.0';
const BUCKET = 'media';
const MAX_BYTES = 4 * 1024 * 1024;
const TEXT_MAX = 1000;
const KEYWORDS_MAX = 20;
const KEYWORD_LEN_MAX = 60;
const ALBUM_MAX = 10;
const MEDIA_TYPES = ['audio', 'image', 'video'];
const KIND_AR = { audio: 'صوت', image: 'صورة', video: 'فيديو' };

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
const EDIT_CMD = normalize('تعديل');
const CANCEL_CMD = normalize('إلغاء');
const DONE_CMD = normalize('تم');

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
  return Array.isArray(rows) && rows[0] ? rows[0] : { phone, state: 'idle', pending_media_ids: [] };
}

async function setSession(cfg, phone, patch) {
  const r = await fetch(`${cfg.url}/rest/v1/wa_sessions?on_conflict=phone`, {
    method: 'POST',
    headers: { ...sbHeaders(cfg.key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ phone, ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('session save failed');
}

async function resetSession(cfg, phone, state = 'idle') {
  await setSession(cfg, phone, {
    state,
    keywords: [],
    pending_text: null,
    pending_media_id: null,
    pending_media_ids: [],
    edit_reply_id: null,
  });
}

async function appendPendingMedia(cfg, phone, mediaId) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/append_pending_media`, {
    method: 'POST',
    headers: sbHeaders(cfg.key),
    body: JSON.stringify({ p_phone: phone, p_media: mediaId }),
  });
  if (!r.ok) throw new Error('append failed');
}

async function getStoreById(cfg, id) {
  const r = await fetch(`${cfg.url}/rest/v1/stores?id=eq.${id}&select=id,name,status,merchant_code`, {
    headers: sbHeaders(cfg.key),
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getStoreByPhone(cfg, from) {
  const local = from.length > 8 && from.startsWith('222') ? from.slice(3) : from;
  const r = await fetch(
    `${cfg.url}/rest/v1/stores?phone=in.(${from},${local})&select=id,name,status,merchant_code`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getStoreByCode(cfg, code) {
  const r = await fetch(
    `${cfg.url}/rest/v1/stores?merchant_code=eq.${code}&select=id,name,status,merchant_code`,
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

async function findReplyForText(cfg, storeId, text) {
  const cleaned = normalize(text);
  const r = await fetch(
    `${cfg.url}/rest/v1/auto_replies?store_id=eq.${storeId}&select=id,keywords,kind,content,media_id,media_ids`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if ((row.keywords || []).includes(cleaned)) return row;
  }
  return null;
}

// يرجع الرد وعناصره بالترتيب، مع المسار ونوع كل ملف
async function getReplyItems(cfg, replyId) {
  const r = await fetch(
    `${cfg.url}/rest/v1/auto_replies?id=eq.${replyId}&select=id,kind,media_id,media_ids`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  const reply = Array.isArray(rows) ? rows[0] : null;
  if (!reply) return null;

  const ids = reply.kind === 'album'
    ? (reply.media_ids || [])
    : (reply.media_id ? [reply.media_id] : []);

  let byId = new Map();
  if (ids.length > 0) {
    const mr = await fetch(
      `${cfg.url}/rest/v1/media_files?id=in.(${ids.join(',')})&select=id,kind,storage_path,original_name`,
      { headers: sbHeaders(cfg.key) }
    );
    const mf = await mr.json();
    byId = new Map((Array.isArray(mf) ? mf : []).map(f => [f.id, f]));
  }

  const items = ids.map(id => {
    const f = byId.get(id) || {};
    return {
      id,
      kind: f.kind || 'image',
      storage_path: f.storage_path || null,
      original_name: f.original_name || 'ملف',
    };
  });
  return { reply, items };
}

async function saveReplyIds(cfg, replyId, ids) {
  const pr = await fetch(`${cfg.url}/rest/v1/auto_replies?id=eq.${replyId}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=minimal' },
    body: JSON.stringify({ kind: 'album', media_id: null, media_ids: ids }),
  });
  if (!pr.ok) throw new Error('edit failed');
}

async function sendText(cfg, phoneNumberId, to, body) {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) console.error('send failed', r.status, (await r.text()).slice(0, 200));
}

// يرسل للتاجر محتوى الرد الفعلي: كل عنصر كما سيصل للزبون، مع رقمه قبله
async function sendEditMenu(cfg, phoneNumberId, from, replyId) {
  const data = await getReplyItems(cfg, replyId);
  if (!data) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, 'تعذر العثور على الرد. أعد المحاولة بكتابة "تعديل".');
  }

  if (data.items.length === 0) {
    await sendText(cfg, phoneNumberId, from, 'هذا الرد لا يحتوي ملفات حالياً.');
  } else {
    await sendText(cfg, phoneNumberId, from, 'محتوى الرد الحالي (' + data.items.length + ' عناصر):');
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      await sendText(cfg, phoneNumberId, from, (i + 1) + '. ' + (KIND_AR[it.kind] || 'ملف'));
      if (it.storage_path) {
        await sendMediaReply(cfg, phoneNumberId, from, it.kind, it);
      }
    }
  }

  return sendText(cfg, phoneNumberId, from,
    'أرسل ملفات لإضافتها، أو اكتب "حذف 2" مثلاً لحذف عنصر، ثم اكتب "تم" للحفظ.');
}

async function removeEditItem(cfg, phoneNumberId, from, session, index) {
  const data = await getReplyItems(cfg, session.edit_reply_id);
  if (!data) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, 'تعذر العثور على الرد. أعد المحاولة بكتابة "تعديل".');
  }

  const items = data.items;
  if (index < 1 || index > items.length) {
    return sendText(cfg, phoneNumberId, from, 'رقم غير صحيح. اختر رقماً من 1 إلى ' + items.length + '.');
  }
  if (items.length === 1) {
    return sendText(cfg, phoneNumberId, from,
      'لا يمكن حذف آخر ملف في الرد. أضف ملفاً جديداً أولاً، ثم احذف هذا.');
  }

  const ids = items.filter((_, i) => i !== index - 1).map(it => it.id);
  await saveReplyIds(cfg, session.edit_reply_id, ids);
  await sendText(cfg, phoneNumberId, from, '✓ تم حذف العنصر رقم ' + index + '.');
  return sendEditMenu(cfg, phoneNumberId, from, session.edit_reply_id);
}

async function sendReply(cfg, phoneNumberId, to, row) {
  if (row.kind === 'text') return sendText(cfg, phoneNumberId, to, row.content);

  if (row.kind === 'album') {
    const ids = row.media_ids || [];
    if (ids.length === 0) return;
    const mr = await fetch(
      `${cfg.url}/rest/v1/media_files?id=in.(${ids.join(',')})&select=id,kind,storage_path`,
      { headers: sbHeaders(cfg.key) }
    );
    const files = await mr.json();
    if (!Array.isArray(files)) return;
    const byId = new Map(files.map(f => [f.id, f]));
    for (const id of ids) {
      const mf = byId.get(id);
      if (mf) await sendMediaReply(cfg, phoneNumberId, to, mf.kind, mf);
    }
    return;
  }

  const mr = await fetch(
    `${cfg.url}/rest/v1/media_files?id=eq.${row.media_id}&select=kind,storage_path`,
    { headers: sbHeaders(cfg.key) }
  );
  const [mf] = await mr.json();
  if (!mf) return;
  return sendMediaReply(cfg, phoneNumberId, to, mf.kind, mf);
}

async function sendMediaReply(cfg, phoneNumberId, to, kind, mediaRow) {
  const sr = await fetch(
    `${cfg.url}/storage/v1/object/sign/${BUCKET}/${encodeURI(mediaRow.storage_path)}`,
    {
      method: 'POST',
      headers: sbHeaders(cfg.key),
      body: JSON.stringify({ expiresIn: 300 }),
    }
  );
  const sd = await sr.json();
  if (!sr.ok || !sd.signedURL) {
    console.error('sign failed', JSON.stringify(sd).slice(0, 200));
    return;
  }
  const link = `${cfg.url}/storage/v1${sd.signedURL}`;
  const type = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type, [type]: { link } }),
  });
  if (!r.ok) console.error('media send failed', r.status, (await r.text()).slice(0, 200));
}

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

// إضافة الملفات الجديدة المعلّقة إلى الرد الذي يتم تعديله
async function applyEdit(cfg, phoneNumberId, from, session) {
  const data = await getReplyItems(cfg, session.edit_reply_id);
  if (!data) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, 'تعذر العثور على الرد. أعد المحاولة بكتابة "تعديل".');
  }

  const current = data.items.map(it => it.id);
  const added = session.pending_media_ids || [];

  if (current.length + added.length > ALBUM_MAX) {
    return sendText(cfg, phoneNumberId, from,
      'الحد الأقصى ' + ALBUM_MAX + ' ملفات في الرد الواحد. عندك الآن ' + current.length +
      ' والجديد ' + added.length + '. احذف بعضها بكتابة "حذف رقم"، ثم اكتب "تم".');
  }

  await saveReplyIds(cfg, session.edit_reply_id, [...current, ...added]);
  await resetSession(cfg, from);
  return sendText(cfg, phoneNumberId, from,
    '✓ تم حفظ التعديلات. أصبح الرد يحتوي ' + (current.length + added.length) + ' ملفات.');
}

async function handleMerchant(cfg, phoneNumberId, from, store, msg, session) {
  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';
  const cmd = normalize(text);
  const isMedia = MEDIA_TYPES.includes(type);

  if (store.status !== 'active') {
    return sendText(cfg, phoneNumberId, from, 'حسابك موقوف حالياً، تواصل مع الإدارة.');
  }

  if (cmd === CANCEL_CMD || text === '0') {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from,
      'تم الإلغاء. أرسل "إضافة" لرد جديد، أو "تعديل" لتعديل رد موجود.');
  }

  if (cmd === ADD_CMD) {
    await resetSession(cfg, from, 'await_reply');
    return sendText(cfg, phoneNumberId, from,
      'أرسل الرد الآن: نص، أو صوت، أو صورة، أو فيديو. ولأكثر من ملف أرسلها واحداً تلو الآخر، ثم اكتب "تم".');
  }

  if (cmd === EDIT_CMD) {
    await resetSession(cfg, from, 'await_edit_keyword');
    return sendText(cfg, phoneNumberId, from, 'اكتب إحدى كلمات الرد الذي تريد تعديله.');
  }

  // أي ملف يُحفظ بصمت في الانتظار
  if (isMedia) {
    if (session.state === 'await_edit_keyword') {
      return sendText(cfg, phoneNumberId, from, 'اكتب كلمة الرد أولاً، ثم أرسل الملفات.');
    }
    const mediaId = await storeIncomingMedia(cfg, store, msg, type);
    await appendPendingMedia(cfg, from, mediaId);
    return;
  }

  if (cmd === DONE_CMD) {
    const fresh = await getSession(cfg, from);

    if (fresh.state === 'await_edit_keyword') {
      return sendText(cfg, phoneNumberId, from, 'اكتب كلمة الرد أولاً.');
    }

    if (fresh.state === 'await_edit_media') {
      const count = (fresh.pending_media_ids || []).length;
      if (count === 0) {
        await resetSession(cfg, from);
        return sendText(cfg, phoneNumberId, from, '✓ تم حفظ التعديلات.');
      }
      return applyEdit(cfg, phoneNumberId, from, fresh);
    }

    const count = (fresh.pending_media_ids || []).length;
    if (count === 0) {
      return sendText(cfg, phoneNumberId, from, 'لم ترسل ملفات بعد. أرسل "إضافة" ثم الملفات.');
    }
    await setSession(cfg, from, { state: 'await_keywords' });
    return sendText(cfg, phoneNumberId, from,
      'تم استلام ' + count + ' ملف. اكتب الكلمات التي سيرد بها، مفصولة بفاصلة أو بسطر لكل كلمة.');
  }

  if (type !== 'text' || !text) {
    return sendText(cfg, phoneNumberId, from, 'أرسل "إضافة" لرد جديد، أو "تعديل" لتعديل رد موجود.');
  }

  // بعد "تعديل": الكلمة تحدد الرد، ثم نرسل محتواه الفعلي
  if (session.state === 'await_edit_keyword') {
    const row = await findReplyForText(cfg, store.id, text);
    if (!row) {
      return sendText(cfg, phoneNumberId, from, 'لم أجد رداً بهذه الكلمة. اكتب كلمة أخرى، أو "إلغاء".');
    }
    if (row.kind === 'text') {
      await resetSession(cfg, from);
      return sendText(cfg, phoneNumberId, from,
        'هذا رد نصي، ولا يمكن تعديل ملفاته. أنشئ رداً جديداً بكتابة "إضافة".');
    }
    await setSession(cfg, from, {
      state: 'await_edit_media',
      edit_reply_id: row.id,
      pending_media_ids: [],
      pending_text: null,
      pending_media_id: null,
    });
    return sendEditMenu(cfg, phoneNumberId, from, row.id);
  }

  // أثناء التعديل: حذف عنصر برقمه، أو تنبيه
  if (session.state === 'await_edit_media') {
    const m = cmd.match(/^حذف (\d+)$/);
    if (m) {
      return removeEditItem(cfg, phoneNumberId, from, session, parseInt(m[1], 10));
    }
    return sendText(cfg, phoneNumberId, from,
      'أرسل ملفات لإضافتها، أو "حذف رقم" لحذف عنصر، ثم "تم" للحفظ، أو "إلغاء".');
  }

  if (session.state === 'await_reply') {
    if (text.length > TEXT_MAX) {
      return sendText(cfg, phoneNumberId, from, 'النص طويل جداً (الحد 1000 حرف).');
    }
    await setSession(cfg, from, {
      state: 'await_keywords', pending_text: text, pending_media_id: null, pending_media_ids: [],
    });
    return sendText(cfg, phoneNumberId, from,
      'تم استلام النص. اكتب الكلمات التي سيرد بها، مفصولة بفاصلة أو بسطر لكل كلمة.');
  }

  // أي نص آخر بعد الملفات أو النص: هذه هي الكلمات
  const fresh = await getSession(cfg, from);
  const hasPending = Boolean(fresh.pending_text) || (fresh.pending_media_ids || []).length > 0;
  if (!hasPending) {
    return sendText(cfg, phoneNumberId, from, 'أرسل "إضافة" لرد جديد، أو "تعديل" لتعديل رد موجود.');
  }

  const keywords = parseKeywords(text);
  if (keywords.length === 0 || keywords.length > KEYWORDS_MAX) {
    return sendText(cfg, phoneNumberId, from, 'اكتب من 1 إلى ' + KEYWORDS_MAX + ' كلمة.');
  }
  if (keywords.some(k => k.length > KEYWORD_LEN_MAX)) {
    return sendText(cfg, phoneNumberId, from, 'إحدى الكلمات طويلة جداً.');
  }

  const conflicts = await findConflicts(cfg, store.id, keywords);
  if (conflicts.length > 0) {
    return sendText(cfg, phoneNumberId, from, 'هذه الكلمات مستخدمة في رد آخر: ' + conflicts.join('، '));
  }

  let row;
  if (fresh.pending_text) {
    row = { store_id: store.id, keywords, kind: 'text', content: fresh.pending_text, media_id: null };
  } else {
    const ids = fresh.pending_media_ids.slice(0, ALBUM_MAX);
    if (ids.length === 1) {
      const mr = await fetch(
        `${cfg.url}/rest/v1/media_files?id=eq.${ids[0]}&select=kind`,
        { headers: sbHeaders(cfg.key) }
      );
      const [mf] = await mr.json();
      row = { store_id: store.id, keywords, kind: mf.kind, content: null, media_id: ids[0] };
    } else {
      row = { store_id: store.id, keywords, kind: 'album', content: null, media_id: null, media_ids: ids };
    }
  }

  await sbInsert(cfg, 'auto_replies', row);
  await resetSession(cfg, from);
  return sendText(cfg, phoneNumberId, from, '✓ تم حفظ الرد. الكلمات: ' + keywords.join('، '));
}

async function handleCustomer(cfg, phoneNumberId, from, msg, session) {
  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';

  if (/^\d{3}$/.test(text)) {
    const store = await getStoreByCode(cfg, text);
    if (!store || store.status !== 'active') {
      return sendText(cfg, phoneNumberId, from, 'الكود غير صحيح أو المتجر غير متاح.');
    }
    await setSession(cfg, from, { state: 'customer', active_store_id: store.id });
    return sendText(cfg, phoneNumberId, from, 'مرحباً بك في ' + store.name + '. اكتب كلمة للحصول على الرد.');
  }

  if (session.active_store_id) {
    const store = await getStoreById(cfg, session.active_store_id);
    if (!store || store.status !== 'active') {
      await setSession(cfg, from, { state: 'idle', active_store_id: null });
      return sendText(cfg, phoneNumberId, from, 'المتجر غير متاح حالياً.');
    }

    if (type === 'text' && text) {
      const row = await findReplyForText(cfg, store.id, text);
      if (row) return sendReply(cfg, phoneNumberId, from, row);
    }
    return sendText(cfg, phoneNumberId, from, 'لم أفهم طلبك. اكتب كلمة مثل: سلام، أو أرسل كود المتجر للتغيير.');
  }

  return sendText(cfg, phoneNumberId, from, 'مرحباً، أرسل كود المتجر المكون من 3 أرقام للحصول على الردود.');
}

async function handleMessage(cfg, phoneNumberId, msg) {
  const from = String(msg.from || '');
  const session = await getSession(cfg, from);

  const store = await getStoreByPhone(cfg, from);
  if (store) {
    return handleMerchant(cfg, phoneNumberId, from, store, msg, session);
  }
  return handleCustomer(cfg, phoneNumberId, from, msg, session);
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

const GRAPH = 'https://graph.facebook.com/v21.0';
const BUCKET = 'media';
const MAX_BYTES = 16 * 1024 * 1024;
const TEXT_MAX = 1000;
const KEYWORDS_MAX = 20;
const KEYWORD_LEN_MAX = 60;
const ALBUM_MAX = 10;
const TRIAL_REPLIES = 50;
const MEDIA_TYPES = ['audio', 'image', 'video'];
const IGNORED_TYPES = ['unsupported', 'reaction', 'sticker', 'system', 'unknown', 'order', 'contacts', 'location', 'interactive', 'button'];
const KIND_AR = { audio: 'صوت', image: 'صورة', video: 'فيديو' };
const BOT_NUMBER = (process.env.BOT_WA_NUMBER || '22224404036').replace(/\D/g, '');

const EXT_BY_MIME = {
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr', 'audio/aac': 'aac',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
const VIDEO_EXT = ['mp4', 'mov', '3gp', 'webm'];
const AUDIO_EXT = ['ogg', 'mp3', 'm4a', 'amr', 'aac', 'opus'];

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

const ADD_RE = /^ا?ض ?ا?ف ?ه?$/;

const EDIT_CMD = normalize('تعديل');
const CANCEL_CMD = normalize('إلغاء');
const DONE_CMD = normalize('تم');
const REGISTER_CMD = normalize('تسجيل');
const MENU_CMD = normalize('قائمة');
const QUOTA_CMD = normalize('حصتي');
const WELCOME_CMD = normalize('ترحيب');
const WELCOME_DEL_CMD = normalize('حذف الترحيب');
const LINK_CMD = normalize('رابط');
const LEAVE_CMD = normalize('تغيير المتجر');

const MSG = {
  customerWelcome:
    '👋 *أهلاً بك!*\n\n' +
    'للحصول على الردود أرسل *كود المتجر* المكون من 3 أرقام.\n' +
    'مثال: 924\n\n' +
    'وإذا كنت تريد تسجيل متجرك، اكتب *تسجيل*.',
  customerStoreSet: (name) =>
    '✅ *مرحباً بك في ' + name + '* 🏪\n\n' +
    'اكتب كلمة للحصول على الرد، مثل:\n' +
    '• سلام\n• مرحبا\n\n' +
    'لتغيير المتجر اكتب *تغيير المتجر*.',
  storeLeft: '↩️ *تم إنهاء المتجر الحالي*\n\nأرسل كود المتجر الجديد للمتابعة.',
  customerUnknown:
    '🤔 *لم أفهم طلبك*\n\n' +
    'اكتب كلمة من كلمات المتجر، أو اكتب *تغيير المتجر* لإدخال كود آخر.',
  codeInvalid: '❌ *الكود غير صحيح أو المتجر غير متاح*\n\nتأكد من الكود وأعد المحاولة.',
  storeStopped: '⛔ *حسابك موقوف حالياً*\n\nتواصل مع الإدارة لإعادة التفعيل.',
  registerAskName:
    '✍️ *تسجيل متجر جديد*\n\n' +
    'اكتب اسم متجرك كما تريد أن يظهر للزبائن.\n' +
    '(من 2 إلى 60 حرفاً)',
  registerNameInvalid: '⚠️ اسم المتجر يجب أن يكون بين 2 و 60 حرفاً. اكتب الاسم مرة أخرى.',
  registerSuccess: (store) =>
    '🎉 *مبروك! تم تسجيل متجرك*\n\n' +
    '🏪 المتجر: *' + store.name + '*\n' +
    '🔑 كودك: *' + store.merchant_code + '*\n' +
    '🎁 تجربتك المجانية: *' + TRIAL_REPLIES + ' رداً*\n\n' +
    '📌 *ابدأ الآن:*\n' +
    '1️⃣ اكتب *ترحيب* لتحديد الرسالة التي يستقبلها الزبون عند دخول متجرك\n' +
    '2️⃣ اكتب *إضافة* لإضافة رد\n' +
    '3️⃣ اكتب *رابط* للحصول على رابط مشاركة لزبائنك\n' +
    '4️⃣ اكتب *قائمة* لعرض كل الخيارات',
  merchantLink: (store) =>
    '🔗 *رابط متجرك*\n\n' +
    'شارك هذا الرابط مع زبائنك، عند الضغط عليه يفتح المحادثة مع كود متجرك جاهزاً:\n\n' +
    'https://wa.me/' + BOT_NUMBER + '?text=' + store.merchant_code + '\n\n' +
    '🔑 كودك: *' + store.merchant_code + '*',
  menu: (store, used, quota) =>
    '📋 *قائمة التاجر*\n' +
    '━━━━━━━━━━━━\n' +
    '🎉 *ترحيب* ← الرسالة التي يستقبلها الزبون عند دخول متجرك\n' +
    '➕ *إضافة* ← رد جديد\n' +
    '✏️ *تعديل* ← تعديل رد موجود\n' +
    '🗑 *حذف 2* ← حذف الرد رقم 2\n' +
    '🔗 *رابط* ← رابط مشاركة لزبائنك\n' +
    '📊 *حصتي* ← الردود المستخدمة والمتبقية\n' +
    '❌ *إلغاء* ← الخروج من أي خطوة\n' +
    '━━━━━━━━━━━━\n' +
    '🔑 كودك: *' + store.merchant_code + '*\n' +
    '📊 استخدمت ' + used + ' من ' + quota + ' رد',
  quota: (used, quota) =>
    '📊 *حصتك*\n\n' +
    'استخدمت: *' + used + '* رد\n' +
    'المتبقي: *' + Math.max(0, quota - used) + '* رد\n' +
    'الإجمالي: *' + quota + '* رد',
  welcomeAsk:
    '🎉 *رسالة الترحيب*\n\n' +
    'أرسل الآن كل ما تريد أن يستقبله الزبون عند دخول متجرك:\n' +
    '• نص مكتوب\n' +
    '• صور أو صوت أو فيديو (يمكنك إرسال عدة ملفات)\n\n' +
    'عند الانتهاء اكتب *تم* للحفظ.\n' +
    'للتراجع اكتب *إلغاء*، ولحذفها اكتب *حذف الترحيب*.',
  welcomeTextReceived:
    '✅ *تم استلام النص*\n\n' +
    'أرسل الصور أو الصوت أو الفيديو إن أردت، ثم اكتب *تم* للحفظ.',
  welcomeEmpty: '📎 لم ترسل شيئاً بعد.\nأرسل نصاً أو ملفات، ثم اكتب *تم*.',
  welcomeSaved: (count, hasText) =>
    '✅ *تم حفظ رسالة الترحيب*\n\n' +
    (hasText ? '📝 نص\n' : '') +
    (count ? '📎 ' + count + ' ملف\n' : '') +
    '\nستصل للزبائن عند إدخال كود متجرك بالترتيب نفسه.',
  welcomeRemoved: '🗑 *تم حذف رسالة الترحيب*\n\nسيستقبل الزبائن الرسالة الافتراضية.',
  addStart:
    '➕ *إضافة رد جديد*\n\n' +
    'أرسل الرد الآن:\n' +
    '• نص مكتوب\n' +
    '• أو صورة، أو صوت، أو فيديو\n\n' +
    'لأكثر من ملف أرسلها واحداً تلو الآخر، ثم اكتب *تم*.\n' +
    'للتراجع اكتب *إلغاء*.',
  filesReceived: (count) =>
    '✅ *تم استلام ' + count + ' ملف*\n\n' +
    'الآن اكتب *الكلمات* التي سيرد بها البوت، مثل:\n' +
    'منتج1، منتج جديد\n\n' +
    '💡 يمكنك كتابة كل كلمة في سطر مستقل.',
  noFilesYet: '📎 لم ترسل ملفات بعد.\nأرسل *إضافة* ثم الملفات، أو اكتب كلمة الرد.',
  keywordsInvalid: '⚠️ اكتب من 1 إلى ' + KEYWORDS_MAX + ' كلمة، مفصولة بفاصلة أو بسطر.',
  keywordTooLong: '⚠️ إحدى الكلمات طويلة جداً (الحد 60 حرفاً).',
  keywordConflict: (list) =>
    '⚠️ *هذه الكلمات مستخدمة في رد آخر:*\n' + list + '\n\nاكتب كلمات أخرى.',
  saved: (keywords) =>
    '🎉 *تم حفظ الرد بنجاح*\n\n' +
    '🔑 الكلمات: ' + keywords.join('، ') + '\n\n' +
    'اكتب *قائمة* لعرض كل الخيارات.',
  textTooLong: '⚠️ النص طويل جداً (الحد 1000 حرف). اختصره وأرسله مرة أخرى.',
  textReceived:
    '✅ *تم استلام النص*\n\n' +
    'الآن اكتب *الكلمات* التي سيرد بها البوت، مثل:\n' +
    'سلام، مرحبا\n\n' +
    '💡 يمكنك كتابة كل كلمة في سطر مستقل.',
  editPrompt:
    '✏️ *تعديل رد*\n' +
    '━━━━━━━━━━━━\n' +
    'اكتب *رقم* الرد من القائمة، أو *كلمة* من كلماته.\n\n' +
    '🗑 لحذف رد مباشرة: *حذف رقم* (مثال: حذف 2)\n' +
    '❌ للخروج: *إلغاء*',
  noReplies: '📭 *لا توجد ردود بعد*\n\nاكتب *إضافة* لإنشاء أول رد.',
  replyNotFound: '⚠️ *لم أجد هذا الرد*\n\nاختر رقماً من القائمة، أو اكتب كلمة أخرى، أو *إلغاء*.',
  replyNumberNotFound: '⚠️ *رقم غير موجود في القائمة*\n\nاختر رقماً صحيحاً.',
  textReplyNoEdit:
    '📝 *هذا رد نصي*\n\nلا يمكن تعديل ملفاته لأنه نص فقط.\nأنشئ رداً جديداً بكتابة *إضافة*.',
  deleted: (label) => '🗑 *تم حذف الرد*\n\n' + label,
  editHeader: (count) => '📦 *محتوى الرد الحالي* (' + count + ' عناصر)',
  editEmpty: '📭 هذا الرد لا يحتوي ملفات حالياً.',
  editMenu:
    '━━━━━━━━━━━━\n' +
    '📎 أرسل ملفات لإضافتها\n' +
    '🗑 *حذف 2* ← حذف العنصر رقم 2\n' +
    '✅ *تم* ← حفظ التعديلات\n' +
    '❌ *إلغاء* ← الخروج بدون حفظ\n' +
    '━━━━━━━━━━━━',
  editItemDeleted: (index) => '🗑 تم حذف العنصر رقم ' + index + '.',
  editIndexInvalid: (max) => '⚠️ رقم غير صحيح. اختر رقماً من 1 إلى ' + max + '.',
  editLastItem: '⚠️ لا يمكن حذف آخر ملف في الرد.\nأضف ملفاً جديداً أولاً، ثم احذف هذا.',
  editLimit: (max, current, added) =>
    '⚠️ *تجاوزت الحد الأقصى (' + max + ' ملفات)*\n\n' +
    'الحالية: ' + current + '\nالجديدة: ' + added + '\n\n' +
    'احذف بعضها بكتابة *حذف رقم*، ثم اكتب *تم*.',
  editSaved: (count) => '✅ *تم حفظ التعديلات*\n\nأصبح الرد يحتوي ' + count + ' ملفات.',
  editNoChanges: '✅ *تم الخروج* بدون تغييرات.',
  replyLost: '⚠️ تعذر العثور على الرد.\nأعد المحاولة بكتابة *تعديل*.',
  cancelled: '❌ *تم الإلغاء*\n\nاكتب *قائمة* لعرض الخيارات.',
  unknownMerchant: (type) =>
    '🤔 *لم أفهم طلبك*\n\n' +
    'اكتب *قائمة* لعرض كل الخيارات.' +
    (type ? '\n\n(نوع الرسالة: ' + type + ')' : ''),
  mediaFailed: (reason) =>
    '⚠️ *تعذر حفظ الملف*\n\nالسبب: ' + reason + '\n\nجرّب ملفاً أصغر، أو أعد الإرسال.',
  doneNeedEditKeyword: '✏️ اختر رقم الرد أولاً.',
  filesStoredInEditKeyword: '✏️ اختر رقم الرد أولاً، ثم أرسل الملفات.',
};

const BOT_MEDIA = {};
let MSG_KEY_BY_TEXT = new Map();

async function loadBotMessages(cfg) {
  try {
    const r = await fetch(`${cfg.url}/rest/v1/bot_messages?select=key,value,kind,media_path`, {
      headers: sbHeaders(cfg.key),
    });
    const rows = await r.json();
    if (!Array.isArray(rows)) return;

    for (const row of rows) {
      if (typeof MSG[row.key] === 'string' && row.value) MSG[row.key] = row.value;
      if (row.kind && row.kind !== 'text' && row.media_path) {
        BOT_MEDIA[row.key] = { kind: row.kind, path: row.media_path };
      } else {
        delete BOT_MEDIA[row.key];
      }
    }

    MSG_KEY_BY_TEXT = new Map();
    for (const k of Object.keys(MSG)) {
      if (typeof MSG[k] === 'string') MSG_KEY_BY_TEXT.set(MSG[k], k);
    }
  } catch (err) {
    console.error('bot messages load failed:', err?.message || err);
  }
}

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

async function appendWelcomeMedia(cfg, phone, mediaId) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/append_welcome_media`, {
    method: 'POST',
    headers: sbHeaders(cfg.key),
    body: JSON.stringify({ p_phone: phone, p_media: mediaId }),
  });
  if (!r.ok) throw new Error('welcome append failed');
}

const STORE_FIELDS = 'id,name,status,merchant_code,replies_quota,replies_used,welcome_text,welcome_media_ids';

async function getStoreById(cfg, id) {
  const r = await fetch(`${cfg.url}/rest/v1/stores?id=eq.${id}&select=${STORE_FIELDS}`, {
    headers: sbHeaders(cfg.key),
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getStoreByPhone(cfg, from) {
  const local = from.length > 8 && from.startsWith('222') ? from.slice(3) : from;
  const r = await fetch(
    `${cfg.url}/rest/v1/stores?phone=in.(${from},${local})&select=${STORE_FIELDS}`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getStoreByCode(cfg, code) {
  const r = await fetch(
    `${cfg.url}/rest/v1/stores?merchant_code=eq.${code}&select=${STORE_FIELDS}`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function patchStore(cfg, id, patch) {
  const r = await fetch(`${cfg.url}/rest/v1/stores?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('store update failed');
}

async function getMediaRow(cfg, id) {
  const r = await fetch(`${cfg.url}/rest/v1/media_files?id=eq.${id}&select=kind,storage_path`, {
    headers: sbHeaders(cfg.key),
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function generateMerchantCode(cfg) {
  for (let i = 0; i < 30; i++) {
    const code = String(100 + Math.floor(Math.random() * 900));
    const r = await fetch(
      `${cfg.url}/rest/v1/stores?merchant_code=eq.${code}&select=id`,
      { headers: sbHeaders(cfg.key) }
    );
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length === 0) return code;
  }
  throw new Error('no free merchant code');
}

async function createStore(cfg, phone, name) {
  const code = await generateMerchantCode(cfg);
  return sbInsert(cfg, 'stores', {
    name,
    phone,
    merchant_code: code,
    status: 'active',
    plan: 'trial',
    replies_quota: TRIAL_REPLIES,
    replies_used: 0,
  });
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

async function listStoreReplies(cfg, storeId) {
  const r = await fetch(
    `${cfg.url}/rest/v1/auto_replies?store_id=eq.${storeId}&select=id,keywords,kind,content,media_id,media_ids,created_at&order=created_at.asc`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

async function deleteReplyById(cfg, id) {
  const r = await fetch(`${cfg.url}/rest/v1/auto_replies?id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error('delete failed');
}

function replyLabel(row) {
  const kw = (row.keywords || []).join('، ');
  let kind;
  if (row.kind === 'text') {
    kind = '📝 نص';
  } else if (row.kind === 'album') {
    kind = '🖼 ألبوم (' + (row.media_ids || []).length + ' ملفات)';
  } else {
    kind = (row.kind === 'image' ? '🖼 ' : row.kind === 'audio' ? '🎤 ' : '🎬 ') + (KIND_AR[row.kind] || 'ملف');
  }
  return '*' + kw + '*\n    ' + kind;
}

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

async function signLink(cfg, path, seconds) {
  const sr = await fetch(
    `${cfg.url}/storage/v1/object/sign/${BUCKET}/${encodeURI(path)}`,
    {
      method: 'POST',
      headers: sbHeaders(cfg.key),
      body: JSON.stringify({ expiresIn: seconds }),
    }
  );
  const sd = await sr.json();
  if (!sr.ok || !sd.signedURL) {
    console.error('sign failed', JSON.stringify(sd).slice(0, 200));
    return null;
  }
  return `${cfg.url}/storage/v1${sd.signedURL}`;
}

async function sendMediaTo(cfg, phoneNumberId, to, kind, path, caption) {
  const link = await signLink(cfg, path, 600);
  if (!link) return false;
  const type = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';
  const media = { link };
  if (type !== 'audio' && caption) media.caption = String(caption).slice(0, 1024);

  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type, [type]: media }),
  });
  if (!r.ok) {
    console.error('media send failed', r.status, (await r.text()).slice(0, 200));
    return false;
  }
  return true;
}

async function sendRaw(cfg, phoneNumberId, to, body) {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) console.error('send failed', r.status, (await r.text()).slice(0, 200));
}

async function sendText(cfg, phoneNumberId, to, body) {
  const key = MSG_KEY_BY_TEXT.get(body);
  const bm = key ? BOT_MEDIA[key] : null;
  if (bm && await sendMediaTo(cfg, phoneNumberId, to, bm.kind, bm.path, body)) return;
  return sendRaw(cfg, phoneNumberId, to, body);
}

async function sendWelcome(cfg, phoneNumberId, to, store) {
  const ids = store.welcome_media_ids || [];
  if (ids.length === 0 && !store.welcome_text) {
    return sendText(cfg, phoneNumberId, to, MSG.customerStoreSet(store.name));
  }

  if (store.welcome_text) {
    await sendRaw(cfg, phoneNumberId, to, store.welcome_text);
  }
  if (ids.length === 0) return;

  const r = await fetch(
    `${cfg.url}/rest/v1/media_files?id=in.(${ids.join(',')})&select=id,kind,storage_path`,
    { headers: sbHeaders(cfg.key) }
  );
  const files = await r.json();
  if (!Array.isArray(files)) return;

  const byId = new Map(files.map(f => [f.id, f]));
  for (const id of ids) {
    const mf = byId.get(id);
    if (mf) await sendMediaTo(cfg, phoneNumberId, to, mf.kind, mf.storage_path, null);
  }
}

async function sendReplyList(cfg, phoneNumberId, from, storeId) {
  const rows = await listStoreReplies(cfg, storeId);
  if (rows.length === 0) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.noReplies);
  }

  const lines = rows.map((r, i) => (i + 1) + '. ' + replyLabel(r));
  const body =
    '📋 *ردودك* (' + rows.length + ')\n' +
    '━━━━━━━━━━━━\n' +
    lines.join('\n\n') +
    '\n━━━━━━━━━━━━\n' +
    '✏️ اكتب *رقم* الرد للتعديل عليه\n' +
    '🗑 أو *حذف رقم* (مثال: حذف 2)\n' +
    '❌ أو *إلغاء* للخروج';

  return sendText(cfg, phoneNumberId, from, body);
}

async function sendMediaReply(cfg, phoneNumberId, to, kind, mediaRow) {
  await sendMediaTo(cfg, phoneNumberId, to, kind, mediaRow.storage_path, null);
}

async function sendEditMenu(cfg, phoneNumberId, from, replyId) {
  const data = await getReplyItems(cfg, replyId);
  if (!data) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.replyLost);
  }

  if (data.items.length === 0) {
    await sendText(cfg, phoneNumberId, from, MSG.editEmpty);
  } else {
    await sendText(cfg, phoneNumberId, from, MSG.editHeader(data.items.length));
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      await sendText(cfg, phoneNumberId, from, '*' + (i + 1) + '.* ' + (KIND_AR[it.kind] || 'ملف'));
      if (it.storage_path) {
        await sendMediaReply(cfg, phoneNumberId, from, it.kind, it);
      }
    }
  }

  return sendText(cfg, phoneNumberId, from, MSG.editMenu);
}

async function removeEditItem(cfg, phoneNumberId, from, session, index) {
  const data = await getReplyItems(cfg, session.edit_reply_id);
  if (!data) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.replyLost);
  }

  const items = data.items;
  if (index < 1 || index > items.length) {
    return sendText(cfg, phoneNumberId, from, MSG.editIndexInvalid(items.length));
  }
  if (items.length === 1) {
    return sendText(cfg, phoneNumberId, from, MSG.editLastItem);
  }

  const ids = items.filter((_, i) => i !== index - 1).map(it => it.id);
  await saveReplyIds(cfg, session.edit_reply_id, ids);
  await sendText(cfg, phoneNumberId, from, MSG.editItemDeleted(index));
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

  const mf = await getMediaRow(cfg, row.media_id);
  if (!mf) return;
  return sendMediaReply(cfg, phoneNumberId, to, mf.kind, mf);
}

async function storeIncomingMedia(cfg, store, msg, type) {
  const obj = msg[type] || {};
  if (!obj.id) throw new Error('الرسالة لا تحمل معرّف الملف');

  const metaRes = await fetch(`${GRAPH}/${obj.id}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const meta = await metaRes.json();
  if (!meta.url) throw new Error('تعذر الوصول للملف من واتساب');
  if (meta.file_size && meta.file_size > MAX_BYTES) {
    throw new Error('الملف أكبر من ' + Math.round(MAX_BYTES / 1024 / 1024) + ' ميغابايت');
  }

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!fileRes.ok) throw new Error('تعذر تحميل الملف');
  const buf = Buffer.from(await fileRes.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw new Error('الملف أكبر من ' + Math.round(MAX_BYTES / 1024 / 1024) + ' ميغابايت');
  }

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
  if (!up.ok) throw new Error('فشل حفظ الملف في التخزين');

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

async function applyEdit(cfg, phoneNumberId, from, session) {
  const data = await getReplyItems(cfg, session.edit_reply_id);
  if (!data) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.replyLost);
  }

  const current = data.items.map(it => it.id);
  const added = session.pending_media_ids || [];

  if (current.length + added.length > ALBUM_MAX) {
    return sendText(cfg, phoneNumberId, from, MSG.editLimit(ALBUM_MAX, current.length, added.length));
  }

  await saveReplyIds(cfg, session.edit_reply_id, [...current, ...added]);
  await resetSession(cfg, from);
  return sendText(cfg, phoneNumberId, from, MSG.editSaved(current.length + added.length));
}

function normalizeIncoming(msg) {
  if (msg.type !== 'document') return msg;
  const doc = msg.document || {};
  const mime = String(doc.mime_type || '').toLowerCase();
  const name = String(doc.filename || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';

  let kind = null;
  if (mime.startsWith('image/') || IMAGE_EXT.includes(ext)) kind = 'image';
  else if (mime.startsWith('video/') || VIDEO_EXT.includes(ext)) kind = 'video';
  else if (mime.startsWith('audio/') || AUDIO_EXT.includes(ext)) kind = 'audio';

  return kind ? { ...msg, type: kind, [kind]: doc } : msg;
}

async function handleMerchant(cfg, phoneNumberId, from, store, msg, session) {
  if (IGNORED_TYPES.includes(msg.type)) return;

  msg = normalizeIncoming(msg);

  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';
  const cmd = normalize(text);
  const cmdNoSpace = cmd.replace(/\s/g, '');
  const isMedia = MEDIA_TYPES.includes(type);

  if (store.status !== 'active') {
    return sendText(cfg, phoneNumberId, from, MSG.storeStopped);
  }

  if (cmd === CANCEL_CMD || text === '0') {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.cancelled);
  }

  if (cmd === MENU_CMD) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from,
      MSG.menu(store, store.replies_used || 0, store.replies_quota || 0));
  }

  if (cmd === LINK_CMD) {
    return sendText(cfg, phoneNumberId, from, MSG.merchantLink(store));
  }

  if (cmd === QUOTA_CMD) {
    return sendText(cfg, phoneNumberId, from,
      MSG.quota(store.replies_used || 0, store.replies_quota || 0));
  }

  if (ADD_RE.test(cmdNoSpace)) {
    await resetSession(cfg, from, 'await_reply');
    return sendText(cfg, phoneNumberId, from, MSG.addStart);
  }

  if (cmd === EDIT_CMD) {
    await resetSession(cfg, from, 'await_edit_keyword');
    await sendReplyList(cfg, phoneNumberId, from, store.id);
    return sendText(cfg, phoneNumberId, from, MSG.editPrompt);
  }

  if (cmd === WELCOME_CMD) {
    await resetSession(cfg, from, 'await_welcome');
    return sendText(cfg, phoneNumberId, from, MSG.welcomeAsk);
  }

  if (cmd === WELCOME_DEL_CMD) {
    await patchStore(cfg, store.id, { welcome_text: null, welcome_media_ids: [] });
    return sendText(cfg, phoneNumberId, from, MSG.welcomeRemoved);
  }

  if (session.state === 'await_welcome') {
    if (cmd === DONE_CMD) {
      const fresh = await getSession(cfg, from);
      const ids = (fresh.pending_media_ids || []).slice(0, ALBUM_MAX);
      const pendingText = fresh.pending_text || null;

      if (!pendingText && ids.length === 0) {
        return sendText(cfg, phoneNumberId, from, MSG.welcomeEmpty);
      }

      await patchStore(cfg, store.id, { welcome_text: pendingText, welcome_media_ids: ids });
      await resetSession(cfg, from);
      return sendText(cfg, phoneNumberId, from, MSG.welcomeSaved(ids.length, Boolean(pendingText)));
    }

    if (isMedia) {
      try {
        const mediaId = await storeIncomingMedia(cfg, store, msg, type);
        await appendWelcomeMedia(cfg, from, mediaId);
      } catch (err) {
        console.error('welcome media error:', err?.message || err);
        return sendText(cfg, phoneNumberId, from, MSG.mediaFailed(err?.message || 'خطأ غير معروف'));
      }
      return;
    }

    if (type === 'text' && text) {
      if (text.length > TEXT_MAX) {
        return sendText(cfg, phoneNumberId, from, MSG.textTooLong);
      }
      await setSession(cfg, from, { state: 'await_welcome', pending_text: text });
      return sendText(cfg, phoneNumberId, from, MSG.welcomeTextReceived);
    }
    return;
  }

  if (isMedia) {
    if (session.state === 'await_edit_keyword') {
      return sendText(cfg, phoneNumberId, from, MSG.filesStoredInEditKeyword);
    }
    try {
      const mediaId = await storeIncomingMedia(cfg, store, msg, type);
      await appendPendingMedia(cfg, from, mediaId);
    } catch (err) {
      console.error('media error:', err?.message || err);
      return sendText(cfg, phoneNumberId, from, MSG.mediaFailed(err?.message || 'خطأ غير معروف'));
    }
    return;
  }

  if (cmd === DONE_CMD) {
    const fresh = await getSession(cfg, from);

    if (fresh.state === 'await_edit_keyword') {
      return sendText(cfg, phoneNumberId, from, MSG.doneNeedEditKeyword);
    }

    if (fresh.state === 'await_edit_media') {
      const count = (fresh.pending_media_ids || []).length;
      if (count === 0) {
        await resetSession(cfg, from);
        return sendText(cfg, phoneNumberId, from, MSG.editNoChanges);
      }
      return applyEdit(cfg, phoneNumberId, from, fresh);
    }

    const count = (fresh.pending_media_ids || []).length;
    if (count === 0) {
      return sendText(cfg, phoneNumberId, from, MSG.noFilesYet);
    }
    await setSession(cfg, from, { state: 'await_keywords' });
    return sendText(cfg, phoneNumberId, from, MSG.filesReceived(count));
  }

  if (type !== 'text' || !text) {
    return sendText(cfg, phoneNumberId, from, MSG.unknownMerchant(type));
  }

  if (session.state === 'await_edit_keyword') {
    const dm = cmd.match(/^حذف (\d+)$/);
    if (dm) {
      const list = await listStoreReplies(cfg, store.id);
      const target = list[parseInt(dm[1], 10) - 1];
      if (!target) {
        return sendText(cfg, phoneNumberId, from, MSG.replyNumberNotFound);
      }
      await deleteReplyById(cfg, target.id);
      await sendText(cfg, phoneNumberId, from, MSG.deleted(replyLabel(target)));
      return sendReplyList(cfg, phoneNumberId, from, store.id);
    }

    let row = null;
    if (/^\d+$/.test(text)) {
      const list = await listStoreReplies(cfg, store.id);
      row = list[parseInt(text, 10) - 1] || null;
      if (!row) {
        return sendText(cfg, phoneNumberId, from, MSG.replyNumberNotFound);
      }
    } else {
      row = await findReplyForText(cfg, store.id, text);
      if (!row) {
        return sendText(cfg, phoneNumberId, from, MSG.replyNotFound);
      }
    }

    if (row.kind === 'text') {
      await resetSession(cfg, from);
      return sendText(cfg, phoneNumberId, from, MSG.textReplyNoEdit);
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

  if (session.state === 'await_edit_media') {
    const m = cmd.match(/^حذف (\d+)$/);
    if (m) {
      return removeEditItem(cfg, phoneNumberId, from, session, parseInt(m[1], 10));
    }
    return sendText(cfg, phoneNumberId, from, MSG.editMenu);
  }

  if (session.state === 'await_reply') {
    if (text.length > TEXT_MAX) {
      return sendText(cfg, phoneNumberId, from, MSG.textTooLong);
    }
    await setSession(cfg, from, {
      state: 'await_keywords', pending_text: text, pending_media_id: null, pending_media_ids: [],
    });
    return sendText(cfg, phoneNumberId, from, MSG.textReceived);
  }

  const fresh = await getSession(cfg, from);
  const hasPending = Boolean(fresh.pending_text) || (fresh.pending_media_ids || []).length > 0;
  if (!hasPending) {
    return sendText(cfg, phoneNumberId, from, MSG.unknownMerchant(''));
  }

  const keywords = parseKeywords(text);
  if (keywords.length === 0 || keywords.length > KEYWORDS_MAX) {
    return sendText(cfg, phoneNumberId, from, MSG.keywordsInvalid);
  }
  if (keywords.some(k => k.length > KEYWORD_LEN_MAX)) {
    return sendText(cfg, phoneNumberId, from, MSG.keywordTooLong);
  }

  const conflicts = await findConflicts(cfg, store.id, keywords);
  if (conflicts.length > 0) {
    return sendText(cfg, phoneNumberId, from, MSG.keywordConflict(conflicts.map(c => '• ' + c).join('\n')));
  }

  let row;
  if (fresh.pending_text) {
    row = { store_id: store.id, keywords, kind: 'text', content: fresh.pending_text, media_id: null };
  } else {
    const ids = fresh.pending_media_ids.slice(0, ALBUM_MAX);
    if (ids.length === 1) {
      const mf = await getMediaRow(cfg, ids[0]);
      row = { store_id: store.id, keywords, kind: mf ? mf.kind : 'image', content: null, media_id: ids[0] };
    } else {
      row = { store_id: store.id, keywords, kind: 'album', content: null, media_id: null, media_ids: ids };
    }
  }

  await sbInsert(cfg, 'auto_replies', row);
  await resetSession(cfg, from);
  return sendText(cfg, phoneNumberId, from, MSG.saved(keywords));
}

async function handleRegistration(cfg, phoneNumberId, from, msg) {
  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';

  if (!text || text.length < 2 || text.length > 60) {
    return sendText(cfg, phoneNumberId, from, MSG.registerNameInvalid);
  }
  const store = await createStore(cfg, from, text);
  await resetSession(cfg, from);
  return sendText(cfg, phoneNumberId, from, MSG.registerSuccess(store));
}

async function handleCustomer(cfg, phoneNumberId, from, msg, session) {
  if (IGNORED_TYPES.includes(msg.type)) return;

  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';
  const cmd = normalize(text);

  if (cmd === REGISTER_CMD) {
    await setSession(cfg, from, { state: 'await_store_name' });
    return sendText(cfg, phoneNumberId, from, MSG.registerAskName);
  }

  // الزبون يُنهي المتجر الحالي بنفسه
  if (cmd === LEAVE_CMD) {
    await setSession(cfg, from, { state: 'idle', active_store_id: null });
    return sendText(cfg, phoneNumberId, from, MSG.storeLeft);
  }

  // كود المتجر: يُحفظ في الجلسة، فلا يحتاج الزبون تكراره بعد ذلك
  if (/^\d{3}$/.test(text)) {
    const store = await getStoreByCode(cfg, text);
    if (!store || store.status !== 'active') {
      return sendText(cfg, phoneNumberId, from, MSG.codeInvalid);
    }
    await setSession(cfg, from, { state: 'customer', active_store_id: store.id });
    return sendWelcome(cfg, phoneNumberId, from, store);
  }

  // الزبون داخل متجر محفوظ في الجلسة: نرد من هذا المتجر مباشرة
  if (session.active_store_id) {
    const store = await getStoreById(cfg, session.active_store_id);
    if (!store || store.status !== 'active') {
      await setSession(cfg, from, { state: 'idle', active_store_id: null });
      return sendText(cfg, phoneNumberId, from, MSG.codeInvalid);
    }

    if (type === 'text' && text) {
      const row = await findReplyForText(cfg, store.id, text);
      if (row) return sendReply(cfg, phoneNumberId, from, row);
    }
    return sendText(cfg, phoneNumberId, from, MSG.customerUnknown);
  }

  return sendText(cfg, phoneNumberId, from, MSG.customerWelcome);
}

async function handleMessage(cfg, phoneNumberId, msg) {
  await loadBotMessages(cfg);

  const from = String(msg.from || '');
  const session = await getSession(cfg, from);

  const store = await getStoreByPhone(cfg, from);
  if (store) {
    return handleMerchant(cfg, phoneNumberId, from, store, msg, session);
  }

  if (session.state === 'await_store_name') {
    return handleRegistration(cfg, phoneNumberId, from, msg);
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

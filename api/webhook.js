const GRAPH = 'https://graph.facebook.com/v21.0';
const BUCKET = 'media';
const MAX_BYTES = 16 * 1024 * 1024;
const TEXT_MAX = 1000;
const KEYWORDS_MAX = 20;
const KEYWORD_LEN_MAX = 60;
const ALBUM_MAX = 10;
const TRIAL_REPLIES = 50;
const ACCESS_DAYS = 30;
const TOPIC_MAX = 30;
const NOTIFY_CHUNK = 15;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MEDIA_TYPES = ['audio', 'image', 'video'];
const IGNORED_TYPES = ['unsupported', 'reaction', 'sticker', 'system', 'unknown', 'order', 'contacts', 'location', 'interactive', 'button'];
const KIND_AR = { audio: 'صوت', image: 'صورة', video: 'فيديو' };
const BOT_NUMBER = (process.env.BOT_WA_NUMBER || '22224404036').replace(/\D/g, '');
const BOT_PHONE_NUMBER_ID = (process.env.BOT_PHONE_NUMBER_ID || '').trim();
const BOT_WA_TOKEN = (process.env.BOT_WA_TOKEN || '').trim();
const ADMIN_WA_NUMBER = (process.env.ADMIN_WA_NUMBER || '').replace(/\D/g, '');

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

function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 8) return '222' + d;
  return d;
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
const SUB_OFF_CMD = normalize('إيقاف الإشعارات');
const SUB_ON_CMD = normalize('تشغيل الإشعارات');
const NOTIFY_RE = /^اشعار (\d+)$/;

const MSG = {
  customerWelcome:
    '👋 *أهلاً بك!*\n\n' +
    'للحصول على الردود أرسل *كود المتجر* المكون من 3 أرقام.\n' +
    'مثال: 924\n\n' +
    'وإذا كنت تريد تسجيل متجرك، اكتب *تسجيل*.',
  customerMenu: (keywords) =>
    '✨ *أهلاً بك!* ✨\n\n' +
    '🛍️ اختر ما تريد بكتابة الكلمة التالية:\n\n' +
    keywords.map((k) => '🔹 ' + k).join('\n') +
    '\n\n💬 اكتب الكلمة كما هي وسيصلك الرد فوراً',
  customerStoreSet: (name) =>
    '✅ *مرحباً بك في ' + name + '* 🏪\n\n' +
    'اكتب كلمة للحصول على الرد، مثل:\n' +
    '• سلام\n• مرحبا\n\n' +
    'لتغيير المتجر اكتب *تغيير المتجر*.\n' +
    'لإيقاف الإشعارات اكتب *إيقاف الإشعارات*.',
  storeLeft: '↩️ *تم إنهاء المتجر الحالي*\n\nأرسل كود المتجر الجديد للمتابعة.',
  customerUnknown:
    '🤔 *لم أفهم طلبك*\n\n' +
    'اكتب كلمة من كلمات المتجر، أو اكتب *تغيير المتجر* لإدخال كود آخر.',
  codeInvalid: '❌ *الكود غير صحيح أو المتجر غير متاح*\n\nتأكد من الكود وأعد المحاولة.',
  accessGranted: (name, label, exp) =>
    '🔓 *تم فتح محتوى خاص*\n\n' +
    '🏪 ' + name + '\n' +
    '📂 النطاق: *' + label + '*\n' +
    '📅 صالح حتى: ' + exp + '\n\n' +
    'اكتب كلمة الرد للحصول عليه.',
  accessInvalid: '❌ *الكود غير صحيح أو منتهي الصلاحية*',
  accessBoundOther: '⛔ *هذا الكود مرتبط برقم آخر*\n\nتواصل مع المتجر للحصول على كود خاص بك.',
  privateDisabled: '⛔ *ميزة المحتوى الخاص موقوفة لحسابك*\n\nتواصل مع الإدارة لتفعيلها.',
  publicDisabled: '⛔ *الأكواد العامة غير مفعّلة لحسابك*\n\nتواصل مع الإدارة لتفعيلها.',
  storeStopped: '⛔ *حسابك موقوف حالياً*\n\nتواصل مع الإدارة لإعادة التفعيل.',
  customerSubscribed: '🔔 *تم تشغيل الإشعارات*\n\nستصلك إشعارات هذا المتجر عند إضافة الجديد.',
  customerUnsubscribed: '🔕 *تم إيقاف الإشعارات*\n\nاكتب *تشغيل الإشعارات* لإعادتها.',
  notifyNoStore: '⚠️ أدخل كود المتجر أولاً، ثم اكتب *إيقاف الإشعارات* أو *تشغيل الإشعارات*.',
  notifyHeader: (name) => '📢 *جديد في ' + name + '*\n\n',
  notifyNoFeature: '⛔ *خاصية الإشعارات غير مفعلة لحسابك*\n\nتواصل مع الإدارة لتفعيلها.',
  notifyNoQuota: '⛔ *انتهت حصة الإشعارات لهذا الشهر*\n\nتواصل مع الإدارة لتجديدها.',
  notifyNoSubscribers: '📭 لا يوجد مشتركون يستقبلون هذا الإشعار بعد.',
  notifyDone: (sent, remaining) =>
    '📢 *تم إرسال الإشعار*\n\n' +
    'عدد المستلمين: *' + sent + '*\n' +
    'الحصة المتبقية هذا الشهر: *' + remaining + '* إشعار',
  registerAskName:
    '✍️ *تسجيل متجر جديد*\n\n' +
    'اكتب اسم متجرك كما تريد أن يظهر للزبائن.\n' +
    '(من 2 إلى 60 حرفاً)',
  registerNameInvalid: '⚠️ اسم المتجر يجب أن يكون بين 2 و 60 حرفاً. اكتب الاسم مرة أخرى.',
  registerAlready:
    '⚠️ *هذا الرقم مسجل مسبقاً كتاجر*\n\n' +
    'اكتب *قائمة* لعرض متجرك، أو تواصل مع الإدارة إن احتجت مساعدة.',
  registerFailed: '⚠️ *تعذر إتمام التسجيل*\n\nأعد المحاولة بعد قليل.',
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
  accessCreated: (code, label, exp, kind) =>
    '🔑 *كود دخول: ' + label + '*\n\n' +
    '*' + code + '*\n' +
    '📅 صالح حتى: ' + exp + ' (شهر)\n\n' +
    (kind === 'personal'
      ? '🔒 كود شخصي: يُربط بأول رقم يستخدمه، فأعطه للطالب المعني فقط.'
      : '🌐 كود عام: يستخدمه من يملكه ضمن النطاق المحدد.'),
  accessRequestUsage:
    '✏️ اكتب:\n' +
    '• *كود دورة1* لكود شخصي لموضوع\n' +
    '• *كود عام* لكود عام للمتجر كله\n' +
    '• *كود عام دورة1* لكود عام لموضوع',
  topicMissing: (topic) =>
    '⚠️ لا يوجد رد خاص بموضوع *' + topic + '*.\n' +
    'أنشئ رداً ثم اجعله خاصاً بكتابة *خاص رقم ' + topic + '*.',
  privateSet: (n, topic) => '🔒 تم جعل الرد رقم ' + n + ' خاصاً بموضوع: *' + topic + '*',
  publicSet: (n) => '🔓 تم جعل الرد رقم ' + n + ' *عاماً*',
  privateUsage: '✏️ اكتب: *خاص 2 دورة1*\n(رقم الرد ثم اسم الموضوع)',
  menu: (store, used, quota) =>
    '📋 *قائمة التاجر*\n' +
    '━━━━━━━━━━━━\n' +
    '🎉 *ترحيب* ← الرسالة التي يستقبلها الزبون عند دخول متجرك\n' +
    '➕ *إضافة* ← رد جديد\n' +
    '✏️ *تعديل* ← تعديل رد موجود\n' +
    '🗑 *حذف 2* ← حذف الرد رقم 2\n' +
    '🔒 *خاص 2 دورة1* ← جعل الرد رقم 2 خاصاً بموضوع\n' +
    '🔓 *عام 2* ← جعل الرد رقم 2 عاماً\n' +
    '🔑 *كود دورة1* ← كود شخصي لطالب في موضوع\n' +
    '🌐 *كود عام* ← كود عام للمتجر كله\n' +
    '📢 *إشعار 2* ← إرسال الرد رقم 2 لجميع المشتركين\n' +
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

// يسجل معرّف الرسالة في قاعدة البيانات، ويرجع false إذا كانت معالجة من قبل
async function claimMessage(cfg, id) {
  if (!id) return true;
  const r = await fetch(`${cfg.url}/rest/v1/processed_messages`, {
    method: 'POST',
    headers: { ...sbHeaders(cfg.key), Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ id }),
  });
  if (!r.ok) return true;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
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

const STORE_FIELDS = 'id,name,status,merchant_code,replies_quota,replies_used,welcome_text,welcome_media_ids,private_enabled,public_codes_enabled,notify_quota,notify_used,wa_phone_number_id,wa_token';

async function getStoreById(cfg, id) {
  const r = await fetch(`${cfg.url}/rest/v1/stores?id=eq.${id}&select=${STORE_FIELDS}`, {
    headers: sbHeaders(cfg.key),
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getStoreByWaNumber(cfg, phoneNumberId) {
  if (!phoneNumberId) return null;
  const r = await fetch(
    `${cfg.url}/rest/v1/stores?wa_phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&select=${STORE_FIELDS}`,
    { headers: sbHeaders(cfg.key) }
  );
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
    phone: normalizePhone(phone),
    merchant_code: code,
    status: 'active',
    plan: 'trial',
    replies_quota: TRIAL_REPLIES,
    replies_used: 0,
  });
}

async function upsertCustomer(cfg, storeId, phone, subscribed) {
  const body = { store_id: storeId, phone, last_seen_at: new Date().toISOString() };
  if (subscribed !== undefined) body.subscribed = subscribed;
  const r = await fetch(`${cfg.url}/rest/v1/store_customers?on_conflict=store_id,phone`, {
    method: 'POST',
    headers: { ...sbHeaders(cfg.key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('customer upsert failed', r.status);
}

// يعيد true إذا كان الزبون جديداً في هذا المتجر (لم يكن مسجلاً من قبل)
async function isNewCustomer(cfg, storeId, phone) {
  const r = await fetch(
    `${cfg.url}/rest/v1/store_customers?store_id=eq.${storeId}&phone=eq.${phone}&select=id&limit=1`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return !(Array.isArray(rows) && rows.length > 0);
}

async function redeemAccess(cfg, accessId, storeId, phone) {
  const r = await fetch(`${cfg.url}/rest/v1/access_redemptions?on_conflict=access_code_id,phone`, {
    method: 'POST',
    headers: { ...sbHeaders(cfg.key), Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ access_code_id: accessId, store_id: storeId, phone }),
  });
  if (!r.ok) console.error('redeem failed', r.status);
}

async function getRecipients(cfg, storeId, topic) {
  const r = await fetch(
    `${cfg.url}/rest/v1/store_customers?store_id=eq.${storeId}&subscribed=eq.true&select=phone&limit=10000`,
    { headers: sbHeaders(cfg.key) }
  );
  const subs = await r.json();
  if (!Array.isArray(subs)) return [];
  let phones = subs.map(s => s.phone);

  if (topic) {
    const now = encodeURIComponent(new Date().toISOString());
    const ar = await fetch(
      `${cfg.url}/rest/v1/access_codes?store_id=eq.${storeId}&topic=eq.${encodeURIComponent(topic)}&expires_at=gt.${now}&revoked=eq.false&select=id`,
      { headers: sbHeaders(cfg.key) }
    );
    const codes = await ar.json();
    const ids = Array.isArray(codes) ? codes.map(c => c.id) : [];
    if (ids.length === 0) return [];

    const rr = await fetch(
      `${cfg.url}/rest/v1/access_redemptions?access_code_id=in.(${ids.join(',')})&select=phone`,
      { headers: sbHeaders(cfg.key) }
    );
    const red = await rr.json();
    const allowed = new Set(Array.isArray(red) ? red.map(x => x.phone) : []);
    phones = phones.filter(p => allowed.has(p));
  }
  return phones;
}

async function buildPayload(cfg, row, header) {
  if (row.kind === 'text') return { type: 'text', body: header + row.content };

  const ids = row.kind === 'album' ? (row.media_ids || []) : (row.media_id ? [row.media_id] : []);
  if (ids.length === 0) return null;

  const r = await fetch(
    `${cfg.url}/rest/v1/media_files?id=in.(${ids.join(',')})&select=id,kind,storage_path`,
    { headers: sbHeaders(cfg.key) }
  );
  const files = await r.json();
  if (!Array.isArray(files)) return null;

  const byId = new Map(files.map(f => [f.id, f]));
  const items = ids.map(id => byId.get(id)).filter(Boolean).map(f => ({ kind: f.kind, path: f.storage_path }));
  if (items.length === 0) return null;
  return { type: 'media', header, items };
}

async function sendPayloadTo(cfg, phoneNumberId, to, payload) {
  if (payload.type === 'text') return sendRaw(cfg, phoneNumberId, to, payload.body);

  if (payload.items[0].kind === 'audio') {
    await sendRaw(cfg, phoneNumberId, to, payload.header.trim());
  }
  for (let i = 0; i < payload.items.length; i++) {
    const it = payload.items[i];
    const caption = i === 0 && it.kind !== 'audio' ? payload.header.trim() : null;
    await sendMediaTo(cfg, phoneNumberId, to, it.kind, it.path, caption);
  }
}

async function broadcast(cfg, phoneNumberId, payload, phones) {
  for (let i = 0; i < phones.length; i += NOTIFY_CHUNK) {
    const chunk = phones.slice(i, i + NOTIFY_CHUNK);
    await Promise.all(chunk.map(p =>
      sendPayloadTo(cfg, phoneNumberId, p, payload).catch(err =>
        console.error('notify failed:', err?.message || err)
      )
    ));
  }
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

async function findReplyForText(cfg, storeId, text, allowedTopic) {
  const cleaned = normalize(text);
  const rows = await listStoreReplies(cfg, storeId);
  for (const row of rows) {
    const visible = allowedTopic === 'ALL' || !row.topic || row.topic === allowedTopic;
    if (!visible) continue;
    if ((row.keywords || []).includes(cleaned)) return row;
  }
  return null;
}

async function listStoreReplies(cfg, storeId) {
  const r = await fetch(
    `${cfg.url}/rest/v1/auto_replies?store_id=eq.${storeId}&select=id,keywords,kind,content,media_id,media_ids,topic,created_at&order=created_at.asc`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

async function listMenuKeywords(cfg, storeId) {
  const r = await fetch(
    `${cfg.url}/rest/v1/auto_replies?store_id=eq.${storeId}&is_private=eq.false&select=keywords`,
    { headers: sbHeaders(cfg.key) }
  );
  if (!r.ok) return [];
  const rows = await r.json();
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const k of row.keywords || []) if (k) seen.add(k);
  }
  return [...seen];
}

async function sendKeywordMenu(cfg, phoneNumberId, to, storeId) {
  const keywords = await listMenuKeywords(cfg, storeId);
  if (keywords.length === 0) return sendText(cfg, phoneNumberId, to, MSG.customerUnknown);
  return sendText(cfg, phoneNumberId, to, MSG.customerMenu(keywords));
}

async function deleteReplyById(cfg, id) {
  const r = await fetch(`${cfg.url}/rest/v1/auto_replies?id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error('delete failed');
}

function randomAccessCode() {
  while (true) {
    let s = '';
    for (let i = 0; i < 3; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (/[A-Z]/.test(s)) return s;
  }
}

async function createAccessCode(cfg, storeId, topic, kind) {
  const expires = new Date(Date.now() + ACCESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${cfg.url}/rest/v1/access_codes`, {
      method: 'POST',
      headers: { ...sbHeaders(cfg.key), Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeId,
        code: randomAccessCode(),
        topic,
        kind,
        expires_at: expires,
      }),
    });
    const d = await r.json();
    if (r.ok && Array.isArray(d) && d[0]) return d[0];
  }
  throw new Error('تعذر إنشاء كود الدخول');
}

async function getAccessByCode(cfg, code) {
  const r = await fetch(
    `${cfg.url}/rest/v1/access_codes?code=eq.${code}&select=id,code,store_id,topic,kind,bound_phone,revoked,expires_at`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function bindPersonalCode(cfg, ac, phone) {
  if (ac.bound_phone === phone) return true;
  if (ac.bound_phone) return false;

  const r = await fetch(
    `${cfg.url}/rest/v1/access_codes?id=eq.${ac.id}&bound_phone=is.null`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(cfg.key), Prefer: 'return=representation' },
      body: JSON.stringify({ bound_phone: phone }),
    }
  );
  const rows = await r.json().catch(() => []);
  if (Array.isArray(rows) && rows.length > 0) return true;

  const fresh = await getAccessByCode(cfg, ac.code || '');
  return Boolean(fresh && fresh.bound_phone === phone);
}

async function getActiveAccess(cfg, session) {
  if (!session.access_code_id) return null;
  const r = await fetch(
    `${cfg.url}/rest/v1/access_codes?id=eq.${session.access_code_id}&select=id,store_id,topic,kind,revoked,expires_at`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  if (row.revoked) return null;
  if (row.store_id !== session.active_store_id) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row;
}

async function topicExists(cfg, storeId, topic) {
  const r = await fetch(
    `${cfg.url}/rest/v1/auto_replies?store_id=eq.${storeId}&topic=eq.${encodeURIComponent(topic)}&select=id&limit=1`,
    { headers: sbHeaders(cfg.key) }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function setReplyTopic(cfg, id, topic) {
  const r = await fetch(`${cfg.url}/rest/v1/auto_replies?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=minimal' },
    body: JSON.stringify({ topic, is_private: Boolean(topic) }),
  });
  if (!r.ok) throw new Error('topic update failed');
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
  const lock = row.topic ? '🔒 ' + row.topic + ' | ' : '';
  return lock + '*' + kw + '*\n    ' + kind;
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
    '🔒 أو *خاص رقم موضوع* لجعله خاصاً\n' +
    '🔓 أو *عام رقم* لجعله عاماً\n' +
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
  const spaced = text.replace(/\s+/g, ' ');
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

  const nm = cmd.match(NOTIFY_RE);
  if (nm) {
    if (!store.notify_quota) {
      return sendText(cfg, phoneNumberId, from, MSG.notifyNoFeature);
    }
    const n = parseInt(nm[1], 10);
    const list = await listStoreReplies(cfg, store.id);
    const target = list[n - 1];
    if (!target) return sendText(cfg, phoneNumberId, from, MSG.replyNumberNotFound);

    const used = store.notify_used || 0;
    const quota = store.notify_quota || 0;
    if (used >= quota) return sendText(cfg, phoneNumberId, from, MSG.notifyNoQuota);

    const payload = await buildPayload(cfg, target, MSG.notifyHeader(store.name));
    if (!payload) return sendText(cfg, phoneNumberId, from, MSG.editEmpty);

    const phones = await getRecipients(cfg, store.id, target.topic || null);
    if (phones.length === 0) return sendText(cfg, phoneNumberId, from, MSG.notifyNoSubscribers);

    await patchStore(cfg, store.id, { notify_used: used + 1 });
    await broadcast(cfg, phoneNumberId, payload, phones);
    return sendText(cfg, phoneNumberId, from, MSG.notifyDone(phones.length, quota - used - 1));
  }

  const isPrivateCmd = /^كود /.test(spaced) || /^خاص /.test(spaced);
  if (isPrivateCmd && store.private_enabled === false) {
    return sendText(cfg, phoneNumberId, from, MSG.privateDisabled);
  }

  const pubCodeM = spaced.match(/^كود عام(?: (.+))?$/);
  if (pubCodeM) {
    if (store.public_codes_enabled !== true) {
      return sendText(cfg, phoneNumberId, from, MSG.publicDisabled);
    }
    const topic = pubCodeM[1] ? pubCodeM[1].trim().slice(0, TOPIC_MAX) : null;
    if (topic && !(await topicExists(cfg, store.id, topic))) {
      return sendText(cfg, phoneNumberId, from, MSG.topicMissing(topic));
    }
    const ac = await createAccessCode(cfg, store.id, topic, 'public');
    const exp = new Date(ac.expires_at).toISOString().slice(0, 10);
    return sendText(cfg, phoneNumberId, from,
      MSG.accessCreated(ac.code, topic || 'كل المحتوى الخاص', exp, 'public'));
  }

  const codeM = spaced.match(/^كود (.+)$/);
  if (codeM) {
    const topic = codeM[1].trim().slice(0, TOPIC_MAX);
    if (!topic) return sendText(cfg, phoneNumberId, from, MSG.accessRequestUsage);
    if (!(await topicExists(cfg, store.id, topic))) {
      return sendText(cfg, phoneNumberId, from, MSG.topicMissing(topic));
    }
    const ac = await createAccessCode(cfg, store.id, topic, 'personal');
    const exp = new Date(ac.expires_at).toISOString().slice(0, 10);
    return sendText(cfg, phoneNumberId, from, MSG.accessCreated(ac.code, topic, exp, 'personal'));
  }

  const privM = spaced.match(/^خاص (\d+) (.+)$/);
  if (privM) {
    const n = parseInt(privM[1], 10);
    const topic = privM[2].trim().slice(0, TOPIC_MAX);
    const list = await listStoreReplies(cfg, store.id);
    const target = list[n - 1];
    if (!target) return sendText(cfg, phoneNumberId, from, MSG.replyNumberNotFound);
    await setReplyTopic(cfg, target.id, topic);
    return sendText(cfg, phoneNumberId, from, MSG.privateSet(n, topic));
  }

  if (/^خاص \d+$/.test(spaced)) {
    return sendText(cfg, phoneNumberId, from, MSG.privateUsage);
  }

  const pubM = spaced.match(/^عام (\d+)$/);
  if (pubM) {
    const n = parseInt(pubM[1], 10);
    const list = await listStoreReplies(cfg, store.id);
    const target = list[n - 1];
    if (!target) return sendText(cfg, phoneNumberId, from, MSG.replyNumberNotFound);
    await setReplyTopic(cfg, target.id, null);
    return sendText(cfg, phoneNumberId, from, MSG.publicSet(n));
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
      row = await findReplyForText(cfg, store.id, text, 'ALL');
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

  const phone = normalizePhone(from);
  const existing = await getStoreByPhone(cfg, phone);
  if (existing) {
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.registerAlready);
  }

  try {
    const store = await createStore(cfg, phone, text);
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.registerSuccess(store));
  } catch (err) {
    console.error('register failed:', err?.message || err);
    await resetSession(cfg, from);
    return sendText(cfg, phoneNumberId, from, MSG.registerAlready);
  }
}

// زبائن الرقم المشترك (يكتبون كود المتجر)
async function handleCustomer(cfg, phoneNumberId, from, msg, session) {
  if (IGNORED_TYPES.includes(msg.type)) return;

  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';
  const cmd = normalize(text);

  if (cmd === REGISTER_CMD) {
    await setSession(cfg, from, { state: 'await_store_name' });
    return sendText(cfg, phoneNumberId, from, MSG.registerAskName);
  }

  if (cmd === LEAVE_CMD) {
    await setSession(cfg, from, { state: 'idle', active_store_id: null, access_code_id: null });
    return sendText(cfg, phoneNumberId, from, MSG.storeLeft);
  }

  if (cmd === SUB_OFF_CMD || cmd === SUB_ON_CMD) {
    if (!session.active_store_id) {
      return sendText(cfg, phoneNumberId, from, MSG.notifyNoStore);
    }
    const on = cmd === SUB_ON_CMD;
    await upsertCustomer(cfg, session.active_store_id, from, on);
    return sendText(cfg, phoneNumberId, from, on ? MSG.customerSubscribed : MSG.customerUnsubscribed);
  }

  if (/^\d{3}$/.test(text)) {
    const store = await getStoreByCode(cfg, text);
    if (!store || store.status !== 'active') {
      return sendText(cfg, phoneNumberId, from, MSG.codeInvalid);
    }
    await setSession(cfg, from, { state: 'customer', active_store_id: store.id, access_code_id: null });
    await upsertCustomer(cfg, store.id, from);
    return sendWelcome(cfg, phoneNumberId, from, store);
  }

  const up = text.replace(/\s/g, '').toUpperCase();
  if (/^[A-Z0-9]{3}$/.test(up) && /[A-Z]/.test(up)) {
    const ac = await getAccessByCode(cfg, up);
    if (!ac || ac.revoked || new Date(ac.expires_at).getTime() <= Date.now()) {
      return sendText(cfg, phoneNumberId, from, MSG.accessInvalid);
    }
    const store = await getStoreById(cfg, ac.store_id);
    if (!store || store.status !== 'active' || store.private_enabled === false) {
      return sendText(cfg, phoneNumberId, from, MSG.accessInvalid);
    }

    if (ac.kind === 'personal') {
      const ok = await bindPersonalCode(cfg, ac, from);
      if (!ok) return sendText(cfg, phoneNumberId, from, MSG.accessBoundOther);
    }

    await setSession(cfg, from, { state: 'customer', active_store_id: store.id, access_code_id: ac.id });
    await upsertCustomer(cfg, store.id, from);
    await redeemAccess(cfg, ac.id, store.id, from);
    return sendText(cfg, phoneNumberId, from,
      MSG.accessGranted(
        store.name,
        ac.topic || 'كل المحتوى الخاص',
        new Date(ac.expires_at).toISOString().slice(0, 10)
      ));
  }

  if (session.active_store_id) {
    const store = await getStoreById(cfg, session.active_store_id);
    if (!store || store.status !== 'active') {
      await setSession(cfg, from, { state: 'idle', active_store_id: null, access_code_id: null });
      return sendText(cfg, phoneNumberId, from, MSG.codeInvalid);
    }

    const isNew = await isNewCustomer(cfg, store.id, from);
    await upsertCustomer(cfg, store.id, from);

    const access = store.private_enabled === false ? null : await getActiveAccess(cfg, session);
    const allowed = access ? (access.topic || 'ALL') : null;

    if (type === 'text' && text) {
      const row = await findReplyForText(cfg, store.id, text, allowed);
      if (row) return sendReply(cfg, phoneNumberId, from, row);
    }

    if (isNew) return sendText(cfg, phoneNumberId, from, MSG.customerWelcome);
    return sendKeywordMenu(cfg, phoneNumberId, from, store.id);
    
   // ترحيب واحد فقط لكل زبون جديد بلا متجر، ثم يصمت البوت عن الرسائل غير المفهومة
  if (!session.state || session.state === 'idle') {
    await setSession(cfg, from, { state: 'customer' });
    return sendText(cfg, phoneNumberId, from, MSG.customerWelcome);
  }
  return;

// زبائن الرقم الخاص (رقم مستقل لكل متجر)
async function handlePrivateCustomer(pcfg, pid, from, store, msg, session) {
  if (IGNORED_TYPES.includes(msg.type)) return;

  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';
  const cmd = normalize(text);

  if (store.status !== 'active') {
    return sendText(pcfg, pid, from, MSG.storeStopped);
  }

  if (cmd === SUB_OFF_CMD || cmd === SUB_ON_CMD) {
    const on = cmd === SUB_ON_CMD;
    await upsertCustomer(pcfg, store.id, from, on);
    return sendText(pcfg, pid, from, on ? MSG.customerSubscribed : MSG.customerUnsubscribed);
  }

  // الترحيب يُرسل مرة واحدة فقط لكل زبون جديد
  const newcomer = await isNewCustomer(pcfg, store.id, from);
  if (newcomer) {
    await setSession(pcfg, from, { state: 'customer', active_store_id: store.id, access_code_id: null });
    await upsertCustomer(pcfg, store.id, from);
    return sendWelcome(pcfg, pid, from, store);
  }

  await upsertCustomer(pcfg, store.id, from);

  const up = text.replace(/\s/g, '').toUpperCase();
  if (/^[A-Z0-9]{3}$/.test(up) && /[A-Z]/.test(up)) {
    const ac = await getAccessByCode(pcfg, up);
    if (
      !ac || ac.revoked || ac.store_id !== store.id ||
      new Date(ac.expires_at).getTime() <= Date.now() ||
      store.private_enabled === false
    ) {
      return sendText(pcfg, pid, from, MSG.accessInvalid);
    }
    if (ac.kind === 'personal') {
      const ok = await bindPersonalCode(pcfg, ac, from);
      if (!ok) return sendText(pcfg, pid, from, MSG.accessBoundOther);
    }
    await setSession(pcfg, from, { state: 'customer', active_store_id: store.id, access_code_id: ac.id });
    await redeemAccess(pcfg, ac.id, store.id, from);
    return sendText(pcfg, pid, from,
      MSG.accessGranted(
        store.name,
        ac.topic || 'كل المحتوى الخاص',
        new Date(ac.expires_at).toISOString().slice(0, 10)
      ));
  }

  const access = store.private_enabled === false ? null : await getActiveAccess(pcfg, session);
  const allowed = access ? (access.topic || 'ALL') : null;

  if (type === 'text' && text) {
    const row = await findReplyForText(pcfg, store.id, text, allowed);
    if (row) return sendReply(pcfg, pid, from, row);
  }

  return sendKeywordMenu(pcfg, pid, from, store.id);
}

// حفظ ملف الترحيب المركزي في التخزين، ويعيد مساره
async function saveCentralMedia(cfg, msg, type) {
  const obj = msg[type] || {};
  if (!obj.id) throw new Error('الرسالة لا تحمل ملفاً');
  const metaRes = await fetch(`${GRAPH}/${obj.id}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
  const meta = await metaRes.json();
  if (!meta.url) throw new Error('تعذر الوصول للملف من واتساب');
  if (meta.file_size && meta.file_size > MAX_BYTES) throw new Error('الملف كبير جداً');
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!fileRes.ok) throw new Error('تعذر تحميل الملف');
  const buf = Buffer.from(await fileRes.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('الملف كبير جداً');
  const mime = String(obj.mime_type || meta.mime_type || 'application/octet-stream').split(';')[0];
  const ext = EXT_BY_MIME[mime] || 'bin';
  const path = `central/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const up = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, 'Content-Type': mime, 'x-upsert': 'false' },
    body: buf,
  });
  if (!up.ok) throw new Error('فشل حفظ الملف في التخزين');
  return path;
}

// تحديث رسالة مركزية موجودة في جدول bot_messages (يحافظ على label وdefault_value)
async function saveBotRow(cfg, key, row) {
  const r = await fetch(`${cfg.url}/rest/v1/bot_messages?key=eq.${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=minimal' },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('bot message save failed: ' + r.status);
}

// أوامر الأدمن على الرقم المركزي. يعيد true إذا عالج الرسالة
async function handleCentralAdmin(cfg, pid, from, msg, session) {
  const type = msg.type;
  const text = type === 'text' ? String(msg.text?.body || '').trim() : '';
  const cmd = normalize(text);

  if (session.state !== 'await_welcome') {
    if (cmd === WELCOME_CMD) {
      await setSession(cfg, from, { state: 'await_welcome' });
      await sendText(cfg, pid, from,
        '✏️ *ترحيب البوت المركزي*\n\n' +
        'أرسل الآن نصاً أو صوتاً أو صورة أو فيديو.\n' +
        'الملف الأخير يُعتمد. عند الانتهاء اكتب *تم*.\n' +
        'للخروج اكتب *إلغاء*.');
      return true;
    }
    return false;
  }

  if (cmd === CANCEL_CMD) {
    await resetSession(cfg, from);
    await sendText(cfg, pid, from, '❌ *تم الإلغاء*');
    return true;
  }

  if (cmd === DONE_CMD) {
    await resetSession(cfg, from);
    await sendText(cfg, pid, from, '✅ *تم حفظ ترحيب البوت المركزي*');
    return true;
  }

  if (MEDIA_TYPES.includes(type)) {
    try {
      const path = await saveCentralMedia(cfg, msg, type);
      await saveBotRow(cfg, 'customerWelcome', { kind: type, media_path: path, value: '' });
      await sendText(cfg, pid, from, '✅ تم حفظ الملف. أرسل ملفاً آخر لتغييره، أو اكتب *تم*.');
    } catch (err) {
      console.error('central media error:', err?.message || err);
      await sendText(cfg, pid, from, '⚠️ تعذر حفظ الملف: ' + (err?.message || 'خطأ غير معروف'));
    }
    return true;
  }

  if (type === 'text' && text) {
    try {
      await saveBotRow(cfg, 'customerWelcome', { value: text, kind: 'text', media_path: null });
      await sendText(cfg, pid, from, '✅ تم حفظ النص. أرسل ملفاً إن أردت، أو اكتب *تم*.');
    } catch (err) {
      console.error('central text error:', err?.message || err);
      await sendText(cfg, pid, from, '⚠️ تعذر حفظ النص');
    }
    return true;
  }

  return true;
}

async function handleMessage(cfg, phoneNumberId, msg) {
  await loadBotMessages(cfg);

  const from = String(msg.from || '');
  const session = await getSession(cfg, from);

  // الرقم المركزي: يستخدم توكن البوت المركزي ولا يتأثر بجلسة الرقم الخاص
  if (BOT_PHONE_NUMBER_ID && phoneNumberId === BOT_PHONE_NUMBER_ID) {
    const bcfg = { ...cfg, token: BOT_WA_TOKEN || cfg.token };

    if (ADMIN_WA_NUMBER && from === ADMIN_WA_NUMBER) {
      const handled = await handleCentralAdmin(bcfg, phoneNumberId, from, msg, session);
      if (handled) return;
    }

    if (session.state === 'await_store_name') {
      return handleRegistration(bcfg, phoneNumberId, from, msg);
    }

    const csession = { ...session, active_store_id: null, access_code_id: null };
    return handleCustomer(bcfg, phoneNumberId, from, msg, csession);
  }

  const store = await getStoreByPhone(cfg, from);
  if (store) {
    return handleMerchant(cfg, phoneNumberId, from, store, msg, session);
  }

  const privateStore = await getStoreByWaNumber(cfg, phoneNumberId);
  if (privateStore && privateStore.wa_token) {
    const pcfg = { ...cfg, token: privateStore.wa_token };
    return handlePrivateCustomer(pcfg, phoneNumberId, from, privateStore, msg, session);
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
          if (!(await claimMessage(cfg, msg.id))) continue;
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

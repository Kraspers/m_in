const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MASTER_SECRET = process.env.MINIMUM_SECRET || process.env.SESSION_SECRET || 'minimum-local-development-secret-change-me';
const MASTER_KEY = crypto.createHash('sha256').update(MASTER_SECRET).digest();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const sessions = new Map(); // token -> session
const sseClients = new Map(); // token -> SSE response
const linkPreviewCache = new Map();

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const defaultDb = {
      users: [],
      chats: [],
      groups: [],
      messages: [],
      moderation: { bans: [], logs: [], adminRoutes: [] }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!Array.isArray(db.groups)) db.groups = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (!Array.isArray(db.users)) db.users = [];
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 12 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function hashPasswordSecure(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.pbkdf2Sync(String(password || ''), salt, 210000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$210000$${salt}$${derived}`;
}
function verifyPassword(password, stored) {
  const value = String(stored || '');
  if (value.startsWith('pbkdf2_sha256$')) {
    const parts = value.split('$');
    if (parts.length !== 4) return false;
    const [, iterationsRaw, salt, hash] = parts;
    const iterations = Math.max(100000, Number(iterationsRaw) || 210000);
    const probe = crypto.pbkdf2Sync(String(password || ''), salt, iterations, 32, 'sha256').toString('hex');
    try { return crypto.timingSafeEqual(Buffer.from(probe, 'hex'), Buffer.from(hash, 'hex')); } catch { return false; }
  }
  const legacy = hashPassword(password || '');
  try { return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(value)); } catch { return false; }
}
function shouldUpgradePasswordHash(stored) {
  return !String(stored || '').startsWith('pbkdf2_sha256$210000$');
}
function encryptString(value) {
  const text = String(value || '');
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}
function decryptString(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (!raw.startsWith('v1:')) return raw;
  try {
    const [, ivB64, tagB64, encB64] = raw.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
function getUserVpscCode(user) {
  if (!user) return '';
  return decryptString(user.vpscCodeEnc || user.vpscCode || '');
}
function setUserVpscCode(user, code) {
  user.vpscCodeEnc = encryptString(code);
  delete user.vpscCode;
}
function migrateUserSecrets(user) {
  let changed = false;
  if (user && user.vpscCode && !user.vpscCodeEnc) {
    setUserVpscCode(user, user.vpscCode);
    changed = true;
  }
  return changed;
}
function decryptLegacyE2eeText(e2ee, fromUserId, toUserId) {
  if (!e2ee || !e2ee.ciphertext || !e2ee.iv) return '';
  try {
    const ids = [String(fromUserId || ''), String(toUserId || '')].sort().join(':');
    const secret = `minimum:e2ee:v1:${ids}`;
    const key = crypto.pbkdf2Sync(secret, 'minimum-chat-e2ee', 20000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(String(e2ee.iv), 'base64'));
    const raw = Buffer.from(String(e2ee.ciphertext), 'base64');
    const tag = raw.subarray(raw.length - 16);
    const enc = raw.subarray(0, raw.length - 16);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
function plainTextFromBody(text, e2ee, fromUserId, toUserId) {
  return (String(text || '').trim() || decryptLegacyE2eeText(e2ee, fromUserId, toUserId)).slice(0, 4000);
}
function secureMessageForStorage(msg) {
  if (!msg || msg.isSystem) return msg;
  if (msg.e2ee && !messageText(msg)) {
    const e2eeText = decryptLegacyE2eeText(msg.e2ee, msg.fromUserId, msg.toUserId);
    if (e2eeText) { msg.textEnc = encryptString(e2eeText.slice(0, 4000)); msg.text = ''; }
  }
  if (msg.e2ee && messageText(msg)) msg.e2ee = null;
  if (msg.text && !msg.textEnc) { msg.textEnc = encryptString(msg.text); msg.text = ''; }
  if (Array.isArray(msg.media) && msg.media.length && !Array.isArray(msg.mediaEnc)) { msg.mediaEnc = msg.media.map(encryptString); msg.media = []; }
  return msg;
}
function messageText(msg) { return decryptString(msg.textEnc || msg.text || ''); }
function messageMedia(msg) {
  if (Array.isArray(msg.mediaEnc) && msg.mediaEnc.length) return msg.mediaEnc.map(decryptString).filter(Boolean);
  return Array.isArray(msg.media) ? msg.media : [];
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}


function isValidUsername(username) {
  const u = String(username || '').trim();
  return /^[A-Za-z0-9_]{5,70}$/.test(u);
}
function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function makeVpscCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function normalizeVpscCode(code) {
  return String(code || '').trim().toLowerCase();
}
function makeUniqueVpscCode(db) {
  let code = makeVpscCode();
  const used = new Set((db.users || []).map(u => normalizeVpscCode(getUserVpscCode(u))));
  while (used.has(normalizeVpscCode(code))) code = makeVpscCode();
  return code;
}

function getSessionByToken(token) {
  if (!token || !sessions.has(token)) return null;
  const s = sessions.get(token);
  return s && typeof s === 'object' ? s : null;
}
function getUserByToken(req, db) {
  const token = req.headers['x-session-token'];
  const session = getSessionByToken(token);
  if (!session) return null;
  session.lastSeenAt = new Date().toISOString();
  sessions.set(token, session);
  return db.users.find(u => u.id === session.userId) || null;
}
function parseDeviceInfo(req) {
  const ua = String(req.headers['user-agent'] || 'MIN Web');
  const ipRaw = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
  const ip = ipRaw.split(',')[0].trim() || 'Unknown';
  const rawCountry = String(req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || req.headers['x-country-code'] || '').trim();
  const city = String(req.headers['x-vercel-ip-city'] || req.headers['x-city'] || '').trim();
  let country = rawCountry;
  if (rawCountry && rawCountry.length <= 3) {
    try {
      const dn = new Intl.DisplayNames(['ru'], { type: 'region' });
      country = dn.of(rawCountry.toUpperCase()) || rawCountry;
    } catch {
      const map = { TR: 'Турция', US: 'США', RU: 'Россия' };
      country = map[rawCountry.toUpperCase()] || rawCountry;
    }
  }
  const location = [city, country].filter(Boolean).join(', ') || 'Unknown';
  return { ua, ip, location };
}
function deviceBanKeyFromInfo(info) {
  return crypto.createHash('sha256')
    .update([String(info.ip || ''), String(info.ua || '')].join('::'))
    .digest('hex');
}
function deviceBanKeyFromRequest(req) {
  return deviceBanKeyFromInfo(parseDeviceInfo(req));
}

function deriveDeviceMeta(uaRaw) {
  const ua = String(uaRaw || '').toLowerCase();
  if (ua.includes('android')) return { deviceName: 'Android', osVersion: 'Android' };
  if (ua.includes('iphone')) return { deviceName: 'iPhone', osVersion: 'iOS' };
  if (ua.includes('ipad')) return { deviceName: 'iPad', osVersion: 'iPadOS' };
  if (ua.includes('mac os')) return { deviceName: 'MacOS', osVersion: 'macOS' };
  if (ua.includes('windows nt 10.0')) return { deviceName: 'Windows', osVersion: 'Windows 10/11 x64' };
  if (ua.includes('windows')) return { deviceName: 'Windows', osVersion: 'Windows' };
  if (ua.includes('linux')) return { deviceName: 'Linux', osVersion: 'Linux' };
  return { deviceName: 'MIN Web', osVersion: 'Web' };
}
function createSession(req, userId) {
  const token = makeToken();
  const { ua, ip, location } = parseDeviceInfo(req);
  const meta = deriveDeviceMeta(ua);
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    token,
    userId,
    ua,
    deviceName: meta.deviceName,
    osVersion: meta.osVersion,
    ip,
    app: 'MIN Web',
    os: meta.osVersion,
    location,
    createdAt: now,
    lastSeenAt: now
  };
  sessions.set(token, session);
  return session;
}


function ensureModeration(db) {
  if (!db.moderation) db.moderation = { bans: [], logs: [], adminRoutes: [] };
  if (!Array.isArray(db.moderation.bans)) db.moderation.bans = [];
  if (!Array.isArray(db.moderation.logs)) db.moderation.logs = [];
  if (!Array.isArray(db.moderation.adminRoutes)) db.moderation.adminRoutes = [];
  const cutoff = Date.now() - 86400000;
  db.moderation.logs = db.moderation.logs.filter(l => new Date(l.createdAt||0).getTime() >= cutoff);
}
function verifyAdminPassword(password) {
  const expected = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (!expected) return false;
  const salt = String(process.env.ADMIN_PASSWORD_SALT || '');
  const probe = crypto.createHash('sha256').update(String(password || '') + salt).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(probe), Buffer.from(expected)); } catch { return false; }
}
function adminSnapshot(db) {
  ensureModeration(db);
  const onlineIds = Array.from(new Set(Array.from(sseClients.keys()).map(token => sessions.get(token)?.userId).filter(Boolean)));
  return {
    totalUsers: db.users.length,
    onlineUsers: onlineIds.length,
    totalMessages: (db.messages || []).length,
    bannedUsers: new Set(db.moderation.bans.map(b => b.userId)).size
  };
}


function isBanActive(ban, now = Date.now()) {
  return !!(ban && (!ban.expiresAt || new Date(ban.expiresAt).getTime() > now));
}
function publicBan(ban) {
  if (!ban) return null;
  return {
    id: ban.id,
    userId: ban.userId || '',
    reason: ban.reason || '',
    createdAt: ban.createdAt || '',
    expiresAt: ban.expiresAt || '',
    permanent: !ban.expiresAt
  };
}
function getActiveBan(db, userId) {
  ensureModeration(db);
  return db.moderation.bans.find(b => b.userId === userId && isBanActive(b)) || null;
}
function getActiveDeviceBan(db, req) {
  ensureModeration(db);
  const info = parseDeviceInfo(req);
  const deviceKey = deviceBanKeyFromInfo(info);
  return db.moderation.bans.find(b => isBanActive(b) && (
    (Array.isArray(b.deviceKeys) && b.deviceKeys.includes(deviceKey)) ||
    (Array.isArray(b.ips) && b.ips.includes(info.ip))
  )) || null;
}
function sendBanResponse(res, message, ban, status = 403) {
  return sendJson(res, status, { error: message, ban: publicBan(ban) });
}
function pushLog(db, action, details) {
  ensureModeration(db);
  db.moderation.logs.push({ id: crypto.randomUUID(), action, details, createdAt: new Date().toISOString() });
}

function normalizeLanguage(value) {
  const allowed = new Set(['ru', 'en', 'be', 'uk', 'kk', 'uz', 'de', 'ar']);
  const code = String(value || '').trim().toLowerCase();
  return allowed.has(code) ? code : 'ru';
}

function normalizeCustomization(value) {
  const allowedThemes = new Set(['default', 'aurora', 'mint', 'sunset', 'ocean', 'flame']);
  const allowedBackgrounds = new Set(['default', 'wallpaper']);
  const raw = value && typeof value === 'object' ? value : {};
  const theme = allowedThemes.has(raw.theme) ? raw.theme : 'default';
  const background = allowedBackgrounds.has(raw.background) ? raw.background : 'default';
  return { theme, background };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    bio: user.bio || '',
    avatarDataUrl: user.avatarDataUrl || '',
    bannerDataUrl: user.bannerDataUrl || '',
    customization: normalizeCustomization(user.customization),
    language: normalizeLanguage(user.language),
    verified: !!user.verified
  };
}

function isUserOnline(userId) {
  for (const token of sseClients.keys()) {
    const session = sessions.get(token);
    if (session && session.userId === userId) return true;
  }
  return false;
}
function lastSeenForUser(user) {
  let last = user && user.lastSeenAt ? String(user.lastSeenAt) : '';
  for (const session of sessions.values()) {
    if (!session || session.userId !== (user && user.id) || !session.lastSeenAt) continue;
    if (!last || new Date(session.lastSeenAt).getTime() > new Date(last).getTime()) last = session.lastSeenAt;
  }
  return last;
}
function presenceForUser(user) {
  if (!user) return { online: false, lastSeenAt: '' };
  return { online: isUserOnline(user.id), lastSeenAt: lastSeenForUser(user) };
}
function publicUserWithPresence(user) {
  return { ...publicUser(user), ...presenceForUser(user) };
}

function ensurePinnedChats(user) {
  if (!user || !Array.isArray(user.pinnedChatUserIds)) user.pinnedChatUserIds = [];
  user.pinnedChatUserIds = user.pinnedChatUserIds.filter(Boolean);
  return user.pinnedChatUserIds;
}


function makeGroupInviteCode(db) {
  const used = new Set((db.groups || []).map(g => String(g.inviteCode || '')));
  let code = crypto.randomBytes(6).toString('base64url');
  while (used.has(code)) code = crypto.randomBytes(6).toString('base64url');
  return code;
}

function groupMembersWord(count) {
  const n = Math.abs(Number(count) || 0);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'участник';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'участника';
  return 'участников';
}

function publicGroupPreview(group) {
  const membersCount = Array.isArray(group.members) ? group.members.length : 0;
  return { id: group.id, name: group.name || 'Группа', bio: group.bio || '', avatarDataUrl: group.avatarDataUrl || '', bannerDataUrl: group.bannerDataUrl || '', inviteCode: group.inviteCode || '', membersCount, membersText: `${membersCount} ${groupMembersWord(membersCount)}` };
}

function publicGroup(group, db, viewerId = '') {
  const usersById = new Map((db.users || []).map(u => [u.id, u]));
  const members = (Array.isArray(group.members) ? group.members : []).map(uid => {
    const u = usersById.get(uid);
    return u ? { ...publicUserWithPresence(u), role: uid === group.ownerId ? 'owner' : 'member' } : { id: uid, name: 'Пользователь удалён', username: '', avatarDataUrl: '', verified: false, deleted: true, role: uid === group.ownerId ? 'owner' : 'member' };
  });
  const membersCount = members.length;
  const onlineCount = members.filter(m => !!m.online).length;
  return {
    id: group.id,
    isGroup: true,
    name: group.name || 'Группа',
    username: '',
    membersCount,
    onlineCount,
    statusText: `${membersCount} ${groupMembersWord(membersCount)}, ${onlineCount} онлайн`,
    bio: group.bio || `${membersCount} ${groupMembersWord(membersCount)}`,
    avatarDataUrl: group.avatarDataUrl || '',
    bannerDataUrl: group.bannerDataUrl || '',
    verified: false,
    avatar: (group.name || 'G').charAt(0).toUpperCase(),
    color: 'linear-gradient(135deg,#7c3aed,#0078FF)',
    ownerId: group.ownerId,
    isOwner: viewerId === group.ownerId,
    inviteCode: group.inviteCode || '',
    inviteUrl: `/m-in/group/${group.inviteCode || ''}`,
    members
  };
}
function groupMessageRecipients(group) {
  return Array.from(new Set([...(Array.isArray(group.members) ? group.members : []), group.ownerId].filter(Boolean)));
}
function pushGroupSystemMessage(db, group, text, type, actorId = '') {
  const msg = { id: crypto.randomUUID(), fromUserId: actorId || group.ownerId || '', toUserId: group.id, groupId: group.id, text: '', media: [], listenedBy: actorId ? [actorId] : [], reactions: {}, pinnedBy: [], editedAt: '', createdAt: new Date().toISOString(), isSystem: true, systemType: type || 'group', systemText: text };
  db.messages.push(msg);
  return normalizeMessage(msg);
}
function sendGroupEvent(group, event, payload) {
  groupMessageRecipients(group).forEach(uid => sendEventToUser(uid, event, payload));
}

function colorForId(id) {
  const palette = [
    'linear-gradient(135deg,#0078FF,#005fcc)',
    'linear-gradient(135deg,#5e5ce6,#3a32d8)',
    'linear-gradient(135deg,#34c759,#1e8f44)',
    'linear-gradient(135deg,#ff9500,#d66d00)',
    'linear-gradient(135deg,#ff2d55,#c21d3f)'
  ];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function sendEventToSessionToken(token, event, payload) {
  const res = sseClients.get(token);
  if (!res) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function sendEventToUser(uid, event, payload) {
  for (const [token, session] of sessions.entries()) {
    if (session.userId === uid) sendEventToSessionToken(token, event, payload);
  }
}
function sendEventToAll(event, payload) {
  for (const token of sseClients.keys()) sendEventToSessionToken(token, event, payload);
}
function broadcastPresence(userId, online, lastSeenAt = '') {
  sendEventToAll('presence', { userId, online: !!online, lastSeenAt });
}

function broadcastProfile(user) {
  sendEventToUser(user.id, 'profile', publicUser(user));
}
function broadcastPublicProfile(user) {
  sendEventToAll('public_profile_update', publicUser(user));
}
function sessionCountForUser(userId) {
  let c = 0;
  for (const s of sessions.values()) if (s.userId === userId) c++;
  return c;
}
function broadcastSessionsUpdate(userId) {
  sendEventToUser(userId, 'sessions_update', { count: sessionCountForUser(userId) });
}

function normalizeMessage(msg) {
  const plainText = msg.isSystem ? (msg.text || '') : messageText(msg);
  const plainMedia = msg.isSystem ? (Array.isArray(msg.media) ? msg.media : []) : messageMedia(msg);
  return {
    id: msg.id,
    fromUserId: msg.fromUserId,
    toUserId: msg.toUserId,
    groupId: msg.groupId || '',
    text: plainText,
    media: plainMedia,
    voiceDurationMs: Number(msg.voiceDurationMs) || 0,
    voiceWaveform: Array.isArray(msg.voiceWaveform) ? msg.voiceWaveform : [],
    listenedBy: Array.isArray(msg.listenedBy) ? msg.listenedBy : [],
    replyToMessageId: msg.replyToMessageId || '',
    forwardedFromName: msg.forwardedFromName || '',
    reactions: msg.reactions || {},
    pinnedBy: Array.isArray(msg.pinnedBy) ? msg.pinnedBy : [],
    pinnedAt: msg.pinnedAt || '',
    editedAt: msg.editedAt || '',
    isSystem: !!msg.isSystem,
    systemType: msg.systemType || '',
    systemText: msg.systemText || '',
    createdAt: msg.createdAt,
    e2ee: msg.e2ee || null
  };
}

async function fetchLinkPreview(urlStr) {
  const key = String(urlStr || '').trim();
  if (!key) throw new Error('url required');
  if (linkPreviewCache.has(key)) return linkPreviewCache.get(key);
  const u = new URL(key);
  if (!/^https?:$/.test(u.protocol)) throw new Error('invalid protocol');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  const res = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'follow' });
  clearTimeout(timer);
  const html = await res.text();
  const grab = (re) => {
    const m = html.match(re);
    return m ? String(m[1] || '').replace(/\s+/g, ' ').trim() : '';
  };
  const title = grab(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || grab(/<title[^>]*>([^<]+)<\/title>/i);
  const description = grab(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || grab(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const out = { url: u.toString(), site: u.hostname.replace(/^www\./i, ''), title: title || u.toString(), description: description.slice(0, 220) };
  linkPreviewCache.set(key, out);
  return out;
}

function handleApi(req, res, urlObj) {
  const { pathname, searchParams } = urlObj;
  const method = req.method;

  if (pathname === '/api/healthz') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (pathname === '/api/ban-status' && method === 'GET') {
    const db = readDb();
    const userId = String(searchParams.get('userId') || '');
    const userBan = userId ? getActiveBan(db, userId) : null;
    const ban = userBan || getActiveDeviceBan(db, req);
    return sendJson(res, 200, { banned: !!ban, ban: publicBan(ban) });
  }

  if (pathname === '/api/register' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const { name, username, password } = body;
        const usernameRaw = String(username || '').trim();
        const usernameNorm = normalizeUsername(usernameRaw);
        if (!usernameRaw || !password) return sendJson(res, 400, { error: 'username и пароль обязательны' });
        if (!isValidUsername(usernameRaw)) return sendJson(res, 400, { error: 'username: только латиница/цифры/_ и длина 5-70' });
        const db = readDb();
        const deviceBan = getActiveDeviceBan(db, req);
        if (deviceBan) return sendBanResponse(res, 'Регистрация заблокирована.', deviceBan);
        if (db.users.some(u => normalizeUsername(u.username) === usernameNorm)) {
          return sendJson(res, 409, { error: 'Пользователь уже существует' });
        }
        const user = {
          id: crypto.randomUUID(),
          name: name || usernameRaw,
          username: usernameRaw,
          passwordHash: hashPasswordSecure(password),
          vpscCodeEnc: encryptString(makeUniqueVpscCode(db)),
          blockedUsers: [],
          pinnedChatUserIds: [],
          bio: '',
          avatarDataUrl: '',
          bannerDataUrl: '',
          customization: { theme: 'default', background: 'default' },
          language: normalizeLanguage(body.language)
        };
        db.users.push(user);
        writeDb(db);
        const session = createSession(req, user.id);
        const token = session.token;
        broadcastSessionsUpdate(user.id);
        sendJson(res, 201, { token, user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/login' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const { username, password } = body;
        const usernameNorm = normalizeUsername(username);
        if (!usernameNorm || !password) return sendJson(res, 400, { error: 'username и пароль обязательны' });
        const db = readDb();
        const deviceBan = getActiveDeviceBan(db, req);
        if (deviceBan) return sendBanResponse(res, 'Вы были заблокированы', deviceBan);
        const user = db.users.find(u => normalizeUsername(u.username) === usernameNorm && verifyPassword(password || '', u.passwordHash));
        if (!user) return sendJson(res, 401, { error: 'Неверный логин или пароль' });
        let secretsChanged = migrateUserSecrets(user);
        if (shouldUpgradePasswordHash(user.passwordHash)) { user.passwordHash = hashPasswordSecure(password || ''); secretsChanged = true; }
        const activeBan = getActiveBan(db, user.id);
        if (activeBan) return sendBanResponse(res, 'Вы были заблокированы', activeBan);
        if (!getUserVpscCode(user)) {
          setUserVpscCode(user, makeUniqueVpscCode(db));
          secretsChanged = true;
        }
        if (secretsChanged) writeDb(db);
        const session = createSession(req, user.id);
        const token = session.token;
        broadcastSessionsUpdate(user.id);
        sendJson(res, 200, { token, user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/stream' && method === 'GET') {
    const db = readDb();
    const token = searchParams.get('token');
    const session = getSessionByToken(token);
    if (!session) return sendJson(res, 401, { error: 'Unauthorized' });
    const uid = session.userId;
    const user = db.users.find(u => u.id === uid);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    if (migrateUserSecrets(user)) writeDb(db);
    const activeBan = getActiveBan(db, user.id) || getActiveDeviceBan(db, req);
    if (activeBan) return sendBanResponse(res, 'Вы были заблокированы', activeBan);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(`event: profile\ndata: ${JSON.stringify(publicUserWithPresence(user))}\n\n`);
    const wasOnline = isUserOnline(uid);
    sseClients.set(token, res);
    session.lastSeenAt = new Date().toISOString();
    if (!wasOnline) broadcastPresence(uid, true, session.lastSeenAt);
    req.on('close', () => {
      const closedAt = new Date().toISOString();
      session.lastSeenAt = closedAt;
      sseClients.delete(token);
      if (!isUserOnline(uid)) {
        const dbClose = readDb();
        const closeUser = dbClose.users.find(u => u.id === uid);
        if (closeUser) { closeUser.lastSeenAt = closedAt; writeDb(dbClose); }
        broadcastPresence(uid, false, closedAt);
      }
    });
    return;
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const token = req.headers['x-session-token'];
    if (token) {
      const s = sessions.get(token);
      sessions.delete(token);
      sseClients.delete(token);
      if (s && s.userId) {
        s.lastSeenAt = new Date().toISOString();
        broadcastSessionsUpdate(s.userId);
        if (!isUserOnline(s.userId)) broadcastPresence(s.userId, false, s.lastSeenAt);
      }
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/vpsc/login' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const code = normalizeVpscCode(body.code);
        if (code.length !== 6) return sendJson(res, 400, { error: 'Некорректный код' });
        const db = readDb();
        const deviceBan = getActiveDeviceBan(db, req);
        if (deviceBan) return sendBanResponse(res, 'Вы были заблокированы', deviceBan);
        const user = db.users.find(u => normalizeVpscCode(getUserVpscCode(u)) === code);
        if (!user) return sendJson(res, 401, { error: 'Код не найден' });
        const activeBan = getActiveBan(db, user.id);
        if (activeBan) return sendBanResponse(res, 'Вы были заблокированы', activeBan);
        const session = createSession(req, user.id);
        const token = session.token;
        broadcastSessionsUpdate(user.id);
        sendJson(res, 200, { token, user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/me' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const activeBan = getActiveBan(db, user.id) || getActiveDeviceBan(db, req);
    if (activeBan) return sendBanResponse(res, 'Вы были заблокированы', activeBan);
    if (migrateUserSecrets(user)) writeDb(db);
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/me/sessions' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const token = req.headers['x-session-token'];
    const items = [];
    for (const s of sessions.values()) {
      if (s.userId !== user.id) continue;
      items.push({
        id: s.id,
        ua: s.ua,
        deviceName: s.deviceName || 'MIN Web',
        app: s.app,
        os: s.os,
        osVersion: s.osVersion || s.os || 'Web',
        ip: s.ip,
        location: s.location || 'Unknown',
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.token === token
      });
    }
    items.sort((a, b) => (a.current === b.current ? (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '') : (a.current ? -1 : 1)));
    return sendJson(res, 200, { count: Math.max(1, items.length), items });
  }

  if (pathname === '/api/me/sessions/logout-others' && method === 'POST') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const currentToken = req.headers['x-session-token'];
    let removed = 0;
    for (const [token, s] of sessions.entries()) {
      if (s.userId !== user.id || token === currentToken) continue;
      sendEventToSessionToken(token, 'force_logout', { reason: 'logout_others' });
      sseClients.delete(token);
      sessions.delete(token);
      removed++;
    }
    broadcastSessionsUpdate(user.id);
    return sendJson(res, 200, { ok: true, removed });
  }

  if (pathname === '/api/me' && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const nextUsername = String(body.username || '').trim();
        const nextUsernameNorm = normalizeUsername(nextUsername);
        if (nextUsername && !isValidUsername(nextUsername)) return sendJson(res, 400, { error: 'username: только латиница/цифры/_ и длина 5-70' });
        if (nextUsername && db.users.some(u => u.id !== user.id && normalizeUsername(u.username) === nextUsernameNorm)) {
          return sendJson(res, 409, { error: 'username уже занят' });
        }
        user.name = String(body.name || user.name || '').trim() || user.name;
        if (nextUsername) user.username = nextUsername;
        user.bio = String(body.bio || '').slice(0, 110);
        writeDb(db);
        broadcastProfile(user);
        broadcastPublicProfile(user);
        sendJson(res, 200, { user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/me/customization' && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        user.customization = normalizeCustomization({
          theme: body.theme,
          background: body.background
        });
        writeDb(db);
        broadcastProfile(user);
        sendJson(res, 200, { user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/me/language' && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        user.language = normalizeLanguage(body.language);
        writeDb(db);
        broadcastProfile(user);
        sendJson(res, 200, { user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/me/avatar' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const dataUrl = String(body.dataUrl || '');
        if (!dataUrl.startsWith('data:image/')) return sendJson(res, 400, { error: 'Некорректный формат изображения' });
        user.avatarDataUrl = dataUrl;
        writeDb(db);
        broadcastProfile(user);
        broadcastPublicProfile(user);
        sendJson(res, 200, { user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/me/banner' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const dataUrl = String(body.dataUrl || '');
        if (!dataUrl.startsWith('data:image/')) return sendJson(res, 400, { error: 'Некорректный формат изображения' });
        user.bannerDataUrl = dataUrl;
        writeDb(db);
        broadcastProfile(user);
        sendJson(res, 200, { user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/me/vpsc' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    if (!getUserVpscCode(user)) {
      setUserVpscCode(user, makeUniqueVpscCode(db));
      writeDb(db);
    }
    return sendJson(res, 200, { code: getUserVpscCode(user) });
  }

  if (pathname === '/api/me/vpsc' && method === 'POST') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const code = makeUniqueVpscCode(db);
    setUserVpscCode(user, code);
    writeDb(db);
    return sendJson(res, 200, { code });
  }

  if (pathname === '/api/me/password' && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const currentPassword = String(body.currentPassword || '');
        const newPassword = String(body.newPassword || '');
        if (!verifyPassword(currentPassword, user.passwordHash)) return sendJson(res, 400, { error: 'Неверный текущий пароль' });
        if (newPassword.length < 6) return sendJson(res, 400, { error: 'Новый пароль слишком короткий' });
        user.passwordHash = hashPasswordSecure(newPassword);
        writeDb(db);
        return sendJson(res, 200, { ok: true });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/me' && method === 'DELETE') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const password = String(body.password || '');
        if (!verifyPassword(password, user.passwordHash)) return sendJson(res, 400, { error: 'Неверный пароль' });
        db.users = db.users.filter(u => u.id !== user.id);
        writeDb(db);
        for (const [token, s] of sessions.entries()) {
          if (s.userId !== user.id) continue;
          sseClients.delete(token);
          sessions.delete(token);
        }
        broadcastSessionsUpdate(user.id);
        return sendJson(res, 200, { ok: true });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/chats' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const q = String(searchParams.get('q') || '').toLowerCase();
    const pinnedChatUserIds = ensurePinnedChats(user);
    const pinOrder = new Map(pinnedChatUserIds.map((uid, idx) => [uid, idx]));
    const messages = db.messages || [];
    let securedMessages = false;
    messages.forEach(m => {
      const beforeText = m.text;
      const beforeTextEnc = m.textEnc;
      const beforeE2ee = JSON.stringify(m.e2ee || null);
      const beforeMediaLen = Array.isArray(m.media) ? m.media.length : 0;
      secureMessageForStorage(m);
      if (beforeText !== m.text || beforeTextEnc !== m.textEnc || beforeE2ee !== JSON.stringify(m.e2ee || null) || beforeMediaLen !== (Array.isArray(m.media) ? m.media.length : 0)) securedMessages = true;
    });
    if (securedMessages) writeDb(db);
    const groupIds = new Set((db.groups || []).map(g => g.id).filter(Boolean));
    const dialogUserIds = new Set(
      messages
        .filter(m => !m.groupId && (m.fromUserId === user.id || m.toUserId === user.id))
        .map(m => (m.fromUserId === user.id ? m.toUserId : m.fromUserId))
        .filter(id => id && !String(id).startsWith('group_') && !groupIds.has(id))
    );
    const userById = new Map((db.users || []).map(u => [u.id, u]));

    const publicGroups = [];

    const items = [...dialogUserIds]
      .map(uid => {
        const u = userById.get(uid);
        const thread = messages.filter(m =>
          (m.fromUserId === user.id && m.toUserId === uid) ||
          (m.fromUserId === uid && m.toUserId === user.id)
        );
        const last = thread[thread.length - 1];
        const name = u ? (u.name || u.username) : 'Пользователь удалён';
        const username = u ? u.username : '';
        const lastText = last ? (last.isSystem ? String(last.systemText || '').trim() : messageText(last).trim()) : '';
        const lastMedia = last ? messageMedia(last) : [];
        const preview = last
          ? (lastText || (last.e2ee ? '' : (lastMedia.length
            ? (String(lastMedia[0] || '').startsWith('data:audio') ? 'Голосовое сообщение' : 'Медиа')
            : '')))
          : (username ? `@${username}` : '');
        const readMap = (user.chatReadAt && typeof user.chatReadAt === 'object') ? user.chatReadAt : {};
        const lastReadAt = String(readMap[uid] || '');
        const unreadCount = thread.filter(m => m.fromUserId === uid && (!lastReadAt || new Date(m.createdAt).getTime() > new Date(lastReadAt).getTime())).length;
        return {
          id: uid,
          name,
          username,
          bio: u ? (u.bio || '') : '',
          preview,
          previewE2ee: last && !preview && last.e2ee ? last.e2ee : null,
          lastCreatedAt: last ? last.createdAt : '',
          avatarDataUrl: u ? (u.avatarDataUrl || '') : '',
          bannerDataUrl: u ? (u.bannerDataUrl || '') : '',
          verified: !!(u && u.verified),
          avatar: u ? (u.name || u.username || 'U').charAt(0).toUpperCase() : '⌧',
          color: u ? colorForId(u.id) : 'linear-gradient(135deg,#4B5563,#1F2937)',
          isPinned: pinOrder.has(uid),
          pinIndex: pinOrder.has(uid) ? pinOrder.get(uid) : Number.MAX_SAFE_INTEGER,
          deleted: !u,
          unreadCount,
          blockedPeer: !!(u && Array.isArray(user.blockedUsers) && user.blockedUsers.includes(uid)),
          online: !!(u && presenceForUser(u).online),
          lastSeenAt: u ? presenceForUser(u).lastSeenAt : ''
        };
      })
      .concat(Array.from(new Map((db.groups || []).filter(g => g && g.id && Array.isArray(g.members) && g.members.includes(user.id)).map(g => [g.id, g])).values()).map(g => {
        const thread = messages.filter(m => m.groupId === g.id || m.toUserId === g.id);
        const last = thread[thread.length - 1];
        const lastText = last ? (last.isSystem ? (last.systemText || '') : messageText(last).trim()) : '';
        const lastMedia = last ? messageMedia(last) : [];
        const readMap = (user.chatReadAt && typeof user.chatReadAt === 'object') ? user.chatReadAt : {};
        const lastReadAt = String(readMap[g.id] || '');
        const hasVoiceMedia = lastMedia.some(raw => String(raw || '').startsWith('data:audio'));
        return { ...publicGroup(g, db, user.id), preview: last ? (lastText || (lastMedia.length ? (hasVoiceMedia ? 'Голосовое сообщение' : 'Медиа') : '')) : 'Группа', lastCreatedAt: last ? last.createdAt : g.createdAt || '', isPinned: pinOrder.has(g.id), pinIndex: pinOrder.has(g.id) ? pinOrder.get(g.id) : Number.MAX_SAFE_INTEGER, unreadCount: thread.filter(m => m.fromUserId !== user.id && (!lastReadAt || new Date(m.createdAt).getTime() > new Date(lastReadAt).getTime())).length };
      }))
      .concat(publicGroups)
      .filter(u => {
        const n = String(u.name || '').toLowerCase();
        const un = String((u.username || '')).toLowerCase();
        return !q || n.includes(q) || un.includes(q);
      })
      .reduce((acc, item) => {
        if (!item || !item.id || acc.some(x => x.id === item.id)) return acc;
        acc.push(item);
        return acc;
      }, [])
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (a.isPinned && b.isPinned) return a.pinIndex - b.pinIndex;
        return new Date(b.lastCreatedAt || 0).getTime() - new Date(a.lastCreatedAt || 0).getTime();
      })
      .map(({ pinIndex, ...rest }) => rest);
    return sendJson(res, 200, { items });
  }

  const chatMatch = pathname.match(/^\/api\/chats\/([^/]+)$/);
  if (chatMatch && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const peerId = String(chatMatch[1] || '');
        if (!peerId || peerId === user.id) return sendJson(res, 400, { error: 'Некорректный чат' });
        const action = String(body.action || '').toLowerCase();
        const pinnedChatUserIds = ensurePinnedChats(user);
        const withoutPeer = pinnedChatUserIds.filter(id => id !== peerId);
        if (action === 'pin') user.pinnedChatUserIds = [peerId, ...withoutPeer];
        else if (action === 'unpin') user.pinnedChatUserIds = withoutPeer;
        else return sendJson(res, 400, { error: 'Unknown action' });
        writeDb(db);
        sendEventToUser(user.id, 'chat_pin_update', {
          peerId,
          pinned: action === 'pin'
        });
        return sendJson(res, 200, {
          ok: true,
          peerId,
          pinned: action === 'pin'
        });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }
  if (chatMatch && method === 'DELETE') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const peerId = chatMatch[1];
    db.messages = (db.messages || []).filter(m => !(
      (m.fromUserId === user.id && m.toUserId === peerId) ||
      (m.fromUserId === peerId && m.toUserId === user.id)
    ));
    writeDb(db);
    sendEventToUser(user.id, 'message_update', { chatDeletedWith: peerId });
    sendEventToUser(peerId, 'message_update', { chatDeletedWith: user.id });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/link-preview' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const url = String(searchParams.get('url') || '');
    if (!url) return sendJson(res, 400, { error: 'url required' });
    return fetchLinkPreview(url)
      .then(data => sendJson(res, 200, data))
      .catch(() => sendJson(res, 200, { url, site: '', title: url, description: '' }));
  }

  if (pathname === '/api/users/search' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const q = String(searchParams.get('q') || '').toLowerCase();
    if (!q) return sendJson(res, 200, { items: [] });
    const items = db.users
      .filter(u => u.id !== user.id)
      .filter(u => {
        const n = String(u.name || '').toLowerCase();
        const un = String(u.username || '').toLowerCase();
        return n.includes(q) || un.includes(q);
      })
      .slice(0, 50)
      .map(u => ({
        id: u.id,
        name: u.name || u.username,
        username: u.username,
        bio: u.bio || '',
        avatarDataUrl: u.avatarDataUrl || '',
        avatar: (u.name || u.username || 'U').charAt(0).toUpperCase(),
        color: colorForId(u.id),
        verified: !!u.verified,
        blockedPeer: Array.isArray(user.blockedUsers) && user.blockedUsers.includes(u.id),
        ...presenceForUser(u)
      }));
    return sendJson(res, 200, { items });
  }

  if (pathname === '/api/public-group' && method === 'GET') {
    const db = readDb();
    const code = String(searchParams.get('code') || '').trim();
    const g = (db.groups || []).find(x => x.inviteCode === code);
    if (!g) return sendJson(res, 404, { error: 'Not found' });
    return sendJson(res, 200, { group: publicGroupPreview(g) });
  }

  if (pathname === '/api/public-profile' && method === 'GET') {
    const db = readDb();
    const username = normalizeUsername(searchParams.get('username') || '');
    if (!username) return sendJson(res, 200, { user: null });
    const u = db.users.find(x => normalizeUsername(x.username) === username);
    if (!u) return sendJson(res, 200, { user: null });
    return sendJson(res, 200, { user: publicUser(u) });
  }

  const blockMatch = pathname.match(/^\/api\/users\/([^/]+)\/block$/);
  if (blockMatch && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const peerId = blockMatch[1];
        if (!peerId || peerId === user.id) return sendJson(res, 400, { error: 'Некорректный пользователь' });
        const peer = db.users.find(u => u.id === peerId);
        if (!peer) return sendJson(res, 404, { error: 'Пользователь не найден' });
        if (!Array.isArray(user.blockedUsers)) user.blockedUsers = [];
        const action = String(body.action || '').toLowerCase();
        if (action === 'unblock') user.blockedUsers = user.blockedUsers.filter(id => id !== peerId);
        else if (!user.blockedUsers.includes(peerId)) user.blockedUsers.push(peerId);
        writeDb(db);
        sendEventToUser(user.id, 'block_update', { byUserId: user.id, targetUserId: peerId, blocked: user.blockedUsers.includes(peerId) });
        sendEventToUser(peerId, 'block_update', { byUserId: user.id, targetUserId: peerId, blocked: user.blockedUsers.includes(peerId) });
        return sendJson(res, 200, { ok: true, blocked: user.blockedUsers.includes(peerId) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }


  if (pathname === '/api/chats/started' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const q = String(searchParams.get('q') || '').toLowerCase();
    const ids = new Set((db.messages || []).filter(m => !m.groupId && (m.fromUserId === user.id || m.toUserId === user.id)).map(m => m.fromUserId === user.id ? m.toUserId : m.fromUserId));
    const items = [...ids].map(id => db.users.find(u => u.id === id)).filter(Boolean).filter(u => !q || [u.name,u.username].join(' ').toLowerCase().includes(q)).map(u => ({ ...publicUserWithPresence(u), avatar: (u.name || u.username || 'U').charAt(0).toUpperCase(), color: colorForId(u.id) }));
    return sendJson(res, 200, { items });
  }

  if (pathname === '/api/groups' && method === 'POST') {
    return readBody(req).then(body => {
      const db = readDb();
      const user = getUserByToken(req, db);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return sendJson(res, 400, { error: 'Название группы обязательно' });
      const picked = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      const valid = new Set((db.users || []).map(u => u.id));
      const members = Array.from(new Set([user.id, ...picked.filter(id => valid.has(id))]));
      const bio = String(body.bio || '').trim().slice(0, 110);
      const avatarDataUrl = String(body.avatarDataUrl || '').slice(0, 3_000_000);
      const bannerDataUrl = String(body.bannerDataUrl || '').slice(0, 3_000_000);
      const requestId = String(body.requestId || '').trim().slice(0, 120);
      const sameMembers = (a, b) => Array.isArray(a) && a.length === b.length && b.every(id => a.includes(id));
      const existing = (db.groups || []).find(g => g.ownerId === user.id && (
        (requestId && g.creationRequestId === requestId) ||
        (g.name === name && (g.bio || '') === bio && sameMembers(g.members, members) && Date.now() - new Date(g.createdAt || 0).getTime() < 15000)
      ));
      if (existing) return sendJson(res, 200, { group: publicGroup(existing, db, user.id) });
      const group = { id: `group_${crypto.randomUUID()}`, name, bio, avatarDataUrl, bannerDataUrl, ownerId: user.id, members, inviteCode: makeGroupInviteCode(db), createdAt: new Date().toISOString(), creationRequestId: requestId };
      db.groups.push(group);
      const sys = pushGroupSystemMessage(db, group, 'Группа создана', 'group_created', user.id);
      writeDb(db);
      sendGroupEvent(group, 'message', sys);
      groupMessageRecipients(group).forEach(uid => sendEventToUser(uid, 'chat_group_update', publicGroup(group, db, uid)));
      sendEventToAll('public_group_update', publicGroupPreview(group));
      return sendJson(res, 201, { group: publicGroup(group, db, user.id) });
    }).catch(err => sendJson(res, 400, { error: err.message }));
  }

  const groupJoinMatch = pathname.match(/^\/api\/groups\/join\/([^/]+)$/);
  if (groupJoinMatch && method === 'POST') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const group = (db.groups || []).find(g => g.inviteCode === groupJoinMatch[1]);
    if (!group) return sendJson(res, 404, { error: 'Группа не найдена' });
    if (!Array.isArray(group.members)) group.members = [];
    if (!group.members.includes(user.id)) {
      group.members.push(user.id);
      const msg = pushGroupSystemMessage(db, group, `${user.name || user.username} зашёл в группу`, 'group_join', user.id);
      writeDb(db);
      sendGroupEvent(group, 'message', msg);
      groupMessageRecipients(group).forEach(uid => sendEventToUser(uid, 'chat_group_update', publicGroup(group, db, uid)));
    }
    return sendJson(res, 200, { group: publicGroup(group, db, user.id) });
  }

  const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)(?:\/([^/]+))?$/);
  if (groupMatch && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const group = (db.groups || []).find(g => g.id === groupMatch[1]);
    if (!group || !Array.isArray(group.members) || !group.members.includes(user.id)) return sendJson(res, 404, { error: 'Группа не найдена' });
    return sendJson(res, 200, { group: publicGroup(group, db, user.id) });
  }
  if (groupMatch && groupMatch[2] === 'members' && method === 'POST') {
    return readBody(req).then(body => {
      const db = readDb();
      const user = getUserByToken(req, db);
      if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
      const group = (db.groups || []).find(g => g.id === groupMatch[1]);
      if (!group || !Array.isArray(group.members) || !group.members.includes(user.id)) return sendJson(res, 404, { error: 'Группа не найдена' });
      const ids = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      const valid = new Set((db.users || []).map(u => u.id));
      ids.forEach(id => { if (valid.has(id) && !group.members.includes(id)) group.members.push(id); });
      writeDb(db);
      groupMessageRecipients(group).forEach(uid => sendEventToUser(uid, 'chat_group_update', publicGroup(group, db, uid)));
      return sendJson(res, 200, { group: publicGroup(group, db, user.id) });
    }).catch(err => sendJson(res, 400, { error: err.message }));
  }
  if (groupMatch && groupMatch[2] === 'leave' && method === 'POST') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const group = (db.groups || []).find(g => g.id === groupMatch[1]);
    if (!group || !Array.isArray(group.members) || !group.members.includes(user.id)) return sendJson(res, 404, { error: 'Группа не найдена' });
    group.members = group.members.filter(id => id !== user.id);
    const msg = pushGroupSystemMessage(db, group, `${user.name || user.username} покинул группу`, 'group_leave', user.id);
    writeDb(db);
    sendGroupEvent({ ...group, members: [...group.members, user.id] }, 'message', msg);
    groupMessageRecipients(group).forEach(uid => sendEventToUser(uid, 'chat_group_update', publicGroup(group, db, uid)));
    sendEventToUser(user.id, 'chat_group_update', { id: group.id, left: true });
    return sendJson(res, 200, { ok: true });
  }
  if (groupMatch && method === 'DELETE') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const group = (db.groups || []).find(g => g.id === groupMatch[1]);
    if (!group || group.ownerId !== user.id) return sendJson(res, 403, { error: 'Только владелец может удалить группу' });
    const recipients = groupMessageRecipients(group);
    db.groups = db.groups.filter(g => g.id !== group.id);
    db.messages = (db.messages || []).filter(m => m.groupId !== group.id && m.toUserId !== group.id);
    writeDb(db);
    recipients.forEach(uid => sendEventToUser(uid, 'chat_group_update', { id: group.id, deleted: true }));
    sendEventToAll('public_group_update', { id: group.id, inviteCode: group.inviteCode || '', deleted: true });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/messages' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const withUserId = String(searchParams.get('withUserId') || '');
    const group = (db.groups || []).find(g => g.id === withUserId);
    if (group) {
      if (!Array.isArray(group.members) || !group.members.includes(user.id)) return sendJson(res, 403, { error: 'Нет доступа к группе' });
      const items = (db.messages || []).filter(m => m.groupId === group.id || m.toUserId === group.id);
      const readMap = (user.chatReadAt && typeof user.chatReadAt === 'object') ? user.chatReadAt : {};
      const lastReadAt = String(readMap[withUserId] || '');
      const firstUnread = items.find(m => m.fromUserId !== user.id && (!lastReadAt || new Date(m.createdAt).getTime() > new Date(lastReadAt).getTime()));
      return sendJson(res, 200, { firstUnreadMessageId: firstUnread ? firstUnread.id : '', items: items.map(normalizeMessage), peer: publicGroup(group, db, user.id) });
    }
    const peer = db.users.find(u => u.id === withUserId);
    const items = (db.messages || []).filter(m =>
      !m.groupId && ((m.fromUserId === user.id && m.toUserId === withUserId) ||
      (m.fromUserId === withUserId && m.toUserId === user.id))
    );
    let securedMessages = false;
    items.forEach(m => {
      const beforeText = m.text;
      const beforeTextEnc = m.textEnc;
      const beforeE2ee = JSON.stringify(m.e2ee || null);
      const beforeMediaLen = Array.isArray(m.media) ? m.media.length : 0;
      secureMessageForStorage(m);
      if (beforeText !== m.text || beforeTextEnc !== m.textEnc || beforeE2ee !== JSON.stringify(m.e2ee || null) || beforeMediaLen !== (Array.isArray(m.media) ? m.media.length : 0)) securedMessages = true;
    });
    if (securedMessages) writeDb(db);
    if (!peer && !items.length) return sendJson(res, 404, { error: 'Пользователь не найден' });
    const blockedByPeer = !!(peer && Array.isArray(peer.blockedUsers) && peer.blockedUsers.includes(user.id));
    const blockedPeer = !!(peer && Array.isArray(user.blockedUsers) && user.blockedUsers.includes(peer.id));
    const readMap = (user.chatReadAt && typeof user.chatReadAt === 'object') ? user.chatReadAt : {};
    const lastReadAt = String(readMap[withUserId] || '');
    const firstUnread = items.find(m => m.fromUserId === withUserId && (!lastReadAt || new Date(m.createdAt).getTime() > new Date(lastReadAt).getTime()));
    return sendJson(res, 200, {
      firstUnreadMessageId: firstUnread ? firstUnread.id : '',
      items: items.map(normalizeMessage),
      peer: peer
        ? { id: peer.id, name: peer.name || peer.username, username: peer.username, bio: peer.bio || '', avatarDataUrl: peer.avatarDataUrl || '', bannerDataUrl: peer.bannerDataUrl || '', verified: !!peer.verified, blockedByPeer, blockedPeer, ...presenceForUser(peer) }
        : { id: withUserId, name: 'Пользователь удалён', username: '', bio: '', avatarDataUrl: '', bannerDataUrl: '', deleted: true, online: false, lastSeenAt: '' }
    });
  }


  if (pathname === '/api/typing' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const toUserId = String(body.toUserId || '');
        if (!toUserId || toUserId === user.id) return sendJson(res, 400, { error: 'toUserId required' });
        const typing = !!body.typing;
        const payload = { fromUserId: user.id, fromName: user.name || user.username || 'Пользователь', toUserId, typing, at: new Date().toISOString() };
        const group = (db.groups || []).find(g => g.id === toUserId);
        if (group) {
          if (!Array.isArray(group.members) || !group.members.includes(user.id)) return sendJson(res, 403, { error: 'Нет доступа к группе' });
          groupMessageRecipients(group).filter(uid => uid !== user.id).forEach(uid => sendEventToUser(uid, 'typing', { ...payload, groupId: group.id }));
          return sendJson(res, 200, { ok: true });
        }
        if (!db.users.some(u => u.id === toUserId)) return sendJson(res, 404, { error: 'Пользователь не найден' });
        sendEventToUser(toUserId, 'typing', payload);
        return sendJson(res, 200, { ok: true });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/messages/read' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const withUserId = String(body.withUserId || '');
        if (!withUserId) return sendJson(res, 400, { error: 'withUserId required' });
        if (!user.chatReadAt || typeof user.chatReadAt !== 'object') user.chatReadAt = {};
        user.chatReadAt[withUserId] = new Date().toISOString();
        writeDb(db);
        sendEventToUser(user.id, 'chat_read_update', { withUserId, at: user.chatReadAt[withUserId] });
        return sendJson(res, 200, { ok: true });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/messages' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const toUserId = String(body.toUserId || '');
        const rawText = String(body.text || '').trim();
        const e2ee = body.e2ee && typeof body.e2ee === 'object' ? { v: 1, alg: 'AES-GCM', ciphertext: String(body.e2ee.ciphertext || ''), iv: String(body.e2ee.iv || '') } : null;
        const text = plainTextFromBody(rawText, e2ee, user.id, toUserId);
        const media = Array.isArray(body.media) ? body.media.filter(Boolean).slice(0, 10) : [];
        const voiceDurationMs = Number.isFinite(Number(body.voiceDurationMs)) ? Math.max(0, Math.min(60*60*1000, Number(body.voiceDurationMs))) : 0;
        const voiceWaveform = Array.isArray(body.voiceWaveform) ? body.voiceWaveform.slice(0, 80).map(v=>Math.max(0,Math.min(32,Number(v)||0))) : [];
        if (!text && !media.length) return sendJson(res, 400, { error: 'Пустое сообщение' });
        const group = (db.groups || []).find(g => g.id === toUserId);
        const peer = group ? null : db.users.find(u => u.id === toUserId);
        if (group) {
          if (!Array.isArray(group.members) || !group.members.includes(user.id)) return sendJson(res, 403, { error: 'Нет доступа к группе' });
        } else {
          if (!peer) return sendJson(res, 404, { error: 'Пользователь не найден' });
          if (Array.isArray(peer.blockedUsers) && peer.blockedUsers.includes(user.id)) {
            return sendJson(res, 403, { error: 'Вы были заблокированы данным пользователем' });
          }
        }
        const msg = {
          id: crypto.randomUUID(),
          fromUserId: user.id,
          toUserId,
          groupId: group ? group.id : '',
          text: '',
          textEnc: encryptString(text),
          e2ee: null,
          media: [],
          mediaEnc: media.map(encryptString),
          voiceDurationMs,
          voiceWaveform,
          listenedBy: [user.id],
          replyToMessageId: String(body.replyToMessageId || ''),
          forwardedFromName: String(body.forwardedFromName || '').slice(0, 200),
          reactions: {},
          pinnedBy: [],
          createdAt: new Date().toISOString()
        };
        if (!Array.isArray(db.messages)) db.messages = [];
        db.messages.push(msg);
        writeDb(db);
        const n = normalizeMessage(msg);
        if (group) sendGroupEvent(group, 'message', n);
        else { sendEventToUser(user.id, 'message', n); sendEventToUser(toUserId, 'message', n); }
        return sendJson(res, 201, { message: n });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  const msgMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (msgMatch && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const msgId = msgMatch[1];
        const msg = (db.messages || []).find(m => m.id === msgId);
        if (!msg) return sendJson(res, 404, { error: 'Сообщение не найдено' });
        const group = (db.groups || []).find(g => g.id === (msg.groupId || msg.toUserId));
        if (group) {
          if (!Array.isArray(group.members) || !group.members.includes(user.id)) return sendJson(res, 403, { error: 'Forbidden' });
        } else if (msg.fromUserId !== user.id && msg.toUserId !== user.id) return sendJson(res, 403, { error: 'Forbidden' });
        const action = String(body.action || '');
        if (action === 'react') {
          const emoji = String(body.emoji || '').trim().slice(0, 8);
          if (!emoji) return sendJson(res, 400, { error: 'emoji required' });
          if (!msg.reactions || typeof msg.reactions !== 'object') msg.reactions = {};
          if (!Array.isArray(msg.reactions[emoji])) msg.reactions[emoji] = [];
          const idx = msg.reactions[emoji].indexOf(user.id);
          if (idx >= 0) msg.reactions[emoji].splice(idx, 1);
          else msg.reactions[emoji].push(user.id);
          if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
        } else if (action === 'pin') {
          const now = new Date().toISOString();
          msg.pinnedBy = group ? groupMessageRecipients(group) : [msg.fromUserId, msg.toUserId];
          msg.pinnedAt = now;
          db.messages.push({ id: crypto.randomUUID(), fromUserId: user.id, toUserId: group ? group.id : (msg.fromUserId===user.id?msg.toUserId:msg.fromUserId), groupId: group ? group.id : '', text: '', media: [], listenedBy:[user.id], reactions:{}, pinnedBy:[], editedAt:'', createdAt: now, isSystem: true, systemType: 'pin', systemText: `${user.name || user.username} закрепил сообщение` });
        } else if (action === 'unpin') {
          msg.pinnedBy = [];
          msg.pinnedAt = '';
          db.messages.push({ id: crypto.randomUUID(), fromUserId: user.id, toUserId: group ? group.id : (msg.fromUserId===user.id?msg.toUserId:msg.fromUserId), groupId: group ? group.id : '', text: '', media: [], listenedBy:[user.id], reactions:{}, pinnedBy:[], editedAt:'', createdAt: new Date().toISOString(), isSystem: true, systemType: 'unpin', systemText: `${user.name || user.username} открепил сообщение` });
        } else if (action === 'edit') {
          if (msg.fromUserId !== user.id) return sendJson(res, 403, { error: 'Можно редактировать только своё сообщение' });
          const rawText = String(body.text || '').trim();
          const e2ee = body.e2ee && typeof body.e2ee === 'object' ? { v: 1, alg: 'AES-GCM', ciphertext: String(body.e2ee.ciphertext || ''), iv: String(body.e2ee.iv || '') } : null;
          const text = plainTextFromBody(rawText, e2ee, msg.fromUserId, msg.toUserId);
          const media = Array.isArray(body.media) ? body.media.filter(Boolean).slice(0, 10) : null;
          const hasMedia = Array.isArray(media) ? media.length > 0 : Array.isArray(msg.media) && msg.media.length > 0;
          if (!text && !hasMedia) return sendJson(res, 400, { error: 'Пустое сообщение' });
          msg.text = '';
          msg.textEnc = encryptString(text);
          msg.e2ee = null;
          if (Array.isArray(media)) { msg.media = []; msg.mediaEnc = media.map(encryptString); }
          msg.editedAt = new Date().toISOString();
        } else if (action === 'listen') {
          if (!Array.isArray(msg.listenedBy)) msg.listenedBy = [];
          if (!msg.listenedBy.includes(user.id)) msg.listenedBy.push(user.id);
        } else {
          return sendJson(res, 400, { error: 'Unknown action' });
        }
        writeDb(db);
        const n = normalizeMessage(msg);
        if (group) sendGroupEvent(group, 'message_update', n);
        else { sendEventToUser(msg.fromUserId, 'message_update', n); sendEventToUser(msg.toUserId, 'message_update', n); }
        return sendJson(res, 200, { message: n });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (msgMatch && method === 'DELETE') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const msgId = msgMatch[1];
    const msg = (db.messages || []).find(m => m.id === msgId);
    if (!msg) return sendJson(res, 404, { error: 'Сообщение не найдено' });
    if (msg.fromUserId !== user.id) return sendJson(res, 403, { error: 'Можно удалить только своё сообщение' });
    db.messages = (db.messages || []).filter(m => m.id !== msgId);
    writeDb(db);
    const group = (db.groups || []).find(g => g.id === (msg.groupId || msg.toUserId));
    const payload = { id: msgId, deleted: true, fromUserId: msg.fromUserId, toUserId: msg.toUserId, groupId: group ? group.id : (msg.groupId || '') };
    if (group) sendGroupEvent(group, 'message_update', payload);
    else { sendEventToUser(msg.fromUserId, 'message_update', payload); sendEventToUser(msg.toUserId, 'message_update', payload); }
    return sendJson(res, 200, { ok: true });
  }


  if (pathname === '/api/admin/login' && method === 'POST') {
    return readBody(req).then(body => {
      const db = readDb(); ensureModeration(db);
      if (!verifyAdminPassword(body.password)) return sendJson(res, 401, { error: 'Неверный пароль' });
      const token = makeToken();
      db.moderation.adminRoutes.push({ token, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+12*60*60*1000).toISOString() });
      writeDb(db);
      return sendJson(res, 200, { token });
    }).catch(err => sendJson(res, 400, { error: err.message }));
  }
  if (pathname.startsWith('/api/admin/')) {
    const db = readDb(); ensureModeration(db);
    const token = String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'').trim();
    const ok = db.moderation.adminRoutes.some(r => r.token===token && new Date(r.expiresAt).getTime()>Date.now());
    if (!ok) return sendJson(res, 401, { error: 'Admin unauthorized' });
    if (pathname === '/api/admin/stats' && method === 'GET') return sendJson(res, 200, adminSnapshot(db));
    if (pathname === '/api/admin/users' && method === 'GET') {
      const q = String(searchParams.get('q')||'').toLowerCase();
      const items = db.users.filter(u => !q || [u.name,u.username,u.bio].join(' ').toLowerCase().includes(q)).map(u => { const ban=getActiveBan(db,u.id); return ({...publicUser(u), verified: !!u.verified, ban: ban?{reason:ban.reason||'',expiresAt:ban.expiresAt||'',permanent:!ban.expiresAt}:null}); });
      return sendJson(res, 200, { items });
    }
    if (pathname === '/api/admin/bans' && method === 'GET') return sendJson(res,200,{items:db.moderation.bans});
    if (pathname === '/api/admin/logs' && method === 'GET') { ensureModeration(db); writeDb(db); return sendJson(res,200,{items:db.moderation.logs.slice().reverse()}); }
    if (pathname === '/api/admin/user/verify' && method === 'POST') return readBody(req).then(body=>{ const u=db.users.find(x=>x.id===String(body.userId||'')); if(!u) return sendJson(res,404,{error:'not found'}); u.verified=!!body.verified; pushLog(db,'verify',{userId:u.id,verified:u.verified}); writeDb(db); const payload=publicUser(u); for (const t of sseClients.keys()) sendEventToSessionToken(t,'profile',payload); return sendJson(res,200,{ok:true}); }).catch(err=>sendJson(res,400,{error:err.message}));
    if (pathname === '/api/admin/user/ban' && method === 'POST') return readBody(req).then(body=>{ const userId=String(body.userId||''); const reason=String(body.reason||'').slice(0,250); const type=String(body.type||'temp'); const u=db.users.find(x=>x.id===userId); if(!u) return sendJson(res,404,{error:'not found'}); const userSessions=Array.from(sessions.values()).filter(se=>se.userId===userId); const deviceKeys=Array.from(new Set(userSessions.map(se=>deviceBanKeyFromInfo({ip:se.ip,ua:se.ua})))); const ips=Array.from(new Set(userSessions.map(se=>se.ip).filter(Boolean))); db.moderation.bans=db.moderation.bans.filter(b=>b.userId!==userId); const ban={id:crypto.randomUUID(),userId,reason,createdAt:new Date().toISOString(),expiresAt:type==='temp'?new Date(Date.now()+Math.max(1,Number(body.hours||1))*3600000).toISOString():'',deviceKeys,ips}; db.moderation.bans.push(ban); pushLog(db,'ban',ban); writeDb(db); for (const [t,se] of Array.from(sessions.entries())) if(se.userId===userId){ sendEventToSessionToken(t,'force_logout',{reason:'Ваш аккаунт заблокирован',ban:publicBan(ban)}); sessions.delete(t); sseClients.delete(t); } return sendJson(res,200,{ok:true,ban:publicBan(ban)}); }).catch(err=>sendJson(res,400,{error:err.message}));
    if (pathname === '/api/admin/user/unban' && method === 'POST') return readBody(req).then(body=>{ const userId=String(body.userId||''); db.moderation.bans=db.moderation.bans.filter(b=>b.userId!==userId); pushLog(db,'unban',{userId}); writeDb(db); return sendJson(res,200,{ok:true}); }).catch(err=>sendJson(res,400,{error:err.message}));
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    if (path.basename(filePath) === 'app.js') {
      const encoded = Buffer.from(String(data), 'utf8').toString('base64');
      const wrapped = `(()=>{const __c="${encoded}";const __b=atob(__c);const __u=Uint8Array.from(__b,c=>c.charCodeAt(0));const __s=new TextDecoder('utf-8').decode(__u);(0,eval)(__s);})();`;
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(wrapped);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname.startsWith('/api/')) {
    return handleApi(req, res, requestUrl);
  }

  if (requestUrl.pathname === '/healthz') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (requestUrl.pathname === '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const isAdminAlias = requestUrl.pathname.startsWith('/admin-') && !requestUrl.pathname.includes('.') && requestUrl.pathname.indexOf('/', 1) === -1;
  const isAppRoute = /^\/(list|chat|favorites|search|profile|login|reg|vpsc)$/.test(requestUrl.pathname);
  const isPublicProfileRoute = /^\/m-in\/[A-Za-z0-9_]{5,70}$/.test(requestUrl.pathname);
  const isGroupInviteRoute = /^\/m-in\/group\/[A-Za-z0-9_-]{6,32}$/.test(requestUrl.pathname);
  const normalizedPath = requestUrl.pathname === '/' ? '/index.html' : (isAppRoute ? '/index.html' : (requestUrl.pathname === '/banned' ? '/banned.html' : ((isPublicProfileRoute || isGroupInviteRoute) ? '/m-in.html' : (requestUrl.pathname === '/admin-panel' ? '/admin-panel.html' : ((requestUrl.pathname === '/admin' || isAdminAlias) ? '/admin-login.html' : requestUrl.pathname)))));
  const safePath = path.normalize(normalizedPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  sendFile(res, filePath);
});

ensureDb();
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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
      messages: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
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
  const used = new Set((db.users || []).map(u => normalizeVpscCode(u.vpscCode)));
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

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    bio: user.bio || '',
    avatarDataUrl: user.avatarDataUrl || '',
    bannerDataUrl: user.bannerDataUrl || ''
  };
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

function broadcastProfile(user) {
  sendEventToUser(user.id, 'profile', publicUser(user));
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
  return {
    id: msg.id,
    fromUserId: msg.fromUserId,
    toUserId: msg.toUserId,
    text: msg.text || '',
    media: Array.isArray(msg.media) ? msg.media : [],
    replyToMessageId: msg.replyToMessageId || '',
    forwardedFromName: msg.forwardedFromName || '',
    reactions: msg.reactions || {},
    pinnedBy: Array.isArray(msg.pinnedBy) ? msg.pinnedBy : [],
    editedAt: msg.editedAt || '',
    createdAt: msg.createdAt
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

  if (pathname === '/api/register' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const { name, username, password } = body;
        if (!username || !password) return sendJson(res, 400, { error: 'username и пароль обязательны' });
        const db = readDb();
        if (db.users.some(u => u.username.toLowerCase() === String(username).toLowerCase())) {
          return sendJson(res, 409, { error: 'Пользователь уже существует' });
        }
        const user = {
          id: crypto.randomUUID(),
          name: name || username,
          username,
          passwordHash: hashPassword(password),
          vpscCode: makeUniqueVpscCode(db),
          bio: '',
          avatarDataUrl: '',
          bannerDataUrl: ''
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
        const db = readDb();
        const user = db.users.find(u => u.username === username && u.passwordHash === hashPassword(password || ''));
        if (!user) return sendJson(res, 401, { error: 'Неверный логин или пароль' });
        if (!user.vpscCode) {
          user.vpscCode = makeUniqueVpscCode(db);
          writeDb(db);
        }
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

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(`event: profile\ndata: ${JSON.stringify(publicUser(user))}\n\n`);
    sseClients.set(token, res);
    req.on('close', () => {
      sseClients.delete(token);
    });
    return;
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const token = req.headers['x-session-token'];
    if (token) {
      const s = sessions.get(token);
      sessions.delete(token);
      sseClients.delete(token);
      if (s && s.userId) broadcastSessionsUpdate(s.userId);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/vpsc/login' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const code = normalizeVpscCode(body.code);
        if (code.length !== 6) return sendJson(res, 400, { error: 'Некорректный код' });
        const db = readDb();
        const user = db.users.find(u => normalizeVpscCode(u.vpscCode) === code);
        if (!user) return sendJson(res, 401, { error: 'Код не найден' });
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
    return sendJson(res, 200, { user: publicUser(user), vpscCode: user.vpscCode || '' });
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
        if (nextUsername && db.users.some(u => u.id !== user.id && u.username.toLowerCase() === nextUsername.toLowerCase())) {
          return sendJson(res, 409, { error: 'username уже занят' });
        }
        user.name = String(body.name || user.name || '').trim() || user.name;
        if (nextUsername) user.username = nextUsername;
        user.bio = String(body.bio || '').slice(0, 120);
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
    if (!user.vpscCode) {
      user.vpscCode = makeVpscCode();
      writeDb(db);
    }
    return sendJson(res, 200, { code: user.vpscCode });
  }

  if (pathname === '/api/me/vpsc' && method === 'POST') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    user.vpscCode = makeUniqueVpscCode(db);
    writeDb(db);
    return sendJson(res, 200, { code: user.vpscCode });
  }

  if (pathname === '/api/me/password' && method === 'PATCH') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const currentPassword = String(body.currentPassword || '');
        const newPassword = String(body.newPassword || '');
        if (hashPassword(currentPassword) !== user.passwordHash) return sendJson(res, 400, { error: 'Неверный текущий пароль' });
        if (newPassword.length < 6) return sendJson(res, 400, { error: 'Новый пароль слишком короткий' });
        user.passwordHash = hashPassword(newPassword);
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
        if (hashPassword(password) !== user.passwordHash) return sendJson(res, 400, { error: 'Неверный пароль' });
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
    const messages = db.messages || [];
    const dialogUserIds = new Set(
      messages
        .filter(m => m.fromUserId === user.id || m.toUserId === user.id)
        .map(m => (m.fromUserId === user.id ? m.toUserId : m.fromUserId))
    );
    const userById = new Map((db.users || []).map(u => [u.id, u]));
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
        const preview = last
          ? (String(last.text || '').trim() || ((Array.isArray(last.media) && last.media.length) ? '📷 Медиа' : ''))
          : (username ? `@${username}` : '');
        return {
          id: uid,
          name,
          preview,
          lastCreatedAt: last ? last.createdAt : '',
          avatarDataUrl: u ? (u.avatarDataUrl || '') : '',
          bannerDataUrl: u ? (u.bannerDataUrl || '') : '',
          avatar: u ? (u.name || u.username || 'U').charAt(0).toUpperCase() : '⌧',
          color: u ? colorForId(u.id) : 'linear-gradient(135deg,#4B5563,#1F2937)',
          deleted: !u
        };
      })
      .filter(u => {
        const n = String(u.name || '').toLowerCase();
        const un = String((u.username || '')).toLowerCase();
        return !q || n.includes(q) || un.includes(q);
      });
    return sendJson(res, 200, { items });
  }

  const chatMatch = pathname.match(/^\/api\/chats\/([^/]+)$/);
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
        avatarDataUrl: u.avatarDataUrl || '',
        avatar: (u.name || u.username || 'U').charAt(0).toUpperCase(),
        color: colorForId(u.id)
      }));
    return sendJson(res, 200, { items });
  }

  if (pathname === '/api/messages' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const withUserId = String(searchParams.get('withUserId') || '');
    const peer = db.users.find(u => u.id === withUserId);
    const items = (db.messages || []).filter(m =>
      (m.fromUserId === user.id && m.toUserId === withUserId) ||
      (m.fromUserId === withUserId && m.toUserId === user.id)
    );
    if (!peer && !items.length) return sendJson(res, 404, { error: 'Пользователь не найден' });
    return sendJson(res, 200, {
      items: items.map(normalizeMessage),
      peer: peer
        ? { id: peer.id, name: peer.name || peer.username, username: peer.username, avatarDataUrl: peer.avatarDataUrl || '', bannerDataUrl: peer.bannerDataUrl || '' }
        : { id: withUserId, name: 'Пользователь удалён', username: '', avatarDataUrl: '', bannerDataUrl: '', deleted: true }
    });
  }

  if (pathname === '/api/messages' && method === 'POST') {
    return readBody(req)
      .then(body => {
        const db = readDb();
        const user = getUserByToken(req, db);
        if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
        const toUserId = String(body.toUserId || '');
        const text = String(body.text || '').trim();
        const media = Array.isArray(body.media) ? body.media.filter(Boolean).slice(0, 10) : [];
        if (!text && !media.length) return sendJson(res, 400, { error: 'Пустое сообщение' });
        const peer = db.users.find(u => u.id === toUserId);
        if (!peer) return sendJson(res, 404, { error: 'Пользователь не найден' });
        const msg = {
          id: crypto.randomUUID(),
          fromUserId: user.id,
          toUserId,
          text: text.slice(0, 4000),
          media,
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
        sendEventToUser(user.id, 'message', n);
        sendEventToUser(toUserId, 'message', n);
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
        if (msg.fromUserId !== user.id && msg.toUserId !== user.id) return sendJson(res, 403, { error: 'Forbidden' });
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
          msg.pinnedBy = [msg.fromUserId, msg.toUserId];
        } else if (action === 'unpin') {
          msg.pinnedBy = [];
        } else if (action === 'edit') {
          if (msg.fromUserId !== user.id) return sendJson(res, 403, { error: 'Можно редактировать только своё сообщение' });
          const text = String(body.text || '').trim();
          const media = Array.isArray(body.media) ? body.media.filter(Boolean).slice(0, 10) : null;
          const hasMedia = Array.isArray(media) ? media.length > 0 : Array.isArray(msg.media) && msg.media.length > 0;
          if (!text && !hasMedia) return sendJson(res, 400, { error: 'Пустое сообщение' });
          msg.text = text.slice(0, 4000);
          if (Array.isArray(media)) msg.media = media;
          msg.editedAt = new Date().toISOString();
        } else {
          return sendJson(res, 400, { error: 'Unknown action' });
        }
        writeDb(db);
        const n = normalizeMessage(msg);
        sendEventToUser(msg.fromUserId, 'message_update', n);
        sendEventToUser(msg.toUserId, 'message_update', n);
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
    const payload = { id: msgId, deleted: true, fromUserId: msg.fromUserId, toUserId: msg.toUserId };
    sendEventToUser(msg.fromUserId, 'message_update', payload);
    sendEventToUser(msg.toUserId, 'message_update', payload);
    return sendJson(res, 200, { ok: true });
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

  const normalizedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
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

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

const sessions = new Map();
const sseClients = new Map();

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const defaultDb = {
      users: [],
      chats: [
        { name: 'чат с поддержкой', preview: 'Ограничения не связаны с работой оборуд…', time: '12:29', avatar: 'П', color: 'linear-gradient(135deg,#0078FF,#005fcc)' },
        { name: 'уведомления', preview: 'с заботой, ваш MIN', time: '', avatar: 'У', color: 'linear-gradient(135deg,#555,#333)' },
        { name: 'что нового', preview: 'для вас уникальные предложения', time: '', avatar: 'Ч', color: 'linear-gradient(135deg,#e53935,#b71c1c)' },
        { name: 'Михаил', preview: 'Как дела? Давно не виделись', time: 'вчера', avatar: 'М', color: 'linear-gradient(135deg,#1976D2,#0D47A1)' },
        { name: 'Диана', preview: 'Скинь файл потом', time: 'пн', avatar: 'Д', color: 'linear-gradient(135deg,#388E3C,#1B5E20)' }
      ]
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

function getUserByToken(req, db) {
  const token = req.headers['x-session-token'];
  if (!token || !sessions.has(token)) return null;
  const uid = sessions.get(token);
  return db.users.find(u => u.id === uid) || null;
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

function broadcastProfile(user) {
  const uid = user.id;
  const set = sseClients.get(uid);
  if (!set || !set.size) return;
  const msg = `event: profile\ndata: ${JSON.stringify(publicUser(user))}\n\n`;
  for (const res of set) res.write(msg);
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
          bio: '',
          avatarDataUrl: '',
          bannerDataUrl: ''
        };
        db.users.push(user);
        writeDb(db);
        const token = makeToken();
        sessions.set(token, user.id);
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
        const token = makeToken();
        sessions.set(token, user.id);
        sendJson(res, 200, { token, user: publicUser(user) });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (pathname === '/api/stream' && method === 'GET') {
    const db = readDb();
    const token = searchParams.get('token');
    if (!token || !sessions.has(token)) return sendJson(res, 401, { error: 'Unauthorized' });
    const uid = sessions.get(token);
    const user = db.users.find(u => u.id === uid);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(`event: profile\ndata: ${JSON.stringify(publicUser(user))}\n\n`);
    if (!sseClients.has(uid)) sseClients.set(uid, new Set());
    sseClients.get(uid).add(res);
    req.on('close', () => {
      const set = sseClients.get(uid);
      if (!set) return;
      set.delete(res);
      if (!set.size) sseClients.delete(uid);
    });
    return;
  }

  if (pathname === '/api/me' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    return sendJson(res, 200, { user: publicUser(user) });
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
        user.bio = String(body.bio || '').slice(0, 400);
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

  if (pathname === '/api/chats' && method === 'GET') {
    const db = readDb();
    const user = getUserByToken(req, db);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    const q = String(searchParams.get('q') || '').toLowerCase();
    const items = db.chats.filter(c => c.name.toLowerCase().includes(q));
    return sendJson(res, 200, { items });
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

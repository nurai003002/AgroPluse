/**
 * API личного кабинета AgroPulse: регистрация, вход, сохранённые поля и свои культуры.
 * Без внешних зависимостей: node:http + node:sqlite (Node 22.13+), пароли — scrypt.
 *
 *   GET    /api/me              профиль, поля и культуры (401 — не вошёл)
 *   POST   /api/register        { name, login, password }
 *   POST   /api/login           { login, password }
 *   POST   /api/logout
 *   POST   /api/fields          { ...поле }          → { field }
 *   PUT    /api/fields/:id      { ...поле }
 *   DELETE /api/fields/:id
 *   POST   /api/crops           { ...культура }      → { crop }
 *   DELETE /api/crops/:id
 */
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const scrypt = promisify(scryptCb);
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const SESSION_DAYS = 30;
const COOKIE = 'ap_session';
const MAX_BODY = 64 * 1024;
const LIMITS = { fields: 100, crops: 50 };

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'agropulse.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, login TEXT NOT NULL UNIQUE,
    pass TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS crops (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL, created_at INTEGER NOT NULL
  );
`);

const sql = {
  userByLogin: db.prepare('SELECT * FROM users WHERE login = ?'),
  addUser: db.prepare('INSERT INTO users (name, login, pass, created_at) VALUES (?, ?, ?, ?)'),
  addSession: db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)'),
  session: db.prepare('SELECT u.id, u.name, u.login FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?'),
  dropSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  dropExpired: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  list: t => db.prepare(`SELECT id, data FROM ${t} WHERE user_id = ? ORDER BY id`),
  count: t => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`),
  add: t => db.prepare(`INSERT INTO ${t} (user_id, data, created_at) VALUES (?, ?, ?)`),
  update: t => db.prepare(`UPDATE ${t} SET data = ? WHERE id = ? AND user_id = ?`),
  remove: t => db.prepare(`DELETE FROM ${t} WHERE id = ? AND user_id = ?`)
};
const TABLE = {};
for (const t of ['fields', 'crops']) TABLE[t] = { list: sql.list(t), count: sql.count(t), add: sql.add(t), update: sql.update(t), remove: sql.remove(t) };

/* ---------- Пароли и сессии ---------- */
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(password, stored) {
  const [, salt, key] = stored.split('$');
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}
// В базе лежит только хэш токена: утечка базы не даёт войти чужими сессиями
const tokenHash = token => createHash('sha256').update(token).digest('hex');

function startSession(res, req, userId) {
  const token = randomBytes(32).toString('base64url');
  sql.addSession.run(tokenHash(token), userId, Date.now() + SESSION_DAYS * 864e5);
  setCookie(res, req, token, SESSION_DAYS * 86400);
}
function setCookie(res, req, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
function readToken(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
  return m ? m[1] : null;
}
function currentUser(req) {
  const token = readToken(req);
  return token ? sql.session.get(tokenHash(token), Date.now()) || null : null;
}

/* ---------- Проверка ввода ---------- */
// Логин — телефон (только цифры, +996…) или email (в нижнем регистре)
function normLogin(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120) return s;
  const digits = s.replace(/[\s()+-]/g, '');
  if (/^\d{9,15}$/.test(digits)) return '+' + (digits.length === 9 ? '996' + digits : digits.replace(/^0(\d{9})$/, '996$1'));
  return null;
}
const str = (v, max) => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

function cleanField(b) {
  const lat = num(b.lat, -90, 90), lon = num(b.lon, -180, 180);
  if (lat == null || lon == null) return null;
  const outline = Array.isArray(b.outline) && b.outline.length >= 3 && b.outline.length <= 200 &&
    b.outline.every(p => Array.isArray(p) && num(p[0], -90, 90) != null && num(p[1], -180, 180) != null)
    ? b.outline.map(([a, c]) => [+a.toFixed(6), +c.toFixed(6)]) : null;
  return {
    name: str(b.name, 80) || 'Поле', place: str(b.place, 80), lat, lon, outline,
    drawn: !!b.drawn && !!outline, areaHa: num(b.areaHa, 0, 1e6), cropId: str(b.cropId, 40)
  };
}
function cleanCrop(b) {
  const name = str(b.name, 40);
  if (!name) return null;
  const pick = (v, ok) => (ok.includes(v) ? v : ok[1]);
  return { name, perennial: !!b.perennial, warmth: pick(b.warmth, ['cold', 'mid', 'warm']), water: pick(b.water, ['low', 'mid', 'high']) };
}

/* ---------- Защита от перебора паролей: 10 попыток за 15 минут ---------- */
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter(t => now - t < 15 * 60e3);
  list.push(now);
  attempts.set(key, list);
  return list.length > 10;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of attempts) if (list.every(t => now - t >= 15 * 60e3)) attempts.delete(k);
  sql.dropExpired.run(now);
}, 10 * 60e3).unref();

/* ---------- HTTP ---------- */
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const fail = (res, status, error) => send(res, status, { error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' ? v : {}); }
      catch { reject(Object.assign(new Error('bad_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const rows = (table, userId) => TABLE[table].list.all(userId).map(r => ({ ...JSON.parse(r.data), id: r.id }));
const profile = u => ({ user: { id: u.id, name: u.name, login: u.login }, fields: rows('fields', u.id), crops: rows('crops', u.id) });

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;

  if (req.method === 'GET' && route === '/health') return send(res, 200, { ok: true });

  // Изменяющие запросы — только JSON со своего сайта: вместе с SameSite=Lax это закрывает CSRF
  if (req.method !== 'GET' && !String(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 415, 'json_only');
  const body = req.method === 'GET' ? {} : await readBody(req);

  if (req.method === 'POST' && route === '/register') {
    const name = str(body.name, 60), login = normLogin(body.login), password = String(body.password ?? '');
    if (!name) return fail(res, 400, 'name');
    if (!login) return fail(res, 400, 'login');
    if (password.length < 6 || password.length > 200) return fail(res, 400, 'password');
    if (tooMany('reg:' + ip)) return fail(res, 429, 'too_many');
    if (sql.userByLogin.get(login)) return fail(res, 409, 'exists');
    const { lastInsertRowid } = sql.addUser.run(name, login, await hashPassword(password), Date.now());
    startSession(res, req, Number(lastInsertRowid));
    return send(res, 201, profile({ id: Number(lastInsertRowid), name, login }));
  }

  if (req.method === 'POST' && route === '/login') {
    const login = normLogin(body.login), password = String(body.password ?? '');
    if (tooMany('login:' + ip) || (login && tooMany('acc:' + login))) return fail(res, 429, 'too_many');
    const u = login && sql.userByLogin.get(login);
    if (!u || !(await checkPassword(password, u.pass))) return fail(res, 401, 'wrong');
    startSession(res, req, u.id);
    return send(res, 200, profile(u));
  }

  if (req.method === 'POST' && route === '/logout') {
    const token = readToken(req);
    if (token) sql.dropSession.run(tokenHash(token));
    setCookie(res, req, '', 0);
    return send(res, 200, { ok: true });
  }

  const user = currentUser(req);
  if (!user) return fail(res, 401, 'auth');

  if (req.method === 'GET' && route === '/me') return send(res, 200, profile(user));

  const m = route.match(/^\/(fields|crops)(?:\/(\d+))?$/);
  if (m) {
    const [, table, id] = m;
    const T = TABLE[table];
    const clean = table === 'fields' ? cleanField : cleanCrop;
    if (req.method === 'POST' && !id) {
      const item = clean(body);
      if (!item) return fail(res, 400, 'invalid');
      if (T.count.get(user.id).n >= LIMITS[table]) return fail(res, 400, 'limit');
      const { lastInsertRowid } = T.add.run(user.id, JSON.stringify(item), Date.now());
      return send(res, 201, { [table.slice(0, -1)]: { ...item, id: Number(lastInsertRowid) } });
    }
    if (req.method === 'PUT' && id && table === 'fields') {
      const item = clean(body);
      if (!item) return fail(res, 400, 'invalid');
      if (!T.update.run(JSON.stringify(item), +id, user.id).changes) return fail(res, 404, 'not_found');
      return send(res, 200, { field: { ...item, id: +id } });
    }
    if (req.method === 'DELETE' && id) {
      if (!T.remove.run(+id, user.id).changes) return fail(res, 404, 'not_found');
      return send(res, 200, { ok: true });
    }
  }
  return fail(res, 404, 'not_found');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (!e.status) console.error('API:', e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'server');
  });
});
server.listen(PORT, () => console.log(`AgroPulse API: порт ${PORT}, база ${path.join(DATA_DIR, 'agropulse.db')}`));

for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => server.close(() => { db.close(); process.exit(0); }));

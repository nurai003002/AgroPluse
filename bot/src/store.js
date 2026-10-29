/**
 * Пользователи бота в одном JSON-файле: язык, место, культура, подписка на предупреждения.
 * Для пилота на десятки фермеров этого хватает; дальше — SQLite или Postgres.
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve(process.env.DATA_DIR || 'data', 'users.json');
let users = null;
let saving = Promise.resolve();

async function load() {
  if (users) return users;
  try { users = JSON.parse(await readFile(FILE, 'utf8')); } catch { users = {}; }
  return users;
}

export async function getUser(id) {
  const all = await load();
  if (!all[id]) all[id] = { lang: null, place: null, crop: null, alerts: false, lastAlerts: {} };
  return all[id];
}

export async function allUsers() {
  return Object.entries(await load());
}

// Запись по очереди и через временный файл, чтобы не испортить базу при сбое
export function save() {
  saving = saving.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE + '.tmp', JSON.stringify(users, null, 2));
    await rename(FILE + '.tmp', FILE);
  }).catch(e => console.error('Не удалось сохранить users.json:', e));
  return saving;
}

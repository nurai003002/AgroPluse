/**
 * Внешние источники. Все бесплатные и без ключей:
 *   NASA POWER     — климат за 40 лет и свежая влажность корневого слоя почвы (MERRA-2)
 *   Open-Meteo     — прогноз погоды на 7 дней и высоты рельефа
 *   Nominatim/OSM  — поиск сёл по названию и название места по координатам
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const UA = 'AgroPulseBot/0.1 (hackathon prototype; https://github.com/nurai003002/AgroPluse)';
const CACHE_DIR = path.resolve(process.env.DATA_DIR || 'data', 'cache');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, { timeout = 30000, retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { fatal: true });
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

// Кэш на диске: климат за 40 лет не меняется, незачем каждый раз скачивать
async function cached(key, maxAgeMs, load) {
  const file = path.join(CACHE_DIR, key.replace(/[^\w.-]/g, '_') + '.json');
  try {
    const { savedAt, data } = JSON.parse(await readFile(file, 'utf8'));
    if (Date.now() - savedAt < maxAgeMs) return data;
  } catch { /* кэша нет — загрузим */ }
  const data = await load();
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify({ savedAt: Date.now(), data }));
  await rename(tmp, file);
  return data;
}

const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const DAY = 864e5;

/* ---------- Поиск мест ---------- */
export async function geocode(query, lang) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1' +
    '&viewbox=69,44,81,39&accept-language=' + (lang === 'ky' ? 'ky,ru' : 'ru') + '&q=' + encodeURIComponent(query);
  const res = await fetchJson(url, { timeout: 15000 });
  if (!res.length) return null;
  const r = res[0];
  return { lat: +r.lat, lon: +r.lon, name: r.name || r.display_name.split(',')[0], full: r.display_name };
}

export async function reverseName(lat, lon, lang) {
  try {
    const j = await fetchJson('https://nominatim.openstreetmap.org/reverse?format=json&zoom=14' +
      '&lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5) + '&accept-language=' + (lang === 'ky' ? 'ky,ru' : 'ru'), { timeout: 15000, retries: 2 });
    const a = j.address || {};
    return a.village || a.town || a.city || a.hamlet || a.suburb || a.county || a.state || null;
  } catch { return null; }
}

/* ---------- Рельеф: высота и уклон по 5 точкам вокруг ---------- */
export async function terrain(lat, lon) {
  const d = 0.003;
  const pts = [[lat, lon], [lat + d, lon], [lat - d, lon], [lat, lon + d], [lat, lon - d]];
  const key = `terrain_${lat.toFixed(4)}_${lon.toFixed(4)}`;
  return cached(key, 365 * DAY, async () => {
    const j = await fetchJson('https://api.open-meteo.com/v1/elevation?latitude=' + pts.map(p => p[0].toFixed(5)).join(',') +
      '&longitude=' + pts.map(p => p[1].toFixed(5)).join(','));
    const e = j.elevation;
    const dy = 2 * d * 110540, dx = 2 * d * 111320 * Math.cos(lat * Math.PI / 180);
    const slope = Math.atan(Math.hypot((e[1] - e[2]) / dy, (e[3] - e[4]) / dx)) * 180 / Math.PI;
    return { elev: e[0], slope };
  });
}

/* ---------- Прогноз погоды на 7 дней ---------- */
export async function forecast(lat, lon, elev) {
  const key = `forecast_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  return cached(key, 3 * 3600e3, async () => {
    const j = await fetchJson('https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
      '&elevation=' + Math.round(elev) +
      '&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=Asia%2FBishkek&forecast_days=7');
    const D = j.daily;
    return D.time.map((t, i) => ({ date: t, tmin: D.temperature_2m_min[i], tmax: D.temperature_2m_max[i], rain: D.precipitation_sum[i] ?? 0 }));
  });
}

/* ---------- NASA POWER ---------- */
const POWER = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const grid = v => (Math.round(v * 10) / 10).toFixed(1); // сетка 0,1° — соседние точки делят один кэш

// Климат 1985 — прошлый год: суточная температура, осадки, влажность корневого слоя
export async function powerClimate(lat, lon) {
  const lastYear = new Date().getUTCFullYear() - 1;
  const key = `power_climate_${grid(lat)}_${grid(lon)}_${lastYear}`;
  return cached(key, 365 * DAY, () => fetchJson(`${POWER}?parameters=T2M,PRECTOTCORR,GWETROOT&community=AG` +
    `&latitude=${grid(lat)}&longitude=${grid(lon)}&start=19850101&end=${lastYear}1231&format=JSON`, { timeout: 120000 }));
}

// Последние 45 дней: свежая влажность почвы (NASA публикует её с задержкой около недели)
export async function powerRecent(lat, lon) {
  const now = new Date();
  const key = `power_recent_${grid(lat)}_${grid(lon)}`;
  return cached(key, 6 * 3600e3, () => fetchJson(`${POWER}?parameters=GWETROOT,PRECTOTCORR&community=AG` +
    `&latitude=${grid(lat)}&longitude=${grid(lon)}&start=${ymd(new Date(now - 45 * DAY))}&end=${ymd(now)}&format=JSON`, { timeout: 60000 }));
}

/**
 * Расчёты AgroPulse на настоящих данных. Логика та же, что на сайте (index.html):
 * пригодность по «закону минимума», дата устойчивого перехода через порог, риски по прогнозу.
 */
import { CROPS, SUIT } from './crops.js';
import * as src from './sources.js';

// Ячейка NASA POWER ~50 км, её высота — среднее по ячейке (с горами). Поправляем температуру
// на разницу высот вполсилы: полный градиент 6,5 °C/км на таких ячейках перегревает долины
const LAPSE_K = 0.003;
const FILL = -999;

const pad = n => String(n).padStart(2, '0');
const keyOf = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
export const doyToDM = doy => { const d = new Date(Date.UTC(2025, 0, Math.round(doy))); return pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1); };

/* ---------- Климат из NASA POWER ---------- */
function climateFromPower(power, elev) {
  const P = power.properties.parameter;
  const cellElev = power.geometry.coordinates[2];
  const dT = LAPSE_K * (cellElev - elev);
  const years = Object.keys(P.T2M).map(k => +k.slice(0, 4));
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const T2M = {};
  let tSum = 0, tN = 0;
  for (const [k, v] of Object.entries(P.T2M)) {
    if (v === FILL) continue;
    T2M[k] = v + dT; tSum += v + dT; tN++;
  }
  let rain = 0;
  for (const v of Object.values(P.PRECTOTCORR)) if (v !== FILL) rain += v;
  return { T2M, y0, y1, tmean: tSum / tN, rainYear: rain / (y1 - y0 + 1), gwet: P.GWETROOT, cellElev, dT };
}

/* ---------- Пригодность места ---------- */
function trapezoid(v, [a, b, c, d]) {
  if (v <= a || v >= d) return 0;
  if (v < b) return (v - a) / (b - a);
  if (v > c) return (d - v) / (d - c);
  return 1;
}
export function suitability(cropId, env) {
  const c = CROPS[cropId];
  const fT = trapezoid(env.tmean, c.temp);
  const fS = env.slope <= c.slope[0] ? 1 : env.slope >= c.slope[1] ? 0 : 1 - (env.slope - c.slope[0]) / (c.slope[1] - c.slope[0]);
  const fM = env.rain >= c.rain ? 1 : SUIT.irrigatedCap;
  const score = Math.min(fT, fS, fM);
  const cls = score >= SUIT.good ? 'good' : score >= SUIT.mid ? 'mid' : 'bad';
  let reason = 'Ok';
  if (score < 0.9) {
    if (score === fT) reason = env.tmean < c.temp[1] ? 'Cold' : 'Hot';
    else if (score === fS) reason = 'Steep';
    else reason = 'Dry';
    if (cls === 'bad' && reason !== 'Dry') reason += 'Bad';
  }
  return { score, cls, reason };
}
export const bestCrops = env => Object.keys(CROPS)
  .map(id => ({ id, s: suitability(id, env) }))
  .filter(x => x.s.score > 0)
  .sort((a, b) => b.s.score - a.s.score);

/* ---------- Сроки сева по 40 годам NASA POWER ---------- */
// Первый день (с 1 февраля), после которого 5-дневное среднее держится выше порога 30 дней подряд
function transitionDoy(T2M, year, threshold) {
  const vals = [];
  for (let d = 0; d < 182; d++) vals.push(T2M[keyOf(new Date(Date.UTC(year, 0, 1 + d)))] ?? NaN);
  const mean5 = vals.map((_, i) => {
    let s = 0, c = 0;
    for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < vals.length && !isNaN(vals[j])) { s += vals[j]; c++; }
    return c ? s / c : NaN;
  });
  for (let i = 31; i < mean5.length - 30; i++) {
    let ok = true;
    for (let j = i; j < i + 30; j++) if (!(mean5[j] > threshold)) { ok = false; break; }
    if (ok) return i + 1;
  }
  return null;
}
function linearTrend(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  return { slope, at: x => my + slope * (x - mx) };
}
const SOIL_WARMUP = 7, WINDOW = 21;

export function sowing(climate, cropId, today = new Date()) {
  const threshold = CROPS[cropId].sowTemp;
  const years = [], doys = [];
  for (let y = climate.y0; y <= climate.y1; y++) {
    const d = transitionDoy(climate.T2M, y, threshold);
    if (d != null) { years.push(y); doys.push(d); }
  }
  if (years.length < (climate.y1 - climate.y0 + 1) / 2) return { tooCold: true, threshold };
  const trend = linearTrend(years, doys);
  const shift = Math.round(trend.at(climate.y0) - trend.at(climate.y1)); // > 0 — сезон стал раньше
  // Если окно этого года уже прошло — считаем на следующую весну
  const todayDoy = Math.floor((today - Date.UTC(today.getUTCFullYear(), 0, 1)) / 864e5) + 1;
  let year = today.getUTCFullYear();
  if (todayDoy > trend.at(year) + SOIL_WARMUP + WINDOW) year++;
  const from = trend.at(year) + SOIL_WARMUP;
  return { threshold, shift, year, from, to: from + WINDOW, fromDate: dateOfDoy(year, from), years: years.length };
}
const dateOfDoy = (year, doy) => new Date(Date.UTC(year, 0, Math.round(doy)));

/* ---------- Влажность почвы: суше или влажнее обычного ---------- */
// GWETROOT (0–1) у NASA меняется плавно, поэтому сравниваем не с порогом, а с нормой этого месяца
function soilState(recent, climate) {
  const P = recent.properties.parameter.GWETROOT;
  const valid = Object.entries(P).filter(([, v]) => v !== FILL).sort(([a], [b]) => a.localeCompare(b));
  if (!valid.length) return null;
  const [date, value] = valid[valid.length - 1];
  const month = date.slice(4, 6);
  const norm = Object.entries(climate.gwet)
    .filter(([k, v]) => v !== FILL && k.slice(4, 6) === month && +k.slice(0, 4) >= climate.y1 - 14)
    .map(([, v]) => v).sort((a, b) => a - b);
  const below = norm.filter(v => v < value).length;
  const pct = norm.length ? Math.round(below / norm.length * 100) : 50; // перцентиль относительно нормы
  return { date: `${date.slice(6, 8)}.${date.slice(4, 6)}`, value, pct };
}

/* ---------- Риски по прогнозу ---------- */
const TH = { frost: 0, heat: 32, droughtDays: 5, dryPct: 25, rainSkip: 5 };

function risks(days, soil, month, day) {
  const out = [];
  // Заморозки опасны весной (всходы, цветение садов) и в начале осени (неубранный урожай);
  // с конца октября и зимой мороз — норма, о нём не пишем
  const frostSeason = (month >= 3 && month <= 5) || (month === 6 && day <= 15) || month === 9 || (month === 10 && day <= 20);
  const frost = days.slice(0, 3).find(d => d.tmin <= TH.frost);
  if (frostSeason && frost) out.push({ type: 'frost', date: frost.date, t: frost.tmin, autumn: month >= 9 });
  const hot = days.slice(0, 3).filter(d => d.tmax >= TH.heat).sort((a, b) => b.tmax - a.tmax)[0];
  if (month >= 5 && month <= 8 && hot) out.push({ type: 'heat', date: hot.date, t: hot.tmax });
  let dry = 0;
  for (const d of days) { if (d.rain < 1) dry++; else break; }
  if (month >= 4 && month <= 9 && soil && soil.pct <= TH.dryPct && dry >= TH.droughtDays) out.push({ type: 'drought', n: dry });
  return out;
}

function watering(days, soil, month) {
  // Поливной сезон в долинах Кыргызстана — апрель–сентябрь
  if (month <= 3 || month >= 10) return { key: 'offSeason' };
  const rain3 = days.slice(0, 3).reduce((s, d) => s + d.rain, 0);
  if (rain3 >= TH.rainSkip) return { key: 'waitRain', rain: rain3 };
  if (!soil) return { key: 'unknown' };
  if (soil.pct <= TH.dryPct) return { key: 'water' };
  const hot = days.slice(0, 3).reduce((s, d) => s + d.tmax, 0) / 3 > 25;
  if (soil.pct <= 45 && hot) return { key: 'soon' };
  return { key: 'ok' };
}

/* ---------- Полный разбор места ---------- */
export async function analyze(place, cropId, today = new Date()) {
  const { lat, lon } = place;
  const ter = await src.terrain(lat, lon);
  const [power, recent, fc] = await Promise.all([
    src.powerClimate(lat, lon), src.powerRecent(lat, lon).catch(() => null), src.forecast(lat, lon, ter.elev)
  ]);
  const climate = climateFromPower(power, ter.elev);
  const env = { elev: ter.elev, slope: ter.slope, tmean: climate.tmean, rain: climate.rainYear };
  const soil = recent ? soilState(recent, climate) : null;
  const local = new Date(today.getTime() + 6 * 3600e3).toISOString(); // дата по Бишкеку
  const month = +local.slice(5, 7), day = +local.slice(8, 10);
  const suit = suitability(cropId, env);
  const sow = sowing(climate, cropId, today);
  if (suit.reason === 'ColdBad') sow.tooCold = true;
  return {
    place, cropId, env, soil, days: fc, month,
    suit, sow, best: bestCrops(env),
    risks: risks(fc, soil, month, day),
    water: watering(fc, soil, month),
    climateYears: [climate.y0, climate.y1]
  };
}


/**
 * Проверка без Telegram: печатает совет и предупреждения для места.
 *   npm run try -- "Кемин" barley
 *   npm run try -- 42.782,75.617 wheat ky
 */
import { analyze } from './agro.js';
import { geocode, reverseName } from './sources.js';
import { card, alertText } from './texts.js';
import { alertItems } from './alerts.js';

const [query = 'Кемин', crop = 'wheat', lang = 'ru'] = process.argv.slice(2);
const m = query.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
const place = m
  ? { lat: +m[1], lon: +m[2], name: (await reverseName(+m[1], +m[2], lang)) || query }
  : await geocode(query, lang);
if (!place) { console.log('Место не найдено'); process.exit(1); }

const t0 = Date.now();
const a = await analyze(place, crop);
const plain = s => s.replace(/<[^>]+>/g, '');
console.log(plain(card(lang, a)));
const items = alertItems(a);
console.log('\n--- предупреждения сейчас:', items.length ? '\n' + plain(alertText(lang, a, items)) : 'нет');
console.log(`\n(${Date.now() - t0} мс; tmean ${a.env.tmean.toFixed(2)} °C, осадки ${Math.round(a.env.rain)} мм/год, почва ${JSON.stringify(a.soil)})`);

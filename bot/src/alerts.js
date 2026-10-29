/**
 * Предупреждения: каждое утро в 7:00 по Бишкеку проверяем прогноз для подписанных фермеров
 * и пишем, только если есть что делать. Одно и то же предупреждение — не чаще раза в 3 дня.
 */
import { analyze } from './agro.js';
import { alertText } from './texts.js';
import { allUsers, save } from './store.js';

const HOUR = Number(process.env.ALERT_HOUR ?? 7);
const REPEAT_DAYS = 3;
const SOW_NOTICE_DAYS = 3; // за сколько дней предупредить о начале окна сева

const bishkekNow = () => new Date(Date.now() + 6 * 3600e3); // UTC+6, без перехода на летнее время
const isoDay = d => d.toISOString().slice(0, 10);

// Что стоит сообщить сейчас (без учёта того, что уже отправляли)
export function alertItems(a, today = bishkekNow()) {
  const items = [...a.risks];
  if (!a.sow.tooCold && a.sow.fromDate) {
    const n = Math.round((a.sow.fromDate - Date.parse(isoDay(today))) / 864e5);
    if (n >= 0 && n <= SOW_NOTICE_DAYS) items.push({ type: 'sowSoon', n });
  }
  return items;
}

function fresh(user, items, today) {
  const t0 = Date.parse(isoDay(today));
  return items.filter(it => {
    const last = user.lastAlerts?.[it.type];
    return !last || (t0 - Date.parse(last)) / 864e5 >= REPEAT_DAYS;
  });
}

export async function runAlerts(bot) {
  const today = bishkekNow();
  let sent = 0;
  for (const [id, user] of await allUsers()) {
    if (!user.alerts || !user.place || !user.crop) continue;
    try {
      const a = await analyze(user.place, user.crop);
      const items = fresh(user, alertItems(a, today), today);
      if (!items.length) continue;
      await bot.api.sendMessage(id, alertText(user.lang || 'ru', a, items), { parse_mode: 'HTML' });
      user.lastAlerts = user.lastAlerts || {};
      for (const it of items) user.lastAlerts[it.type] = isoDay(today);
      sent++;
    } catch (e) {
      console.error(`Предупреждение для ${id} не отправлено:`, e.message);
    }
  }
  await save();
  console.log(`[alerts] ${isoDay(today)}: отправлено ${sent}`);
}

// Раз в 10 минут смотрим на часы; в нужный час запускаем проверку один раз за день
export function scheduleAlerts(bot) {
  let lastRun = null;
  const tick = () => {
    const now = bishkekNow();
    if (now.getUTCHours() === HOUR && lastRun !== isoDay(now)) {
      lastRun = isoDay(now);
      runAlerts(bot).catch(e => console.error('[alerts]', e));
    }
  };
  setInterval(tick, 10 * 60e3);
  tick();
}

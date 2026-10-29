/**
 * Тексты бота на русском и кыргызском. Сообщения — в HTML-разметке Telegram.
 */
import { CROPS } from './crops.js';
import { doyToDM } from './agro.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = (v, d = 0) => {
  const s = v.toFixed(d);
  return (Number(s) === 0 ? (0).toFixed(d) : s).replace('.', ',').replace('-', '−');
};
const fmtT = v => fmt(v, Math.abs(v) < 1 ? 1 : 0);
const pluralRu = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const T = {
  ru: {
    chooseLang: 'Тилди тандаңыз / Выберите язык:',
    hello: '👋 Здравствуйте! Я <b>AgroPulse</b> — подсказываю фермеру по данным спутников NASA:\n\n📍 подходит ли место для культуры,\n🌱 когда сеять,\n❄️ когда беречь посевы от заморозка, жары и засухи.\n\nОтправьте <b>геолокацию поля</b> кнопкой ниже или напишите <b>название села</b>.',
    sendPlace: 'Отправьте геолокацию 📍 или напишите название села.',
    btnLocation: '📍 Отправить геолокацию',
    searching: '🔎 Ищу место и собираю данные NASA…',
    notFound: 'Не нашёл такое место. Попробуйте написать по-другому, например «Кемин» или «Ивановка, Чуй». Или отправьте геолокацию 📍',
    error: 'Не получилось получить данные — сервис NASA или погоды не ответил. Попробуйте через минуту: нажмите «🔄 Обновить».',
    chooseCrop: 'Что хотите посадить в <b>{place}</b>?\nРядом — насколько культура подходит этому месту.',
    groups: { grain: 'Зерновые', industrial: 'Технические', veg: 'Овощи и бобовые', garden: 'Сады и ягоды' },
    suit: { good: 'подходит', mid: 'можно, с условиями', bad: 'не подходит' },
    reason: {
      Ok: 'тепла хватает, рельеф ровный',
      Cold: 'прохладно: высота {elev} м, средняя температура года {t} °C',
      ColdBad: 'слишком холодно: высота {elev} м, средняя температура года {t} °C',
      Hot: 'тепловато — культура любит прохладу',
      HotBad: 'слишком жарко для этой культуры',
      Steep: 'склон {slope}° — технике тяжело, почву смывает',
      SteepBad: 'слишком крутой склон {slope}°',
      Dry: 'дождей мало ({rain} мм в год) — нужен полив'
    },
    head: '🌾 <b>{place}</b> · {crop}',
    lineSuit: '📍 Место: <b>{label}</b> ({pct} %) — {reason}',
    lineSow: '🌱 Сеять: <b>{from} — {to}</b>',
    linePlant: '🌳 Сажать саженцы: <b>{from} — {to}</b>',
    lineSowYear: ' ({year})',
    lineSowCold: '🌱 Сеять: для этой культуры здесь слишком холодно',
    linePlantCold: '🌳 Сажать: для этой культуры здесь слишком холодно',
    lineShift: '   За 40 лет сезон начинается на {n} {days} {dir}.',
    earlier: 'раньше', later: 'позже',
    risk: {
      frost: '❄️ {day} заморозок до <b>{t} °C</b> — {advice}',
      frostSpring: 'отложите посев и укройте всходы',
      frostAutumn: 'уберите урожай или укройте теплолюбивые культуры',
      heat: '🔥 {day} жара до <b>+{t} °C</b> — поливайте рано утром или вечером',
      drought: '🌵 {n} {days} без дождя, почва суше обычного — риск засухи'
    },
    noRisk: '👍 Опасной погоды в ближайшие дни нет',
    water: {
      offSeason: '💧 Полив: сейчас не сезон',
      waitRain: '💧 Полив: подождите — в ближайшие 3 дня до {rain} мм дождя',
      unknown: '💧 Полив: свежих данных о почве пока нет',
      water: '💧 Полив: <b>нужен в ближайшие 1–2 дня</b> — почва суше, чем обычно в это время',
      soon: '💧 Полив: через 2–3 дня, если не будет дождя',
      ok: '💧 Полив: не нужен — влаги в почве как обычно или больше'
    },
    soilNote: '   Влажность почвы по NASA POWER на {date}: {state}.',
    soilState: { dry: 'суше обычного для этого времени года', normal: 'как обычно', wet: 'влажнее обычного' },
    alsoGood: '🌾 Ещё подойдут: {list}',
    sources: '<i>🛰 Климат 1985–{y1} и влажность почвы — NASA POWER, прогноз — Open-Meteo, рельеф — {elev} м.</i>',
    btnPlace: '📍 Другое место', btnCrop: '🌱 Другая культура', btnRefresh: '🔄 Обновить',
    btnAlertsOn: '🔔 Предупреждения: вкл', btnAlertsOff: '🔕 Предупреждения: выкл',
    alertsOn: '🔔 Предупреждения включены. Напишу сюда, только когда это важно: перед сроком сева, перед заморозком, жарой или засухой. Каждое утро в 7:00 проверяю прогноз.',
    alertsOff: '🔕 Предупреждения выключены. Совет всегда можно получить кнопкой «🔄 Обновить».',
    needPlace: 'Сначала отправьте место: геолокацию 📍 или название села.',
    checkNone: '✅ Проверил прогноз для <b>{place}</b>: сейчас предупреждать не о чем.',
    alertHead: '⚠️ <b>AgroPulse · {place}</b>',
    sowSoon: '🌱 Через {n} {days} начинается окно {what} «{crop}»: <b>{from} — {to}</b>.',
    sowWhat: 'сева', plantWhat: 'посадки',
    help: 'Как пользоваться:\n• отправьте геолокацию 📍 или название села;\n• выберите культуру;\n• получите совет и включите предупреждения 🔔.\n\nКоманды:\n/start — начать заново\n/crop — выбрать культуру\n/check — проверить погоду прямо сейчас\n/alerts — включить или выключить предупреждения\n/lang — сменить язык',
    weekIn: ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'],
    today: 'сегодня', tomorrow: 'завтра',
    days: n => pluralRu(n, 'день', 'дня', 'дней')
  },
  ky: {
    chooseLang: 'Тилди тандаңыз / Выберите язык:',
    hello: '👋 Саламатсызбы! Мен <b>AgroPulse</b> — NASA спутниктеринин маалыматы боюнча дыйканга кеңеш берем:\n\n📍 жер өсүмдүккө ылайыктуубу,\n🌱 качан себүү керек,\n❄️ эгинди үшүктөн, ысыктан жана кургакчылыктан качан сактоо керек.\n\nТөмөнкү баскыч менен <b>талаанын геолокациясын</b> жөнөтүңүз же <b>айылдын атын</b> жазыңыз.',
    sendPlace: 'Геолокацияны 📍 жөнөтүңүз же айылдын атын жазыңыз.',
    btnLocation: '📍 Геолокацияны жөнөтүү',
    searching: '🔎 Жерди издеп, NASA маалыматтарын чогултуп жатам…',
    notFound: 'Мындай жер табылган жок. Башкача жазып көрүңүз, мисалы «Кемин» же «Ивановка, Чүй». Же геолокацияны жөнөтүңүз 📍',
    error: 'Маалымат алынган жок — NASA же аба ырайы кызматы жооп берген жок. Бир мүнөттөн кийин «🔄 Жаңыртуу» баскычын басыңыз.',
    chooseCrop: '<b>{place}</b> жерине эмне отургузгуңуз келет?\nЖанында — өсүмдүк бул жерге канчалык ылайыктуу экени.',
    groups: { grain: 'Дан эгиндери', industrial: 'Техникалык', veg: 'Жашылча жана буурчак', garden: 'Бактар жана мөмөлөр' },
    suit: { good: 'ылайыктуу', mid: 'шарттар менен болот', bad: 'ылайыксыз' },
    reason: {
      Ok: 'жылуулук жетиштүү, жер түз',
      Cold: 'салкыныраак: бийиктиги {elev} м, жылдык орточо температура {t} °C',
      ColdBad: 'өтө суук: бийиктиги {elev} м, жылдык орточо температура {t} °C',
      Hot: 'жылуураак — бул өсүмдүк салкынды жакшы көрөт',
      HotBad: 'бул өсүмдүк үчүн өтө ысык',
      Steep: 'эңкейиш {slope}° — техника кыйналат, топурак жуулат',
      SteepBad: 'өтө тик эңкейиш {slope}°',
      Dry: 'жаан аз (жылына {rain} мм) — сугаруу керек'
    },
    head: '🌾 <b>{place}</b> · {crop}',
    lineSuit: '📍 Жер: <b>{label}</b> ({pct} %) — {reason}',
    lineSow: '🌱 Себүү: <b>{from} — {to}</b>',
    linePlant: '🌳 Көчөт отургузуу: <b>{from} — {to}</b>',
    lineSowYear: ' ({year})',
    lineSowCold: '🌱 Себүү: бул өсүмдүк үчүн бул жер өтө суук',
    linePlantCold: '🌳 Отургузуу: бул өсүмдүк үчүн бул жер өтө суук',
    lineShift: '   40 жылда сезон {n} {days} {dir} башталып калды.',
    earlier: 'эрте', later: 'кеч',
    risk: {
      frost: '❄️ {day} <b>{t} °C</b> чейин үшүк — {advice}',
      frostSpring: 'себүүнү кийинкиге калтырып, өнүмдөрдү жабыңыз',
      frostAutumn: 'түшүмдү жыйнаңыз же жылуулукту сүйгөн өсүмдүктөрдү жабыңыз',
      heat: '🔥 {day} <b>+{t} °C</b> чейин ысык — эртең менен эрте же кечинде сугарыңыз',
      drought: '🌵 {n} {days} жаансыз, топурак адаттагыдан кургак — кургакчылык коркунучу'
    },
    noRisk: '👍 Жакынкы күндөрү коркунучтуу аба ырайы жок',
    water: {
      offSeason: '💧 Сугаруу: азыр мезгил эмес',
      waitRain: '💧 Сугаруу: күтө туруңуз — жакынкы 3 күндө {rain} мм чейин жаан',
      unknown: '💧 Сугаруу: топурак боюнча жаңы маалымат азырынча жок',
      water: '💧 Сугаруу: <b>жакынкы 1–2 күндө керек</b> — топурак бул мезгилдегиден кургак',
      soon: '💧 Сугаруу: жаан болбосо, 2–3 күндөн кийин',
      ok: '💧 Сугаруу: кереги жок — топуракта нымдуулук адаттагыдай же көбүрөөк'
    },
    soilNote: '   NASA POWER боюнча топурактын нымдуулугу {date}: {state}.',
    soilState: { dry: 'жылдын бул мезгилиндегиден кургак', normal: 'адаттагыдай', wet: 'адаттагыдан нымдуу' },
    alsoGood: '🌾 Дагы ылайыктуу: {list}',
    sources: '<i>🛰 Климат 1985–{y1} жана топурактын нымдуулугу — NASA POWER, болжол — Open-Meteo, рельеф — {elev} м.</i>',
    btnPlace: '📍 Башка жер', btnCrop: '🌱 Башка өсүмдүк', btnRefresh: '🔄 Жаңыртуу',
    btnAlertsOn: '🔔 Эскертүүлөр: күйүк', btnAlertsOff: '🔕 Эскертүүлөр: өчүк',
    alertsOn: '🔔 Эскертүүлөр күйгүзүлдү. Маанилүү болгондо гана жазам: себүү мөөнөтүнүн, үшүктүн, ысыктын же кургакчылыктын алдында. Ар күнү эртең мененки 7:00дө болжолду текшерем.',
    alertsOff: '🔕 Эскертүүлөр өчүрүлдү. Кеңешти «🔄 Жаңыртуу» баскычы менен ар дайым ала аласыз.',
    needPlace: 'Адегенде жерди жөнөтүңүз: геолокацияны 📍 же айылдын атын.',
    checkNone: '✅ <b>{place}</b> үчүн болжолду текшердим: азыр эскертүүгө эч нерсе жок.',
    alertHead: '⚠️ <b>AgroPulse · {place}</b>',
    sowSoon: '🌱 {n} {days} кийин «{crop}» {what} мөөнөтү башталат: <b>{from} — {to}</b>.',
    sowWhat: 'себүү', plantWhat: 'отургузуу',
    help: 'Кантип колдонуу керек:\n• геолокацияны 📍 же айылдын атын жөнөтүңүз;\n• өсүмдүктү тандаңыз;\n• кеңеш алып, эскертүүлөрдү күйгүзүңүз 🔔.\n\nБуйруктар:\n/start — кайра баштоо\n/crop — өсүмдүк тандоо\n/check — аба ырайын азыр текшерүү\n/alerts — эскертүүлөрдү күйгүзүү же өчүрүү\n/lang — тилди алмаштыруу',
    weekIn: ['дүйшөмбү күнү', 'шейшемби күнү', 'шаршемби күнү', 'бейшемби күнү', 'жума күнү', 'ишемби күнү', 'жекшемби күнү'],
    today: 'бүгүн', tomorrow: 'эртең',
    days: () => 'күн'
  }
};

export function t(lang, key, params) {
  let s = key.split('.').reduce((o, k) => o?.[k], T[lang]) ?? key.split('.').reduce((o, k) => o?.[k], T.ru) ?? key;
  if (params && typeof s === 'string') for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(v);
  return s;
}
export const texts = lang => T[lang] || T.ru;
export const cropName = (id, lang) => CROPS[id].name[lang] || CROPS[id].name.ru;

// «завтра», «в четверг» — день из прогноза относительно сегодняшнего дня по Бишкеку
function dayWord(lang, iso, todayIso) {
  const diff = Math.round((Date.parse(iso) - Date.parse(todayIso)) / 864e5);
  if (diff <= 0) return t(lang, 'today');
  if (diff === 1) return t(lang, 'tomorrow');
  return texts(lang).weekIn[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7];
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function riskLine(lang, r, todayIso) {
  const L = texts(lang);
  if (r.type === 'frost') return t(lang, 'risk.frost', { day: cap(dayWord(lang, r.date, todayIso)), t: fmtT(r.t), advice: t(lang, r.autumn ? 'risk.frostAutumn' : 'risk.frostSpring') });
  if (r.type === 'heat') return t(lang, 'risk.heat', { day: cap(dayWord(lang, r.date, todayIso)), t: fmtT(r.t) });
  return t(lang, 'risk.drought', { n: r.n, days: L.days(r.n) });
}

// Карточка совета — то же сообщение, что в макете на сайте
export function card(lang, a) {
  const L = texts(lang);
  const place = esc(a.place.name);
  const crop = cropName(a.cropId, lang);
  const perennial = CROPS[a.cropId].perennial;
  const todayIso = a.days[0]?.date;
  const lines = [t(lang, 'head', { place, crop }), ''];

  lines.push(t(lang, 'lineSuit', {
    label: L.suit[a.suit.cls], pct: Math.round(a.suit.score * 100),
    reason: t(lang, 'reason.' + a.suit.reason, { elev: Math.round(a.env.elev), t: fmt(a.env.tmean, 1), slope: fmt(a.env.slope), rain: Math.round(a.env.rain) })
  }));

  const s = a.sow;
  if (s.tooCold) lines.push(t(lang, perennial ? 'linePlantCold' : 'lineSowCold'));
  else {
    const nextYear = s.year !== new Date().getUTCFullYear();
    lines.push(t(lang, perennial ? 'linePlant' : 'lineSow', { from: doyToDM(s.from), to: doyToDM(s.to) }) + (nextYear ? t(lang, 'lineSowYear', { year: s.year }) : ''));
    const n = Math.abs(s.shift);
    if (n >= 2) lines.push(t(lang, 'lineShift', { n, days: L.days(n), dir: s.shift > 0 ? L.earlier : L.later }));
  }

  lines.push(...(a.risks.length ? a.risks.map(r => riskLine(lang, r, todayIso)) : [t(lang, 'noRisk')]));
  lines.push(t(lang, 'water.' + a.water.key, { rain: a.water.rain != null ? fmt(a.water.rain, 1) : '' }));
  if (a.soil && a.water.key !== 'offSeason') {
    const st = a.soil.pct <= 25 ? 'dry' : a.soil.pct >= 75 ? 'wet' : 'normal';
    lines.push(t(lang, 'soilNote', { date: a.soil.date, state: L.soilState[st] }));
  }

  const alt = a.best.filter(b => b.id !== a.cropId && b.s.cls === 'good').slice(0, 3).map(b => cropName(b.id, lang).toLowerCase());
  if (alt.length) lines.push(t(lang, 'alsoGood', { list: alt.join(', ') }));
  lines.push('', t(lang, 'sources', { y1: a.climateYears[1], elev: Math.round(a.env.elev) }));
  return lines.join('\n');
}

// Сообщение-предупреждение: только то, что требует действия
export function alertText(lang, a, items) {
  const L = texts(lang);
  const todayIso = a.days[0]?.date;
  const lines = [t(lang, 'alertHead', { place: esc(a.place.name) })];
  for (const it of items) {
    if (it.type === 'sowSoon') {
      const perennial = CROPS[a.cropId].perennial;
      lines.push(t(lang, 'sowSoon', {
        n: it.n, days: L.days(it.n), crop: cropName(a.cropId, lang), what: t(lang, perennial ? 'plantWhat' : 'sowWhat'),
        from: doyToDM(a.sow.from), to: doyToDM(a.sow.to)
      }));
    } else lines.push(riskLine(lang, it, todayIso));
  }
  return lines.join('\n');
}

export { esc };

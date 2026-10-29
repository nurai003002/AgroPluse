/**
 * Telegram-бот AgroPulse.
 * Фермер отправляет геолокацию или название села, выбирает культуру — и получает совет
 * по настоящим данным NASA POWER и прогнозу погоды. По желанию — утренние предупреждения.
 */
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { CROPS, GROUPS, GROUP_ICON } from './crops.js';
import { analyze } from './agro.js';
import { geocode, reverseName } from './sources.js';
import { t, card, alertText, cropName, esc } from './texts.js';
import { getUser, save } from './store.js';
import { alertItems, scheduleAlerts } from './alerts.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Нет BOT_TOKEN. Создайте бота у @BotFather и положите токен в bot/.env (см. .env.example).');
  process.exit(1);
}
const bot = new Bot(token);

/* ---------- Клавиатуры ---------- */
const langKeyboard = () => new InlineKeyboard().text('🇰🇬 Кыргызча', 'lang:ky').text('🇷🇺 Русский', 'lang:ru');
const locationKeyboard = lang => new Keyboard().requestLocation(t(lang, 'btnLocation')).resized().persistent();

function cardKeyboard(user) {
  const L = user.lang;
  return new InlineKeyboard()
    .text(t(L, 'btnPlace'), 'menu:place').text(t(L, 'btnCrop'), 'menu:crop').row()
    .text(t(L, user.alerts ? 'btnAlertsOn' : 'btnAlertsOff'), 'alerts').text(t(L, 'btnRefresh'), 'refresh');
}

// Культуры по группам, рядом — насколько подходит место (лучшие — первыми в своей группе)
function cropKeyboard(lang, best) {
  const score = Object.fromEntries(best.map(b => [b.id, b.s]));
  const kb = new InlineKeyboard();
  for (const g of GROUPS) {
    const ids = Object.keys(CROPS).filter(id => CROPS[id].group === g)
      .sort((a, b) => (score[b]?.score ?? 0) - (score[a]?.score ?? 0));
    ids.forEach((id, i) => {
      const s = score[id];
      const mark = !s ? '⚪' : s.cls === 'good' ? '🟢' : s.cls === 'mid' ? '🟡' : '🔴';
      kb.text(`${GROUP_ICON[g]} ${cropName(id, lang)} ${mark} ${Math.round((s?.score ?? 0) * 100)}%`, 'crop:' + id);
      if (i % 2 === 1) kb.row();
    });
    kb.row();
  }
  return kb;
}

/* ---------- Сценарии ---------- */
async function sendCard(ctx, user, { edit = false } = {}) {
  await ctx.replyWithChatAction('typing');
  let a;
  try { a = await analyze(user.place, user.crop); }
  catch (e) { console.error('analyze:', e.message); return ctx.reply(t(user.lang, 'error'), { reply_markup: cardKeyboard(user) }); }
  const opts = { parse_mode: 'HTML', reply_markup: cardKeyboard(user), link_preview_options: { is_disabled: true } };
  if (edit) {
    try { return await ctx.editMessageText(card(user.lang, a), opts); }
    catch { /* сообщение не изменилось или устарело — пришлём новое */ }
  }
  return ctx.reply(card(user.lang, a), opts);
}

async function sendCropMenu(ctx, user) {
  await ctx.replyWithChatAction('typing');
  let best = [];
  try { best = (await analyze(user.place, user.crop || 'wheat')).best; }
  catch (e) { console.error('analyze:', e.message); }
  return ctx.reply(t(user.lang, 'chooseCrop', { place: esc(user.place.name) }), {
    parse_mode: 'HTML', reply_markup: cropKeyboard(user.lang, best)
  });
}

async function setPlace(ctx, user, place) {
  user.place = place;
  await save();
  if (!user.crop) return sendCropMenu(ctx, user);
  return sendCard(ctx, user);
}

async function askPlace(ctx, user) {
  return ctx.reply(t(user.lang, 'sendPlace'), { reply_markup: locationKeyboard(user.lang) });
}

/* ---------- Команды ---------- */
bot.command(['start', 'lang'], async ctx => {
  await ctx.reply(t('ru', 'chooseLang'), { reply_markup: langKeyboard() });
});

bot.callbackQuery(/^lang:(ru|ky)$/, async ctx => {
  const user = await getUser(ctx.chat.id);
  user.lang = ctx.match[1];
  await save();
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup().catch(() => {});
  if (user.place && user.crop) return sendCard(ctx, user);
  return ctx.reply(t(user.lang, 'hello'), { parse_mode: 'HTML', reply_markup: locationKeyboard(user.lang) });
});

bot.command('help', async ctx => {
  const user = await getUser(ctx.chat.id);
  return ctx.reply(t(user.lang || 'ru', 'help'));
});

bot.command('crop', async ctx => {
  const user = await getUser(ctx.chat.id);
  user.lang ||= 'ru';
  if (!user.place) return ctx.reply(t(user.lang, 'needPlace'), { reply_markup: locationKeyboard(user.lang) });
  return sendCropMenu(ctx, user);
});

bot.command('alerts', async ctx => {
  const user = await getUser(ctx.chat.id);
  user.lang ||= 'ru';
  user.alerts = !user.alerts;
  await save();
  return ctx.reply(t(user.lang, user.alerts ? 'alertsOn' : 'alertsOff'));
});

// Проверить предупреждения прямо сейчас — удобно для показа на демо
bot.command('check', async ctx => {
  const user = await getUser(ctx.chat.id);
  user.lang ||= 'ru';
  if (!user.place || !user.crop) return ctx.reply(t(user.lang, 'needPlace'), { reply_markup: locationKeyboard(user.lang) });
  await ctx.replyWithChatAction('typing');
  try {
    const a = await analyze(user.place, user.crop);
    const items = alertItems(a);
    const text = items.length ? alertText(user.lang, a, items) : t(user.lang, 'checkNone', { place: esc(user.place.name) });
    return ctx.reply(text, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('check:', e.message);
    return ctx.reply(t(user.lang, 'error'));
  }
});

/* ---------- Место: геолокация или название ---------- */
bot.on('message:location', async ctx => {
  const user = await getUser(ctx.chat.id);
  user.lang ||= 'ru';
  const { latitude: lat, longitude: lon } = ctx.message.location;
  await ctx.reply(t(user.lang, 'searching'));
  const name = (await reverseName(lat, lon, user.lang)) || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  return setPlace(ctx, user, { lat, lon, name });
});

bot.on('message:text', async ctx => {
  if (ctx.message.text.startsWith('/')) return;
  const user = await getUser(ctx.chat.id);
  user.lang ||= 'ru';
  await ctx.reply(t(user.lang, 'searching'));
  let found = null;
  try { found = await geocode(ctx.message.text.trim(), user.lang); } catch (e) { console.error('geocode:', e.message); }
  if (!found) return ctx.reply(t(user.lang, 'notFound'), { reply_markup: locationKeyboard(user.lang) });
  return setPlace(ctx, user, { lat: found.lat, lon: found.lon, name: found.name });
});

/* ---------- Кнопки под советом ---------- */
bot.callbackQuery(/^crop:(\w+)$/, async ctx => {
  const user = await getUser(ctx.chat.id);
  if (!CROPS[ctx.match[1]]) return ctx.answerCallbackQuery();
  user.lang ||= 'ru';
  user.crop = ctx.match[1];
  await save();
  await ctx.answerCallbackQuery(cropName(user.crop, user.lang));
  if (!user.place) return askPlace(ctx, user);
  return sendCard(ctx, user, { edit: true });
});

bot.callbackQuery('menu:place', async ctx => {
  const user = await getUser(ctx.chat.id);
  await ctx.answerCallbackQuery();
  return askPlace(ctx, user);
});

bot.callbackQuery('menu:crop', async ctx => {
  const user = await getUser(ctx.chat.id);
  await ctx.answerCallbackQuery();
  if (!user.place) return askPlace(ctx, user);
  return sendCropMenu(ctx, user);
});

bot.callbackQuery('alerts', async ctx => {
  const user = await getUser(ctx.chat.id);
  user.alerts = !user.alerts;
  await save();
  await ctx.answerCallbackQuery(t(user.lang, user.alerts ? 'btnAlertsOn' : 'btnAlertsOff'));
  await ctx.editMessageReplyMarkup({ reply_markup: cardKeyboard(user) }).catch(() => {});
  return ctx.reply(t(user.lang, user.alerts ? 'alertsOn' : 'alertsOff'));
});

bot.callbackQuery('refresh', async ctx => {
  const user = await getUser(ctx.chat.id);
  await ctx.answerCallbackQuery();
  if (!user.place || !user.crop) return askPlace(ctx, user);
  return sendCard(ctx, user, { edit: true });
});

bot.catch(err => console.error('Ошибка бота:', err.error?.message || err));

/* ---------- Запуск ---------- */
const commands = lang => [
  ['start', lang === 'ky' ? 'Кайра баштоо' : 'Начать заново'],
  ['crop', lang === 'ky' ? 'Өсүмдүк тандоо' : 'Выбрать культуру'],
  ['check', lang === 'ky' ? 'Аба ырайын азыр текшерүү' : 'Проверить погоду сейчас'],
  ['alerts', lang === 'ky' ? 'Эскертүүлөр күйүк/өчүк' : 'Предупреждения вкл/выкл'],
  ['lang', lang === 'ky' ? 'Тилди алмаштыруу' : 'Сменить язык'],
  ['help', lang === 'ky' ? 'Жардам' : 'Помощь']
].map(([command, description]) => ({ command, description }));

await bot.api.setMyCommands(commands('ru'));
await bot.api.setMyCommands(commands('ky'), { language_code: 'ky' });
scheduleAlerts(bot);

// docker stop / перезапуск: дожидаемся сохранения базы и отпускаем long polling
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, async () => {
  console.log(`Получен ${sig}, останавливаюсь…`);
  await save();
  await bot.stop();
  process.exit(0);
});

bot.start({ onStart: me => console.log(`AgroPulse-бот запущен: @${me.username}`) });

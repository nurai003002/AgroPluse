# Выкладка AgroPulse на сервер

На сервере нужны **git** и **Docker с Compose v2** (`docker compose version`).

## Первый запуск

```bash
git clone https://github.com/nurai003002/AgroPluse.git
cd AgroPluse

# Токен бота от @BotFather — только в этом файле, в git он не попадает
cp bot/.env.example bot/.env
nano bot/.env            # BOT_TOKEN=...

docker compose up -d --build
docker compose ps        # web — healthy, bot — running
docker compose logs -f bot   # должно быть «AgroPulse-бот запущен: @my_agro_Pluse_bot»
```

> ⚠️ Бот с одним токеном может работать **только в одном месте**. Перед запуском на сервере
> остановите бота на ноутбуке, иначе Telegram выдаст `409 Conflict`.

Сайт откроется на `http://<сервер>:8080`. Другой порт: `WEB_PORT=8090 docker compose up -d`
(или строка `WEB_PORT=8090` в файле `.env` рядом с `docker-compose.yml`).

## Обновление

```bash
cd AgroPluse
git pull
docker compose up -d --build
```

База пользователей бота и кэш данных NASA лежат в томе `agropulse_bot-data` и переживают обновления.

## Домен и HTTPS

Если на сервере уже есть nginx, добавьте сайт (`/etc/nginx/sites-available/agropulse`):

```nginx
server {
    server_name agropulse.example.kg;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/agropulse /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d agropulse.example.kg   # бесплатный сертификат Let's Encrypt
```

HTTPS нужен, чтобы на сайте работала кнопка «Где я» — браузеры дают геолокацию только по https.

## Полезное

```bash
docker compose logs --tail 100 bot     # что делает бот
docker compose restart bot             # перезапустить бота
docker compose down                    # остановить всё (данные бота сохранятся)
```

Бот не открывает портов и работает через long polling — домен и HTTPS ему не нужны.
Предупреждения рассылаются в 7:00 по Бишкеку (`ALERT_HOUR` в `bot/.env`).

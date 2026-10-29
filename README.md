# AgroPulse

Прототип для хакатона: спутник NASA подсказывает фермеру, где и когда сеять и когда беречь посевы. Советы приходят в Telegram или SMS на кыргызском и русском.

Весь сайт — один файл `index.html` (HTML + CSS + JS, без сборки и бэкенда). Библиотеки подключаются с CDN: Leaflet (карта) и Chart.js (график).

## Запуск

Локально — открыть `index.html` в браузере или:

```bash
python3 -m http.server 8080
```

На сервере — отдать `index.html` любым веб-сервером (nginx, Caddy, GitHub Pages).

## Данные

- Настоящие: карта (OpenStreetMap / CARTO), спутниковая подложка (Esri World Imagery), рельеф (AWS Terrain Tiles на основе NASA SRTM), поиск сёл (Nominatim).
- Демо: значения SMAP, MODIS/Landsat и NASA POWER подготовлены заранее в формате NASA API, прогноз погоды — тоже демо.

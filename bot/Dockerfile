FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data

# Сначала зависимости — слой кэшируется, пока package*.json не меняются
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Данные (пользователи и кэш NASA) — в томе, чтобы переживали пересборку
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data
USER node

CMD ["node", "src/index.js"]

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3000

COPY package.json server.js ./

# База пользователей — в томе, чтобы переживала пересборку
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]

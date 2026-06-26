FROM node:20-alpine AS base
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM base AS app
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

ENV NODE_ENV=production
CMD ["node", "src/app.js"]

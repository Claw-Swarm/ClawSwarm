# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql

# Data volume mount point
RUN mkdir -p /data
ENV DB_PATH=/data/clawswarm.db
ENV NODE_ENV=production

EXPOSE 3000

# Non-root user
RUN addgroup -S clawswarm && adduser -S clawswarm -G clawswarm
RUN chown -R clawswarm:clawswarm /app /data
USER clawswarm

CMD ["node", "dist/index.js"]

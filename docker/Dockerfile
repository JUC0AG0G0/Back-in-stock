# syntax=docker/dockerfile:1

# ---- build: install everything, compile server and web UI ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# Dependencies first, so this layer stays cached while only source code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @back-in-stock/server --filter @back-in-stock/web run build

# Production-only copy of the server and its dependencies (no dev tools, no TS sources).
RUN pnpm --filter @back-in-stock/server deploy --prod --legacy /out/server

# Files copied from the host keep their permissions (e.g. 600 with a strict umask),
# which the non-root runtime user could not read. Make everything world-readable.
RUN chmod -R a+rX /repo/package.json /repo/apps/web/dist /out

# ---- runtime: small image that only runs the app ----
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    BIS_DATA_DIR=/data

# Same layout as the repo, so relative paths (version, web UI) work unchanged.
WORKDIR /app
COPY --from=build /repo/package.json ./package.json
COPY --from=build /out/server ./apps/server
COPY --from=build /repo/apps/web/dist ./apps/web/dist

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

# Node is PID 1: the server handles SIGTERM itself for a clean shutdown.
CMD ["node", "apps/server/dist/main.js"]

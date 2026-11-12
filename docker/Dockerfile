# syntax=docker/dockerfile:1

# ---- build: install everything, compile server and web UI ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# Dependencies first, so this layer stays cached while only source code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
COPY packages/i18n/package.json packages/i18n/
COPY plugins/notifier-telegram/package.json plugins/notifier-telegram/
COPY plugins/source-fanatec/package.json plugins/source-fanatec/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
# "server..." also builds the workspace packages the server depends on (SDK, built-in plugins).
RUN pnpm --filter "@back-in-stock/server..." --filter @back-in-stock/web run build

# Production-only copy of the server and its dependencies (no dev tools, no TS sources).
RUN pnpm --filter @back-in-stock/server deploy --prod --legacy /out/server

# better-sqlite3 ships its C sources and binaries for every OS: keep only the Alpine (musl) ones.
RUN find /out/server/node_modules/.pnpm -path '*/node_modules/better-sqlite3' -type d \
      -exec sh -c 'cd "$1" && rm -rf deps src && find prebuilds -type f ! -name "linuxmusl-*" -delete' _ {} \;

# Files copied from the host keep their permissions (e.g. 600 with a strict umask),
# which the non-root runtime user could not read. Make everything world-readable.
RUN chmod -R a+rX /repo/package.json /repo/apps/web/dist /out

# ---- runtime: small image that only runs the app ----
FROM node:22-alpine AS runtime

# Set by the publish workflow. "release" turns on the new version banner (SPEC §7quater);
# edge and local builds ("dev") never look for updates. BIS_VERSION lets the updater
# check which version an image holds before switching to it.
ARG BIS_BUILD_CHANNEL=dev
ARG BIS_VERSION=dev

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    BIS_DATA_DIR=/data \
    BIS_BUILD_CHANNEL=$BIS_BUILD_CHANNEL \
    BIS_VERSION=$BIS_VERSION

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

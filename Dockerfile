# syntax=docker/dockerfile:1

# Single production image: the NestJS backend also serves the built React SPA,
# so the whole app answers on one port.
ARG NODE_VERSION=22.16.0
ARG PNPM_VERSION=10.15.1

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
RUN npm install --global pnpm@${PNPM_VERSION} \
 && npm cache clean --force
WORKDIR /app

# Manifests first so dependency layers survive source-only changes.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/api-client/package.json packages/api-client/
COPY typespec/package.json typespec/

# Full workspace install + generated SDK + both production builds.
FROM manifests AS build
# Empty base URL keeps API calls same-origin (`/meeting-types`, ...) in the image.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm generate:api \
 && pnpm build:backend \
 && pnpm build:frontend

# Only what the backend needs at runtime; dev dependencies stay out of the image.
FROM manifests AS prod-deps
RUN pnpm install --prod --frozen-lockfile --filter backend

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# PORT comes from the platform (Render sets it, Compose passes it explicitly);
# the app falls back to 3000 when it is absent. SQLite lives on the mounted
# volume, never inside the image layer.
ENV NODE_ENV=production \
    DATABASE_URL=file:/data/app.db

WORKDIR /app
COPY --from=prod-deps --chown=node:node /app ./
COPY --from=build --chown=node:node /app/apps/backend/dist apps/backend/dist
COPY --from=build --chown=node:node /app/apps/backend/prisma apps/backend/prisma
COPY --from=build --chown=node:node /app/apps/frontend/dist apps/frontend/dist

# Named volumes inherit ownership from the image path; PaaS disks may not, so
# the entrypoint re-applies it before dropping to the `node` user.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data && chown node:node /data

# The entrypoint starts as root only to fix $(DATA_DIR) ownership, then execs
# the CMD as `node` via setpriv.
WORKDIR /app/apps/backend
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]

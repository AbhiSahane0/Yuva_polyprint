# syntax=docker/dockerfile:1

# Puppeteer's bundled Chromium is linked against glibc and will not run on
# Alpine's musl. Rather than switch the whole image to Debian, we install
# Alpine's own Chromium build and point Puppeteer at it — a much smaller image
# than a Debian base with the same result.
ARG PUPPETEER_SKIP_DOWNLOAD=true

# ---- deps ------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /repo
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# --ignore-scripts: the API's postinstall runs `prisma generate`, and the schema
# is not copied yet at this layer. The build stage generates it explicitly once
# the schema is present.
RUN npm ci --ignore-scripts --workspace @yuva/api --workspace @yuva/shared --include-workspace-root

# ---- build -----------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @yuva/shared \
 && npx --workspace @yuva/api prisma generate \
 && npm run build --workspace @yuva/api

# ---- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# Chromium and the fonts the quotation PDF needs. Without the font packages
# every glyph renders as a box; nss/freetype are Chromium's own requirements.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ttf-freefont \
      font-noto \
 && rm -rf /var/cache/apk/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# Same reason, plus the generated client is copied in from the build stage.
RUN npm ci --omit=dev --ignore-scripts --workspace @yuva/api --workspace @yuva/shared --include-workspace-root \
 && npm cache clean --force
# Do not try to slim node_modules by deleting the prisma CLI's Studio/dev
# packages (react-dom, elkjs, effect, @electric-sql). The CLI loads `effect`
# during startup and `migrate deploy` fails with "Cannot find module 'effect'".

# `prisma migrate deploy` (below) needs the schema engine binary. npm ci ran
# with --ignore-scripts, so @prisma/engines never downloaded it, and at boot the
# CLI cannot fetch it into a root-owned node_modules as USER node. The build
# stage already has the right one for this platform — take that.
COPY --from=build /repo/node_modules/@prisma/engines/schema-engine-* node_modules/@prisma/engines/

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/src/generated apps/api/src/generated
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/apps/api/prisma.config.ts apps/api/
COPY apps/api/assets apps/api/assets

USER node
EXPOSE 4000

# Migrations run on boot so a deploy never serves against an older schema.
# `migrate deploy` only applies pending migrations and never resets.
CMD ["sh", "-c", "npx --workspace @yuva/api prisma migrate deploy && node apps/api/dist/server.js"]

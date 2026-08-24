# syntax=docker/dockerfile:1

# ---- deps ------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @yuva/api --workspace @yuva/shared --include-workspace-root

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

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @yuva/api --workspace @yuva/shared --include-workspace-root \
 && npm cache clean --force

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/src/generated apps/api/src/generated
COPY --from=build /repo/apps/api/prisma apps/api/prisma

USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

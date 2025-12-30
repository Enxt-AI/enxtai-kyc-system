# ---------- base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat \
 && corepack enable pnpm
WORKDIR /app


# ---------- deps ----------
FROM base AS deps
WORKDIR /app

# copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# install ALL deps (dev included)
RUN pnpm install --frozen-lockfile


# ---------- builder ----------
FROM base AS builder
WORKDIR /app

# copy full repo
COPY . .

# reuse pnpm store for speed
COPY --from=deps /root/.local/share/pnpm /root/.local/share/pnpm

# ⬇️ THIS is the critical line
RUN pnpm install --filter @enxtai/api... --frozen-lockfile

# prisma CLI now exists ✔
RUN pnpm --filter @enxtai/api exec prisma generate

# build API
RUN pnpm --filter @enxtai/api exec nest build


# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nestjs

# install only prod deps for api
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN corepack enable pnpm && pnpm install --filter @enxtai/api... --prod --frozen-lockfile

# copy build
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

USER nestjs
EXPOSE 3001
CMD ["node", "dist/main"]

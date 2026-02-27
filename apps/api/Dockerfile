# ---------- base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache \
	libc6-compat \
	python3 \
	make \
	g++ \
	cairo-dev \
	jpeg-dev \
	pango-dev \
	giflib-dev \
	pixman-dev \
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

# ensure face-api models are available in repo path (and cache layer)
RUN mkdir -p apps/api/models \
	&& cp -r node_modules/@vladmandic/face-api/model/* apps/api/models/ || true

# reuse pnpm store for speed
COPY --from=deps /root/.local/share/pnpm /root/.local/share/pnpm

# ⬇️ THIS is the critical line
RUN pnpm install --filter @enxtai/api... --frozen-lockfile

# build workspace dependencies first (shared-types)
RUN pnpm --filter @enxtai/shared-types... build

# prisma CLI now exists ✔
RUN pnpm --filter @enxtai/api exec prisma generate

# build API
RUN pnpm --filter @enxtai/api exec nest build


# ---------- runtime ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
	&& adduser --system --uid 1001 nestjs

# Install all deps instead of --prod so prisma and ts-node are available for seeding
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN corepack enable pnpm && pnpm install --filter @enxtai/api... --frozen-lockfile

# Copy build to the exact monorepo paths
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

# Generate Prisma Client for the runtime environment
RUN pnpm --filter @enxtai/api exec prisma generate

# Create entrypoint script
USER root
RUN echo '#!/bin/sh' > /app/start.sh && \
	echo 'cd apps/api && npx prisma db push --accept-data-loss && npx prisma db seed' >> /app/start.sh && \
	echo 'node dist/main' >> /app/start.sh && \
	chmod +x /app/start.sh && \
	chown nestjs:nodejs /app/start.sh

USER nestjs
EXPOSE 3001
CMD ["/app/start.sh"]

# syntax=docker/dockerfile:1

# ------------------------------
# Base image shared by all stages.
# Includes native build tooling required by API dependencies.
# ------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache \
	libc6-compat \
	python3 \
	make \
	g++ \
	pkgconfig \
	pixman-dev \
	cairo-dev \
	pango-dev \
	jpeg-dev \
	giflib-dev \
	librsvg-dev \
	openssl \
	&& corepack enable pnpm
WORKDIR /app

# ------------------------------
# Dependencies stage.
# Installs workspace dependencies once for reuse in later stages.
# ------------------------------
FROM base AS deps
WORKDIR /app

# Copy only manifests first to maximize Docker layer cache reuse.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# Install dependencies needed for build and migration tooling.
RUN pnpm install --frozen-lockfile

# ------------------------------
# Build stage.
# Compiles shared workspace package and API application.
# ------------------------------
FROM base AS builder
WORKDIR /app

# Reuse already-installed node_modules and pnpm store from deps stage.
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /root/.local/share/pnpm /root/.local/share/pnpm

# Copy only required workspace sources for API build.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api apps/api
COPY packages/shared-types packages/shared-types

# Re-link workspace dependencies in builder so package-local binaries (e.g. tsc)
# are available at expected paths during pnpm script execution.
RUN pnpm install --frozen-lockfile

# Build workspace dependency package first, then generate Prisma client and API dist.
RUN pnpm --filter @enxtai/shared-types... build
RUN pnpm --filter @enxtai/api exec prisma generate
RUN pnpm --filter @enxtai/api exec nest build

# ------------------------------
# Runtime stage.
# Copies only runtime-relevant workspace parts and starts API.
# ------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Runtime libraries only; curl is used by container health checks.
RUN apk add --no-cache \
	libc6-compat \
	cairo \
	jpeg \
	pango \
	giflib \
	pixman \
	librsvg \
	curl \
	openssl

# Use production mode while preserving prisma CLI access from installed deps.
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

# Use a non-root user for safer container execution.
RUN addgroup --system --gid 1001 nodejs \
	&& adduser --system --uid 1001 nestjs

# Copy only the files required to run the API in the monorepo runtime layout.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/apps/api /app/apps/api
COPY --from=builder /app/packages/shared-types /app/packages/shared-types

# Ensure runtime uses Compose-injected environment values.
# Local development env files should not be baked into the deployment image.
RUN rm -f /app/apps/api/.env /app/apps/api/.env.local

# Create startup script with migration-first boot strategy for staging.
RUN printf '%s\n' \
	'#!/bin/sh' \
	'set -e' \
	'cd /app/apps/api' \
	'if [ "${SKIP_PRISMA_MIGRATE:-false}" = "true" ]; then echo "Skipping prisma migrate deploy (SKIP_PRISMA_MIGRATE=true)"; else npx prisma migrate deploy; fi' \
	'node dist/main.js' \
	> /app/start.sh \
	&& chmod +x /app/start.sh

# Grant runtime file ownership to the application user.
RUN chown -R nestjs:nodejs /app

USER nestjs
EXPOSE 3001
CMD ["/app/start.sh"]

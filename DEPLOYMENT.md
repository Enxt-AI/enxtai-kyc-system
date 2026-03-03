# EnxtAI KYC AWS Staging Deployment Guide

This guide defines the staging deployment flow for the backend API on AWS EC2.

## Scope and Architecture

- `apps/web` remains deployed on Vercel.
- EC2 runs backend services with Docker Compose using `docker-compose.aws.yml`.
- External managed services are used for database and cache:
  - PostgreSQL: Supabase
  - Redis: Upstash
- MinIO runs in Docker on EC2 for staging object storage.

## Prerequisites

- AWS EC2 instance (Ubuntu 22.04+/Amazon Linux 2023) with Docker installed
- Open inbound ports as needed:
  - `22` for SSH
  - `3001` for API access (or via reverse proxy)
  - `9001` only if you need MinIO console access
- Repository access on the server (recommended: `git clone` / `git pull`)

## 1) One-Time Server Setup

```bash
sudo dnf update -y || sudo apt update -y
sudo dnf install -y git docker || sudo apt install -y git docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
```

After adding your user to the Docker group, reconnect your SSH session.

## 2) Fetch Project on EC2

```bash
git clone <your-repo-url> enxtai-kyc-system
cd enxtai-kyc-system
```

For future deployments:

```bash
git pull origin <your-branch>
```

## 3) Configure Staging Environment File

Create `.env.aws` in the repository root. This file is gitignored and used by `docker-compose.aws.yml`.

```bash
cp .env.aws .env.aws.local.backup 2>/dev/null || true
nano .env.aws
```

Required baseline:

- External services: `DATABASE_URL`, `REDIS_URL`
- For Supabase pooler setups: `DIRECT_URL` for migrations and `DATABASE_URL` for runtime queries
- API runtime: `PORT`, `NODE_ENV`
- DigiLocker required settings: `DIGILOCKER_CLIENT_ID`, `DIGILOCKER_CLIENT_SECRET`, `DIGILOCKER_REDIRECT_URI`
- MinIO settings and bucket names

If database credentials contain special characters (for example `@`, `#`, `%`), URL-encode them in `DATABASE_URL`.

## 4) Build and Start Staging Stack

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml build api
docker compose --env-file .env.aws -f docker-compose.aws.yml up -d
```

Services started by this compose file:

- `api` (NestJS backend)
- `minio` (staging object storage)

Services intentionally externalized and not started in compose:

- PostgreSQL
- Redis

## 5) Startup Behavior (Important)

On container boot, API startup performs:

1. `prisma migrate deploy` (unless `SKIP_PRISMA_MIGRATE=true`)
2. `node dist/main.js`

No automatic `db push` and no automatic seeding are run on startup.

If `SKIP_PRISMA_MIGRATE=true` is used for staging connectivity constraints, run migrations manually from an environment that can reach your direct database endpoint.

If you need to seed staging data manually:

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml exec api pnpm --filter @enxtai/api prisma:seed
```

## 6) Verification Commands

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml ps
docker compose --env-file .env.aws -f docker-compose.aws.yml logs -f api
curl http://localhost:3001/health
```

If MinIO console is exposed, access it at `http://<EC2_PUBLIC_IP>:9001`.

## 7) Operations Cheat Sheet

Restart services:

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml restart
```

Rebuild API only:

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build --force-recreate api
```

Stop services:

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml stop
```

Remove services:

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml down
```

## 8) Rollback Strategy

Rollback to a previous commit and redeploy:

```bash
git log --oneline -n 10
git checkout <previous_commit_sha>
docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build --force-recreate api
```

## 9) Staging Notes

- This setup is for staging/experimental use and is not hardened public production.
- Secrets in `.env.aws` should be rotated regularly and never committed.
- For internet-facing access, place API behind a reverse proxy and TLS.

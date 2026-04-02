# Production & Staging Deployment Guide (AWS EC2)

> Quick reference for orchestrating the Backend API and MinIO storage on AWS EC2.

## 🏗️ Architecture Split
* **Frontend**: Handled completely automatically via Vercel deployments.
* **Backend**: Dockerized NestJS + MinIO containers running via `docker-compose.aws.yml`.
* **Database & Cache**: Supabase (PostgreSQL) and Upstash (Redis) are externally managed.

## 🚀 Server Setup (One-Time)
Run on your Ubuntu EC2 Instance:
```bash
sudo apt update -y && sudo apt install -y git docker.io
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker $USER # Reconnect SSH after this
```

## 📦 Deployment Workflow

**1. Pull Code**
```bash
git clone <repo-url> enxtai-kyc-system
cd enxtai-kyc-system
```

**2. Configure Secrets**
```bash
nano .env.aws 
# Add your DATABASE_URL, DIGILOCKER_CLIENT_ID, MINIO_*, etc.
```

**3. Build & Spin Up**
```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml build api
docker compose --env-file .env.aws -f docker-compose.aws.yml up -d
```
*Note: The Nest API container will automatically run `prisma migrate deploy` on boot!*

## 🛠️ Operations Cheat Sheet

| Action | Command |
| ------ | ------- |
| **Check Logs** | `docker compose --env-file .env.aws -f docker-compose.aws.yml logs -f api` |
| **Restart Stack** | `docker compose --env-file .env.aws -f docker-compose.aws.yml restart` |
| **Manual DB Seed** | `docker compose --env-file .env.aws -f docker-compose.aws.yml exec api pnpm --filter @enxtai/api prisma:seed` |
| **Teardown** | `docker compose --env-file .env.aws -f docker-compose.aws.yml down` |

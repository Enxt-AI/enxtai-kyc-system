# EnxtAI KYC System - Local Startup Guide

> Essential commands to initialize the development and testing environments locally.

## 📦 1. Start Infrastructure Container Services
Boot your backing databases (PostgreSQL, Redis, MinIO):
```bash
docker-compose up -d postgres redis minio
```
*(Verify they are healthy with `docker-compose ps`)*

## 🗄️ 2. Apply Database Migrations & Seed
Prepare the backend schema and seed initial Super Admin records into PostgreSQL:
```bash
cd apps/api
pnpm prisma migrate deploy
pnpm prisma db seed
```
*(Optionally view your DB locally at `localhost:5555` via `pnpm prisma studio`)*

## 🚀 3. Boot Application Servers
In two separate terminals, run your frontend and backend environments:

**Terminal 1: Start Backend API**
```bash
cd apps/api
pnpm run start:dev
```
*(Runs on `http://localhost:3001` - Access Swagger API Docs at `/api/docs`)*

**Terminal 2: Start Next.js Frontend**
```bash
cd apps/web
pnpm run dev
```
*(Runs on `http://localhost:3000`)*

## 🧪 4. Testing End-to-End Flow
A full suite of auto-testing scripts natively exists to validate multi-tenant isolation and verification loops:
```bash
cd apps/api
pnpm test:client-api --adminUser="admin@enxtai.com" --adminPassword="admin123" --baseUrl="http://localhost:3001"
```

## 🛠️ Troubleshooting Guide

| Issue | Resolution |
| ----- | ---------- |
| **Port 3001 In Use** | Change the `PORT` declaration in your `apps/api/.env` file. |
| **Database Refused** | Ensure Docker Compose boots correctly. Run `docker-compose restart postgres`. |
| **MinIO Connection Drop** | Clean MinIO container cache: `docker-compose down minio && docker volume rm enxtai-kyc-system_minio_data` |
| **Prisma Sync Errors** | Nuke your database and re-migrate using `pnpm prisma migrate reset`. |

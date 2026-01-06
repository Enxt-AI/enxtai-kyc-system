# 🚀 EnxtAI KYC System - Quick Start Guide

This guide will help you start and test the production-ready KYC system.

## Prerequisites

✅ Node.js (v18 or higher)  
✅ pnpm (v8 or higher)  
✅ Docker & Docker Compose  
✅ PostgreSQL client (optional, for manual DB inspection)

---

## Step 1: Start Infrastructure Services

Start PostgreSQL, Redis, and MinIO using Docker Compose:

```bash
# From project root
docker-compose up -d postgres redis minio
```

**Verify services are running:**
```bash
docker-compose ps
```

Expected output:
```
NAME              STATUS              PORTS
kyc-postgres      Up                 0.0.0.0:5432->5432/tcp
kyc-redis         Up                 0.0.0.0:6379->6379/tcp
kyc-minio         Up                 0.0.0.0:9000-9001->9000-9001/tcp
```

**Access MinIO Console** (optional):
- URL: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin`

---

## Step 2: Run Database Migrations

Apply Prisma migrations to set up the database schema:

```bash
cd apps/api
pnpm prisma migrate deploy
```

**Verify migration success:**
```bash
pnpm prisma studio
```
This opens Prisma Studio at http://localhost:5555 where you can inspect the database.

---

## Step 3: Seed Super Admin User (Optional)

Create a super admin user for testing:

```bash
# Still in apps/api directory
pnpm prisma db seed
```

Or manually via Prisma Studio:
1. Open http://localhost:5555
2. Navigate to `User` table
3. Add a record:
   - `email`: `admin@enxtai.com`
   - `password`: (hashed via bcrypt) - use a tool or the app's registration endpoint
   - `role`: `SUPER_ADMIN`

**Quick seed script** (run in apps/api):
```typescript
// Create seed.ts in apps/api/prisma/
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.upsert({
    where: { email: 'admin@enxtai.com' },
    update: {},
    create: {
      email: 'admin@enxtai.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
  });
  
  console.log('✅ Super admin created: admin@enxtai.com / admin123');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
```

Run it:
```bash
npx ts-node prisma/seed.ts
```

---

## Step 4: Start the API Server

Start the NestJS API in development mode:

```bash
# From apps/api directory
pnpm run start:dev
```

**Expected output:**
```
[Nest] INFO  KYC API is running on http://localhost:3001
[Nest] INFO  Swagger UI available at http://localhost:3001/api/docs
```

**Troubleshooting:**
- **Port 3001 in use?** Change `PORT` in `.env` file
- **Database connection error?** Check `DATABASE_URL` in `.env`
- **MinIO connection error?** Ensure MinIO is running: `docker-compose ps`

---

## Step 5: Test the System

### Option A: Using Swagger UI (Recommended)

1. **Open Swagger UI**: http://localhost:3001/api/docs
2. **Test Health Endpoint**:
   - Expand `GET /api/health`
   - Click "Try it out"
   - Click "Execute"
   - Expected: `200 OK` with health status

3. **Create a Client** (requires super admin):
   - Login first via `/api/auth/login`
   - Use `/api/admin/clients` POST endpoint
   - Save the returned `apiKey` (shown once!)

4. **Test Client KYC Flow**:
   - Use the client's API key in `X-API-Key` header
   - POST `/api/v1/kyc/initiate` to start KYC
   - POST `/api/v1/kyc/{submissionId}/documents` to upload documents
   - GET `/api/v1/kyc/{submissionId}/status` to check progress

### Option B: Using E2E Test Script

Run the comprehensive E2E test suite:

```bash
cd apps/api
pnpm test:client-api --adminUser="admin@enxtai.com" --adminPassword="admin123" --baseUrl="http://localhost:3001"
```

**Test Coverage:**
- ✅ Super-admin authentication
- ✅ Client creation (2 clients)
- ✅ Full KYC flow (document upload, OCR, face verification)
- ✅ Tenant isolation
- ✅ Rate limiting (100 req/min)

**Expected output:**
```
🚀 Starting Client API E2E Tests
✅ PASS: Admin Authentication (145.23ms)
✅ PASS: Create Client A (234.56ms)
✅ PASS: Create Client B (198.34ms)
✅ PASS: Client A KYC Flow (1234.56ms)
✅ PASS: Client B KYC Flow (1156.78ms)
✅ PASS: Tenant Isolation (89.12ms)
✅ PASS: Rate Limiting (2345.67ms)

📊 Test Summary:
   Total: 7
   ✅ Passed: 7
   ❌ Failed: 0
```

### Option C: Using cURL

**1. Login as Super Admin:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@enxtai.com",
    "password": "admin123"
  }'
```

**2. Create a Client:**
```bash
curl -X POST http://localhost:3001/api/admin/clients \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie-from-login>" \
  -d '{
    "name": "Test Client",
    "email": "client@example.com",
    "webhookUrl": "https://example.com/webhook",
    "webhookSecret": "webhook-secret"
  }'
```

**Save the API key from response!**

**3. Initiate KYC (as client):**
```bash
curl -X POST http://localhost:3001/api/v1/kyc/initiate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <client-api-key>" \
  -d '{
    "externalUserId": "user-123",
    "email": "user@example.com",
    "phone": "+919876543210"
  }'
```

**4. Upload Document:**
```bash
curl -X POST http://localhost:3001/api/v1/kyc/<submission-id>/documents?type=AADHAAR_FRONT \
  -H "X-API-Key: <client-api-key>" \
  -F "document=@path/to/aadhaar-front.jpg"
```

**5. Check Status:**
```bash
curl http://localhost:3001/api/v1/kyc/<submission-id>/status \
  -H "X-API-Key: <client-api-key>"
```

---

## Step 6: Start the Web Frontend (Optional)

```bash
cd apps/web
pnpm run dev
```

Access at: http://localhost:3000

---

## Monitoring & Observability

### View Logs
```bash
# API logs (structured JSON in production)
cd apps/api
pnpm run start:dev
```

**Log fields:**
- `clientId`: Tenant identifier
- `userId`: End-user identifier
- `action`: HTTP method + URL
- `duration`: Request processing time (ms)
- `statusCode`: Response status

### Check Database
```bash
# Open Prisma Studio
cd apps/api
pnpm prisma studio
```

### MinIO Storage
- Console: http://localhost:9001
- Buckets are created per-client: `kyc-{clientId}-documents`

---

## Troubleshooting

### Issue: "Cannot resolve dependencies of ClientKycService"
**Solution:** Already fixed! KycModule now exports KycService.

### Issue: "Connection refused to PostgreSQL"
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### Issue: "MinIO health check failed"
```bash
# Check MinIO status
docker-compose ps minio

# View logs
docker-compose logs minio

# Restart with fresh data
docker-compose down minio
docker volume rm enxtai-kyc-system_minio_data
docker-compose up -d minio
```

### Issue: "Prisma migration failed"
```bash
# Reset database (⚠️ deletes all data)
cd apps/api
pnpm prisma migrate reset

# Or manually drop and recreate
docker-compose exec postgres psql -U postgres -c "DROP DATABASE kyc_db;"
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE kyc_db;"
pnpm prisma migrate deploy
```

### Issue: "Rate limit exceeded"
Wait 60 seconds or adjust rate limit in `ClientThrottlerGuard`:
```typescript
// apps/api/src/common/guards/client-throttler.guard.ts
// Change ttl or limit values
```

---

## API Endpoints Summary

### Public Endpoints
- `GET /api/health` - Health check
- `POST /api/auth/login` - Admin login

### Admin Endpoints (Session Auth)
- `GET /api/admin/clients` - List all clients
- `POST /api/admin/clients` - Create client
- `GET /api/admin/clients/:id` - Get client details
- `PUT /api/admin/clients/:id` - Update client
- `POST /api/admin/clients/:id/regenerate-key` - Regenerate API key
- `GET /api/admin/kyc/pending-review` - Pending submissions
- `POST /api/admin/kyc/approve` - Approve submission
- `POST /api/admin/kyc/reject` - Reject submission

### Client KYC Endpoints (API Key Auth)
- `POST /api/v1/kyc/initiate` - Start KYC process
- `POST /api/v1/kyc/:id/documents` - Upload document
- `GET /api/v1/kyc/:id/status` - Check KYC status
- `GET /api/v1/kyc/submissions` - List submissions
- `GET /api/v1/client/webhook` - Get webhook config
- `PUT /api/v1/client/webhook` - Update webhook config

---

## Performance Benchmarks

Expected response times (on modern hardware):
- Document upload: 200-500ms
- OCR extraction: 1-3 seconds
- Face verification: 2-4 seconds
- Status check: 50-100ms

**Rate Limits:**
- Client API: 100 requests/minute per API key
- Admin API: No rate limit (session-based)

---

## Next Steps

1. ✅ **System is running!** Test basic flows via Swagger UI
2. 📊 **Run E2E tests** to verify full functionality
3. 🔧 **Configure webhooks** for real-time status notifications
4. 🚀 **Deploy to production** using Docker or cloud platform
5. 📈 **Set up monitoring** (ELK Stack, CloudWatch, Datadog)

---

## Support & Documentation

- **API Documentation**: http://localhost:3001/api/docs
- **Architecture Docs**: See `DOCUMENTATION_IMPLEMENTATION.md`
- **Recent Fixes**: See `MAJOR_FIXES.md`

**Questions?** Check the source code JSDoc comments for detailed explanations.

---

**🎉 Happy Testing!**

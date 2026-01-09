# EnxtAI KYC System

> In-house Know Your Customer (KYC) verification system built with NestJS, Next.js, and TensorFlow.js

## 📋 Project Overview

EnxtAI KYC System is a production-grade, full-stack application for automated identity verification. The system handles PAN card and Aadhaar card document uploads, performs OCR text extraction using Tesseract.js, validates user identity through face recognition (face-api.js), and provides an admin dashboard for manual review of edge cases. Built as a monorepo with TurboRepo, the system is designed for scalability and future integration with CVL KRA and DigiLocker APIs.

**Key Features:**
- 📄 Document Upload: PAN card, Aadhaar front/back, live photo (selfie)
- 🔍 OCR Extraction: Tesseract.js extracts PAN number, Aadhaar number (masked), name, DOB, address
- 🎭 Face Verification: face-api.js matches live photo against ID document photos (80% threshold)
- 📊 Admin Dashboard: Manual review for submissions with <80% confidence scores
- 🗄️ Secure Storage: MinIO S3-compatible storage with AES-256 encryption
- 📈 Progress Tracking: Real-time status updates (PENDING → DOCUMENTS_UPLOADED → OCR_COMPLETED → FACE_VERIFIED)

## 🔐 Authentication & Access

The system implements multi-tenant role-based access control with separate login portals for different user types:

### User Types & Login URLs

| User Type | Login URL | Purpose | Demo Credentials |
|-----------|-----------|---------|------------------|
| **Super Admin** | `http://localhost:3000/admin/login` | Platform administration, client management, KYC review | `admin@enxtai.com` / `admin123` |
| **Client Admin** | `http://localhost:3000/client/login` | FinTech client operations, submission management | `admin@testfintech.com` / `client123` |
| **End User** | `http://localhost:3000` | KYC verification process | No authentication required |

### URL Migration & Backward Compatibility

- **Legacy URL**: `/client-login` → **301 redirect** to `/client/login`
- **New Structure**: `/admin/login` and `/client/login` for better organization
- **Public Access**: KYC verification flow at `/` requires no authentication

### Multi-Tab Session Isolation

**Isolated Authentication Contexts:**
- **Super Admin Portal**: Uses `next-auth.super-admin-token` cookie
- **Client Portal**: Uses `next-auth.client-token` cookie
- **Public KYC Flow**: No authentication required

**Multi-Tab Capability:**
```
Tab 1: Super Admin Login → /admin/dashboard (super-admin-token)
Tab 2: Client Login → /client/dashboard (client-token)
✅ Both sessions coexist independently
✅ Refresh either tab → stays logged in
✅ Logout Tab 2 → Tab 1 unaffected
```

**How It Works:**
1. **Separate NextAuth Handlers:**
   - `/api/auth/admin/[...nextauth]` → Admin authentication
   - `/api/auth/client/[...nextauth]` → Client authentication

2. **Isolated Session Providers:**
   - `AdminSessionProvider` (basePath="/api/auth/admin")
   - `ClientSessionProvider` (basePath="/api/auth/client")

3. **Path-Based Middleware:**
   - `/admin/*` → Checks `next-auth.super-admin-token`
   - `/client/*` → Checks `next-auth.client-token`

**Testing Multi-Tab Isolation:**
```bash
# Tab 1: Super Admin
1. Open http://localhost:3000/admin/login
2. Login: admin@enxtai.com / admin123
3. Verify: /admin/dashboard loads

# Tab 2: Client Admin (same browser)
1. Open http://localhost:3000/client/login
2. Login: admin@testfintech.com / client123
3. Verify: /client/dashboard loads

# Verify Isolation
1. Refresh Tab 1 → Still logged in as Super Admin ✅
2. Refresh Tab 2 → Still logged in as Client Admin ✅
3. Logout Tab 2 → Tab 1 remains logged in ✅
4. DevTools → Application → Cookies:
   - next-auth.super-admin-token (from Tab 1)
   - next-auth.client-token (from Tab 2)
```

**Cookie Details:**
| Cookie Name | Portal | Path | HttpOnly | SameSite |
|-------------|--------|------|----------|----------|
| `next-auth.super-admin-token` | Admin | / | ✅ | lax |
| `next-auth.client-token` | Client | / | ✅ | lax |
| `next-auth.super-admin.csrf-token` | Admin | / | ✅ | lax |
| `next-auth.client.csrf-token` | Client | / | ✅ | lax |

## 🏗️ Architecture

```mermaid
graph TB
    subgraph "Frontend (Next.js 16.0)"
        A[Upload Page] --> B[DocumentUpload Component]
        A --> C[WebcamCapture Component]
        D[Status Page] --> E[KycStatusIndicator]
        F[Admin Dashboard] --> G[PendingReviewTable]
    end

    subgraph "Backend (NestJS 11.0.10 + Fastify)"
        H[KycController] --> I[KycService]
        I --> J[StorageService]
        I --> K[OcrService]
        I --> L[FaceRecognitionService]
        M[AdminController] --> N[AdminService]
        N --> I
    end

    subgraph "Data Layer"
        O[PrismaService] --> P[(PostgreSQL 15)]
        J --> Q[MinIO S3]
        I --> R[(Redis 7)]
    end

    subgraph "External Services (Future)"
        S[DigiLocker API]
        T[CVL KRA API]
    end

    A -->|HTTP/REST| H
    D -->|HTTP/REST| H
    F -->|HTTP/REST| M
    I --> O
    K -->|Tesseract.js| K
    L -->|face-api.js<br/>TensorFlow.js| L
    I -.->|Future| S
    I -.->|Future| T

    style A fill:#61dafb
    style H fill:#e0234e
    style P fill:#336791
    style Q fill:#C72E49
    style S fill:#ddd,stroke-dasharray: 5 5
    style T fill:#ddd,stroke-dasharray: 5 5
```

## 🔄 KYC Workflow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Storage as MinIO
    participant OCR as Tesseract.js
    participant FaceRec as face-api.js
    participant DB as PostgreSQL

    User->>Frontend: Upload PAN Card
    Frontend->>API: POST /api/v1/kyc/upload/pan
    API->>Storage: Store in kyc-pan bucket
    API->>DB: Create/Update Submission (DOCUMENTS_UPLOADED)
    API-->>Frontend: Success + kycSessionId

    User->>Frontend: Upload Aadhaar Front/Back
    Frontend->>API: POST /api/v1/kyc/upload/aadhaar/front & /back
    API->>Storage: Store in kyc-aadhaar-cards bucket
    API->>DB: Update Submission
    API-->>Frontend: Success

    User->>Frontend: Capture Live Photo
    Frontend->>API: POST /api/v1/kyc/upload/live-photo
    API->>Storage: Store in kyc-live-photos bucket
    API->>DB: Update Submission
    API-->>Frontend: Success

    User->>Frontend: Trigger Verification
    Frontend->>API: POST /api/v1/kyc/verify
    API->>Storage: Download Documents
    API->>OCR: Extract PAN/Aadhaar Data
    OCR-->>API: Extracted Text (PAN#, name, DOB, address)
    API->>DB: Update Extracted Data (OCR_COMPLETED)
    API->>FaceRec: Verify Face Match
    FaceRec-->>API: Match Score + Liveness Score
    API->>DB: Update Scores & Status

    alt Score >= 80%
        API->>DB: Status = FACE_VERIFIED
        API-->>Frontend: Auto-Approved ✓
    else Score < 80%
        API->>DB: Status = PENDING_REVIEW
        API-->>Frontend: Needs Manual Review
        Admin->>Frontend: Review Submission
        Admin->>API: POST /api/admin/kyc/approve or reject
        API->>DB: Update Final Status (VERIFIED/REJECTED)
    end
```

## 📊 Status Progression

| Internal Status | Description | Progress % | Next Step |
|----------------|-------------|------------|-----------|
| `PENDING` | Submission created, no documents uploaded | 0% | Upload PAN, Aadhaar, Live Photo |
| `DOCUMENTS_UPLOADED` | All required documents uploaded to MinIO | 33% | Trigger face verification (OCR runs automatically) |
| `OCR_COMPLETED` | Text extracted from PAN/Aadhaar via Tesseract.js | 66% | Face verification continues |
| `FACE_VERIFIED` | Face match ≥80% and liveness ≥80% (auto-approved) | 100% | Complete ✓ |
| `PENDING_REVIEW` | Face match <80%, requires manual admin review | 90% | Admin approval needed |
| **Final Status** | | | |
| `VERIFIED` | Admin approved submission | 100% | Complete ✓ |
| `REJECTED` | Failed verification or admin rejected | 100% | End (user may retry) |

## 🛠️ Technology Stack

### Backend
- **Framework**: NestJS 11.0.10 (Node.js framework)
- **HTTP Server**: Fastify 5.6.2 (high-performance alternative to Express)
- **Database**: PostgreSQL 15+ (via Prisma ORM 5.0)
- **Cache**: Redis 7+ (session storage, rate limiting - future)
- **Storage**: MinIO (S3-compatible object storage with AES-256 encryption)
- **OCR**: Tesseract.js 5.0 (JavaScript port of Tesseract OCR engine)
- **Face Recognition**: @vladmandic/face-api 1.7.15 (TensorFlow.js-based face detection/recognition)
- **Image Processing**: Sharp 0.33 (libvips wrapper for fast image preprocessing)

### Frontend
- **Framework**: Next.js 16.0 (React 19 with Turbopack)
- **Styling**: Tailwind CSS 3.x
- **File Upload**: React-dropzone (drag-and-drop interface)
- **Webcam**: react-webcam (live photo capture)
- **Face Detection**: pico.js (client-side face detection for UX feedback)
- **HTTP Client**: Axios 1.6

### DevOps & Tooling
- **Monorepo**: TurboRepo 2.x
- **Package Manager**: pnpm 8.x
- **Containerization**: Docker + Docker Compose
- **ORM**: Prisma 5.0
- **Type Safety**: TypeScript 5.3 (shared types via `@enxtai/shared-types` package)

## 📦 Project Structure

```
enxtai-kyc-system/
├── apps/
│   ├── api/                      # NestJS backend (port 3001)
│   │   ├── src/
│   │   │   ├── kyc/              # KYC module (upload, OCR, face verification)
│   │   │   ├── admin/            # Admin module (pending reviews, approve/reject)
│   │   │   ├── ocr/              # OCR service (Tesseract.js integration)
│   │   │   ├── face-recognition/ # Face-api.js integration
│   │   │   ├── storage/          # MinIO service (S3 operations)
│   │   │   ├── prisma/           # Prisma client service
│   │   │   └── health/           # Health check endpoint
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Database schema
│   │   │   └── migrations/       # Prisma migrations
│   │   ├── Dockerfile            # Production Docker image
│   │   └── package.json
│   │
│   └── web/                      # Next.js frontend (port 3000)
│       ├── src/
│       │   ├── app/
│       │   │   ├── kyc/          # KYC user flow pages
│       │   │   │   ├── upload/   # Document upload page
│       │   │   │   ├── photo/    # Live photo capture page
│       │   │   │   ├── verify/   # Face verification trigger page
│       │   │   │   └── status/   # KYC status tracking page
│       │   │   └── admin/        # Admin dashboard
│       │   ├── components/       # Reusable React components
│       │   │   ├── DocumentUpload.tsx
│       │   │   ├── WebcamCapture.tsx
│       │   │   ├── KycStatusIndicator.tsx
│       │   │   └── FaceVerificationStatus.tsx
│       │   └── lib/
│       │       └── api-client.ts # Centralized Axios API client
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared-types/             # Shared TypeScript types/enums
│       └── src/
│           ├── kyc.types.ts      # KYC-related types
│           ├── enums.ts          # Status enums
│           └── index.ts          # Barrel exports
│
├── docker-compose.yml            # PostgreSQL, Redis, MinIO services
├── turbo.json                    # TurboRepo pipeline config
├── pnpm-workspace.yaml           # pnpm workspace definition
└── README.md                     # This file
```

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js**: v20.x LTS ([Download](https://nodejs.org/))
- **pnpm**: v8.x (`npm install -g pnpm`)
- **Docker**: Latest version ([Download](https://www.docker.com/products/docker-desktop))
- **Docker Compose**: v2.x (bundled with Docker Desktop)

### Environment Variables

Create `.env` files in the following locations:

#### `apps/api/.env`
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kyc_db"

# Redis (future use)
REDIS_URL="redis://localhost:6379"

# MinIO S3 Storage
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_USE_SSL="false"
MINIO_PAN_BUCKET="kyc-pan"
MINIO_AADHAAR_BUCKET="kyc-aadhaar-cards"
MINIO_LIVE_PHOTO_BUCKET="kyc-live-photos"

# JWT (future authentication)
JWT_SECRET="your-secret-key-change-in-production"

# Server
PORT="3001"

# Face-api.js Models
FACE_API_MODELS_PATH="./node_modules/@vladmandic/face-api/model"
FACE_API_MODEL_TYPE="ssdMobilenetv1"
```

#### `apps/web/.env.local`
```env
# API Base URL
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/enxtai-kyc-system.git
   cd enxtai-kyc-system
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Start infrastructure services (PostgreSQL, Redis, MinIO):**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations:**
   ```bash
   cd apps/api
   pnpm prisma migrate dev
   pnpm prisma generate
   cd ../..
   ```

5. **Start the API server (development mode):**
   ```bash
   cd apps/api
   pnpm start:dev
   # API will run on http://localhost:3001
   ```

6. **Start the frontend (in a new terminal):**
   ```bash
   cd apps/web
   pnpm dev
   # Frontend will run on http://localhost:3000
   ```

7. **Access the application:**
   - Frontend: http://localhost:3000
   - API Health Check: http://localhost:3001/api/health
   - MinIO Console: http://localhost:9001 (minioadmin / minioadmin)

## 📚 API Endpoints

### KYC Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/kyc/initiate` | Create new KYC session |
| POST | `/api/v1/kyc/upload/pan` | Upload PAN card document |
| POST | `/api/v1/kyc/upload/aadhaar/front` | Upload Aadhaar front side |
| POST | `/api/v1/kyc/upload/aadhaar/back` | Upload Aadhaar back side |
| POST | `/api/v1/kyc/upload/live-photo` | Upload live photograph |
| GET | `/api/v1/kyc/status/:kycSessionId` | Get KYC verification status |
| POST | `/api/v1/kyc/verify` | Manually trigger verification |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/kyc/pending-review` | Get submissions needing review |
| GET | `/api/admin/kyc/submission/:id` | Get submission details for review |
| POST | `/api/admin/kyc/approve` | Approve KYC submission |
| POST | `/api/admin/kyc/reject` | Reject KYC submission |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (Prisma, MinIO connectivity) |

## 📖 API Documentation

### For Clients (External Integration)

- **Swagger UI**: http://localhost:3001/api/docs (interactive API explorer)
- **Integration Guide**: [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) (step-by-step tutorial)
- **Postman Collection**: [docs/EnxtAI_KYC_API.postman_collection.json](docs/EnxtAI_KYC_API.postman_collection.json) (import into Postman)

### Client-Facing Endpoints

All client-facing endpoints require `X-API-Key` header authentication:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/kyc/initiate` | Create new KYC session |
| POST | `/api/v1/kyc/upload/pan` | Upload PAN card document |
| POST | `/api/v1/kyc/upload/aadhaar/front` | Upload Aadhaar front side |
| POST | `/api/v1/kyc/upload/aadhaar/back` | Upload Aadhaar back side |
| POST | `/api/v1/kyc/upload/live-photo` | Upload live photograph |
| GET | `/api/v1/kyc/status/:kycSessionId` | Get KYC verification status |
| POST | `/api/v1/kyc/verify` | Manually trigger verification |

**Quick Start:**
```bash
# 1. Obtain API key from client portal (http://localhost:3000/client/login)
# 2. Initiate KYC session
curl -X POST http://localhost:3001/api/v1/kyc/initiate \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId": "customer-123", "email": "user@example.com"}'

# 3. Upload documents (see Integration Guide for details)
# 4. Check status or receive webhook notification
curl -X GET http://localhost:3001/api/v1/kyc/status/{kycSessionId} \
  -H "X-API-Key: your-api-key"
```

### Webhook Events

Configure webhook URL in client portal to receive real-time notifications:

- `kyc.documents_uploaded` - All documents uploaded
- `kyc.verification_completed` - Face verification completed
- `kyc.status_changed` - Admin changed status (approved/rejected)

See [Integration Guide](docs/INTEGRATION_GUIDE.md#webhook-setup) for signature verification examples.

## 🧪 Testing

### Manual Testing Flow

1. **Start KYC Process:**
   - Navigate to http://localhost:3000
   - Click "Begin KYC Verification"

2. **Upload Documents:**
   - Upload a PAN card image (JPEG/PNG, <5MB)
   - Upload Aadhaar front side (contains photo)
   - Upload Aadhaar back side (contains address)
   - Progress should show "3/3 documents uploaded"

3. **Capture Live Photo:**
   - Click "Continue to Live Photo"
   - Allow camera permissions
   - Wait for "Face Detected ✓" or 5-second timeout
   - Click "Capture Photo"
   - Review and click "Upload"

4. **Trigger Verification:**
   - Click "Verify My Identity"
   - System performs OCR + face matching
   - View results: Face Match Score, Liveness Score, Status

5. **Admin Review (if <80% confidence):**
   - Navigate to http://localhost:3000/admin/login
   - Login with Super Admin credentials: `admin@enxtai.com` / `admin123`
   - View pending reviews in `/admin/kyc-review`
   - Approve or reject with notes

6. **Client Portal Testing:**
   - Navigate to http://localhost:3000/client/login
   - Login with Client Admin credentials: `admin@testfintech.com` / `client123`
   - Access client dashboard at `/client/dashboard`
   - View submissions and configure settings

**Legacy URL Support:**
- `/client-login` → 301 redirect to `/client/login` (backward compatibility)

### Database Inspection

```bash
# Access Prisma Studio (visual database browser)
cd apps/api
pnpm prisma studio
# Opens at http://localhost:5555
```

## � Secure KYC Whitelist Demo (ngrok)

This demo proves end-to-end API key authentication and domain whitelisting enforcement using a free ngrok tunnel. You'll test that only whitelisted domains can use a client's API key, while unauthorized origins receive 403 errors.

### Prerequisites

- Docker services running (PostgreSQL, Redis, MinIO)
- API and Web applications running locally
- [ngrok](https://ngrok.com/) installed and authenticated (free account)

### Step 1: Start Local Development Environment

```bash
# Terminal 1: Start Docker backing services
docker-compose up -d

# Terminal 2: Start API server
cd apps/api
pnpm dev
# API runs on http://localhost:3001

# Terminal 3: Start Web application
cd apps/web
pnpm dev
# Web runs on http://localhost:3000
```

### Step 2: Configure Client and Whitelist Domains

1. **Super Admin Login:**
   - Navigate to http://localhost:3000/admin/login
   - Login: `admin@enxtai.com` / `admin123`

2. **Create or Select Client:**
   - Go to **Clients** → Select existing client (e.g., TestFinTech) or create new
   - Copy the **API Key** (shown in client detail page)
   - Example: `test_abc123def456ghi789`

3. **Configure Domain Whitelist:**
   - Click **"Manage Domain Whitelist"** button
   - Add the following domains:
     ```
     localhost:3000
     *.ngrok-free.app
     ```
   - **Explanation:**
     - `localhost:3000` - Local development (exact match)
     - `*.ngrok-free.app` - Wildcard for any ngrok subdomain (wildcard match)
   - Click **"Save Changes"**

**Why Wildcard?** Free ngrok rotates subdomains on restart. Using `*.ngrok-free.app` whitelists all ngrok tunnels.

### Step 3: Start ngrok Tunnel

```bash
# Terminal 4: Start ngrok tunnel to local web app
ngrok http 3000

# Output example:
# Session Status: online
# Forwarding: https://abc123def456.ngrok-free.app -> http://localhost:3000
```

**Copy the ngrok URL** (e.g., `https://abc123def456.ngrok-free.app`)

### Step 4: Positive Test - Complete KYC Flow from ngrok URL

1. **Access via ngrok:**
   - Open browser → Navigate to `https://abc123def456.ngrok-free.app`
   - Click "Begin KYC Verification"

2. **Enter API Key:**
   - Paste the API key from Step 2 (e.g., `test_abc123def456ghi789`)
   - Click "Validate & Continue"
   - **Expected:** ✅ Redirect to `/kyc/upload`

3. **Upload Documents:**
   - Upload PAN card (any JPEG/PNG image)
   - Upload Aadhaar front and back
   - **Expected:** ✅ Successful uploads with progress indicators

4. **Capture Live Photo:**
   - Click "Continue to Live Photo"
   - Allow camera permissions
   - Capture photo
   - **Expected:** ✅ Photo uploaded successfully

5. **Verify in MinIO:**
   - Open MinIO Console: http://localhost:9001
   - Login: `minioadmin` / `minioadmin`
   - Navigate to buckets:
     - `kyc-testfintech-pan` - Contains PAN card
     - `kyc-testfintech-aadhaar` - Contains Aadhaar cards
     - `kyc-testfintech-live-photos` - Contains selfie
   - **Expected:** ✅ All documents stored in client-isolated buckets

**✅ Result:** KYC flow completes successfully from whitelisted ngrok domain.

### Step 5: Negative Test - localhost with Origin Header Spoofing

Test that domain whitelisting is enforced server-side (not bypassable from client):

```bash
# Terminal 5: Test from localhost:3000 with spoofed origin
curl -X POST http://localhost:3001/api/v1/kyc/initiate \
  -H "X-API-Key: test_abc123def456ghi789" \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123"}'

# Expected Response:
# HTTP 403 Forbidden
# {
#   "statusCode": 403,
#   "message": "Origin domain not whitelisted for this client",
#   "error": "Forbidden"
# }
```

**Why 403?** TenantMiddleware extracts origin from `Origin` header and validates against client's `allowedDomains`. `evil.com` is not whitelisted → request rejected.

### Step 6: Negative Test - Postman with Unauthorized Origin

```bash
# Postman Request Configuration:
# Method: POST
# URL: http://localhost:3001/api/v1/kyc/initiate
# Headers:
#   - X-API-Key: test_abc123def456ghi789
#   - Origin: https://attacker.com
# Body (JSON):
#   { "userId": "attacker-123" }

# Expected Response:
# 403 Forbidden - Origin not whitelisted
```

**Security Validation:** Even with valid API key, requests from non-whitelisted origins are rejected.

### Step 7: Negative Test - Invalid API Key from Whitelisted Domain

```bash
# Test from localhost:3000 (whitelisted) with invalid key
curl -X POST http://localhost:3001/api/v1/kyc/initiate \
  -H "X-API-Key: invalid_key_xyz" \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-456"}'

# Expected Response:
# HTTP 401 Unauthorized
# {
#   "statusCode": 401,
#   "message": "Invalid API key",
#   "error": "Unauthorized"
# }
```

**Key Validation:** API key hash must match active client record. Invalid keys → 401 error.

### Verification Checklist

| Test Case | Origin | API Key | Expected Result | ✅ |
|-----------|--------|---------|----------------|---|
| ngrok URL → KYC flow | `https://*.ngrok-free.app` | Valid | 200 Success | ✅ |
| localhost → KYC flow | `http://localhost:3000` | Valid | 200 Success | ✅ |
| localhost + evil origin | `https://evil.com` | Valid | 403 Forbidden | ✅ |
| Postman + attacker origin | `https://attacker.com` | Valid | 403 Forbidden | ✅ |
| Whitelisted domain | `http://localhost:3000` | Invalid | 401 Unauthorized | ✅ |
| Non-whitelisted domain | `https://random.com` | Valid | 403 Forbidden | ✅ |

### Multi-Tenant Isolation Verification

Check that uploads are isolated per client:

```bash
# Super Admin: Check buckets in MinIO
# http://localhost:9001 → minioadmin / minioadmin

# Expected Bucket Structure:
# kyc-testfintech-pan/          (TestFinTech client uploads)
# kyc-testfintech-aadhaar/
# kyc-testfintech-live-photos/
# kyc-anotherclient-pan/        (Another client's uploads)
# kyc-anotherclient-aadhaar/
# ...

# Each client's data is isolated by clientId prefix
```

### Troubleshooting

**Issue: ngrok URL returns 403 after restart**
- **Cause:** Free ngrok changes subdomain on restart (e.g., `abc123.ngrok-free.app` → `xyz789.ngrok-free.app`)
- **Solution:** Update client's allowed domains with new subdomain OR use wildcard `*.ngrok-free.app`

**Issue: "Invalid API key" error**
- **Cause:** API key not copied correctly or client is inactive
- **Solution:** Copy key from client detail page, ensure client status is ACTIVE

**Issue: Origin header not sent from browser**
- **Cause:** Same-origin requests may omit Origin header
- **Solution:** Use different domain (ngrok) or test with curl/Postman with explicit Origin header

**Issue: 403 on localhost:3000**
- **Cause:** `localhost:3000` not whitelisted
- **Solution:** Add exact domain `localhost:3000` to client's allowed domains (no protocol prefix)

### Security Considerations

**What This Demo Proves:**
1. ✅ **Server-side validation:** TenantMiddleware enforces domain whitelist (not bypassable from client)
2. ✅ **Multi-factor auth:** Both API key AND origin domain must be valid
3. ✅ **Multi-tenant isolation:** Each client's uploads go to isolated MinIO buckets
4. ✅ **Attack prevention:** Stolen API keys can't be used from unauthorized domains

**Production Recommendations:**
1. Use **paid ngrok** or custom domain for stable subdomains
2. Whitelist **exact domains** in production (avoid wildcards like `*.com`)
3. Enable **HTTPS** and set `MINIO_USE_SSL="true"`
4. Implement **rate limiting** to prevent abuse
5. Monitor **failed authentication attempts** for security alerts
6. Rotate API keys regularly (e.g., every 90 days)

### Free ngrok Limitations

- **Hostname Rotation:** Free tier changes subdomain on restart → re-whitelist required
- **Session Timeout:** Tunnels expire after 2 hours → restart ngrok
- **Request Limits:** 40 requests/minute on free tier
- **No Custom Domains:** Use paid plan for stable domains like `kyc.yourdomain.com`

**Recommendation:** For production, use:
- **ngrok Paid Plan:** Persistent subdomains ($8/month)
- **Custom Domain:** Point your domain to server IP (no ngrok needed)
- **Cloud Hosting:** Deploy to AWS/Azure/GCP with SSL certificates

## �🐳 Deployment

### Docker Build

```bash
# Build API image
cd apps/api
docker build -t enxtai-kyc-api:latest .

# Build Web image
cd apps/web
docker build -t enxtai-kyc-web:latest .
```

### Production Environment Variables

Update `.env` files with production values:

- **DATABASE_URL**: Use managed PostgreSQL (AWS RDS, Azure Database, etc.)
- **REDIS_URL**: Use managed Redis (AWS ElastiCache, Azure Cache, etc.)
- **MINIO_ENDPOINT**: Use production MinIO or AWS S3
- **MINIO_USE_SSL**: Set to `"true"`
- **JWT_SECRET**: Generate strong secret: `openssl rand -base64 32`
- **NEXT_PUBLIC_API_URL**: Set to production API domain

### Docker Compose (Production)

See `docker-compose.prod.yml` (to be created) for production-ready configuration with:
- Nginx reverse proxy
- SSL/TLS termination
- Health checks
- Resource limits
- Logging

## � Production Deployment

### Environment Setup

#### Production Environment Variables

Create production `.env` files for secure deployment:

**`apps/api/.env.production`**
```env
# Database
DATABASE_URL="postgresql://username:password@prod-db:5432/kyc_production"

# Redis
REDIS_URL="redis://prod-redis:6379"

# MinIO S3 Storage
MINIO_ENDPOINT="prod-minio"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="production_access_key"
MINIO_SECRET_KEY="production_secret_key_change_me"
MINIO_USE_SSL="true"
MINIO_PAN_BUCKET="kyc-pan"
MINIO_AADHAAR_BUCKET="kyc-aadhaar-cards"
MINIO_LIVE_PHOTO_BUCKET="kyc-live-photos"

# JWT & Security
JWT_SECRET="secure-production-jwt-secret-256-bits"
JWT_EXPIRES_IN="24h"

# API Rate Limiting
THROTTLE_TTL="60000"
THROTTLE_LIMIT="100"

# Logging
NODE_ENV="production"
LOG_LEVEL="info"

# Health & Monitoring
PORT="3001"
HEALTH_CHECK_TIMEOUT="30000"

# Face Recognition
FACE_API_MODELS_PATH="./node_modules/@vladmandic/face-api/model"
FACE_API_MATCH_THRESHOLD="0.8"
FACE_API_LIVENESS_THRESHOLD="0.8"
```

**`apps/web/.env.production`**
```env
# API Configuration
NEXT_PUBLIC_API_URL="https://api.your-domain.com"
NEXT_PUBLIC_APP_ENV="production"

# Security
NEXTAUTH_SECRET="secure-nextjs-secret-change-in-production"
NEXTAUTH_URL="https://kyc.your-domain.com"

# Feature Flags
NEXT_PUBLIC_ENABLE_FACE_DETECTION="true"
NEXT_PUBLIC_ENABLE_ADMIN_PANEL="true"
```

### Docker Production Build

#### Build Production Images

```bash
# Build API image
cd apps/api
docker build -t enxtai/kyc-api:latest .

# Build Web image
cd ../web
docker build -t enxtai/kyc-web:latest .
```

#### Production Docker Compose

**`docker-compose.prod.yml`**
```yaml
version: '3.8'

services:
  api:
    image: enxtai/kyc-api:latest
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    env_file:
      - ./apps/api/.env.production
    depends_on:
      - postgres
      - redis
      - minio
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  web:
    image: enxtai/kyc-web:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ./apps/web/.env.production
    depends_on:
      - api
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: kyc_production
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secure_prod_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: production_access_key
      MINIO_ROOT_PASSWORD: production_secret_key_change_me
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### Database Migration

```bash
# Run Prisma migrations in production
cd apps/api
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### Deployment Steps

1. **Infrastructure Setup**
   ```bash
   # Clone repository to production server
   git clone https://github.com/enxtai/kyc-system.git
   cd kyc-system

   # Create production environment files
   cp apps/api/.env.example apps/api/.env.production
   cp apps/web/.env.example apps/web/.env.production
   # Edit files with production values
   ```

2. **Build and Deploy**
   ```bash
   # Build production images
   docker-compose -f docker-compose.prod.yml build

   # Start services
   docker-compose -f docker-compose.prod.yml up -d

   # Run database migrations
   docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
   ```

3. **Verify Deployment**
   ```bash
   # Check service health
   curl http://localhost:3001/health

   # Check application status
   curl http://localhost:3000

   # Test client API
   cd apps/api
   pnpm test:client-api --apiKey="your-production-key" --baseUrl="http://localhost:3001"
   ```

### SSL/HTTPS Configuration

For production, configure SSL termination using:

- **Reverse Proxy**: Nginx or Apache with Let's Encrypt certificates
- **Load Balancer**: AWS ALB, CloudFlare, or similar with SSL certificates
- **CDN**: CloudFront, CloudFlare for static asset caching

**Example Nginx Configuration**:
```nginx
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name kyc.your-domain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Monitoring & Logging

#### Structured Logging with Pino

The API uses Pino for structured JSON logging with request context:

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "pid": 1,
  "hostname": "api-container",
  "req": {
    "method": "POST",
    "url": "/v1/kyc/documents/upload/user-123",
    "clientId": "client_abc123",
    "userId": "user_456"
  },
  "res": {
    "statusCode": 201
  },
  "responseTime": 234,
  "msg": "Document upload successful"
}
```

#### Log Aggregation

Configure log aggregation with ELK Stack or CloudWatch:

**Docker Logging Driver**:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "5"
```

**Fluentd/Fluent Bit Configuration** for shipping logs to Elasticsearch.

#### Health Monitoring

- **Health Endpoint**: `/health` (includes database, Redis, MinIO connectivity)
- **Metrics Endpoint**: `/metrics` (Prometheus-compatible metrics)
- **Uptime Monitoring**: Configure external monitoring (Pingdom, UptimeRobot)

## 📖 Client API Documentation

### Authentication

All client-facing APIs require authentication via API key in the header:

```bash
curl -H "X-API-Key: your-api-key-here" \
     -H "Content-Type: application/json" \
     "https://api.your-domain.com/v1/health"
```

### Base URLs

- **Development**: `http://localhost:3001`
- **Production**: `https://api.your-domain.com`

### Rate Limiting

- **Limit**: 100 requests per minute per API key
- **Response**: `429 Too Many Requests` when exceeded
- **Headers**: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Error Format

All API errors follow this standardized format:

```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_UPLOAD_FAILED",
    "message": "Failed to upload document",
    "details": "File size exceeds 10MB limit",
    "timestamp": "2024-01-15T10:30:00Z",
    "path": "/v1/kyc/documents/upload"
  }
}
```

#### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Access denied for current client |
| `VALIDATION_ERROR` | 400 | Invalid request data or missing fields |
| `DOCUMENT_UPLOAD_FAILED` | 400 | File upload failed (size, type, corruption) |
| `OCR_EXTRACTION_FAILED` | 422 | Unable to extract data from document |
| `FACE_VERIFICATION_FAILED` | 422 | Face comparison failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests per minute |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### API Endpoints

#### 1. Health Check

```http
GET /v1/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "healthy",
    "storage": "healthy",
    "redis": "healthy"
  }
}
```

#### 2. Create User

```http
POST /v1/kyc/users
Content-Type: application/json

{
  "userId": "user-12345",
  "email": "user@example.com",
  "phone": "+919876543210",
  "name": "John Doe"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "user-12345",
    "status": "PENDING",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 3. Upload Document

```http
POST /v1/kyc/documents/upload/{userId}
Content-Type: multipart/form-data

document: <file>
documentType: "AADHAAR_FRONT" | "AADHAAR_BACK" | "PAN_CARD" | "SELFIE"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "documentId": "doc_abc123",
    "documentType": "AADHAAR_FRONT",
    "uploadedAt": "2024-01-15T10:30:00Z",
    "extractedData": {
      "aadhaarNumber": "1234-5678-****",
      "name": "JOHN DOE",
      "dateOfBirth": "01/01/1990"
    }
  }
}
```

#### 4. Get KYC Status

```http
GET /v1/kyc/status/{userId}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "user-12345",
    "status": "DOCUMENTS_UPLOADED",
    "completedSteps": [
      "AADHAAR_FRONT",
      "AADHAAR_BACK",
      "PAN_CARD"
    ],
    "nextSteps": ["SELFIE"],
    "extractedData": {
      "pan": "ABCDE1234F",
      "aadhaarNumber": "1234-5678-****",
      "name": "JOHN DOE",
      "dateOfBirth": "01/01/1990"
    },
    "verificationScores": {
      "faceMatch": 0.92,
      "liveness": 0.88
    },
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 5. Trigger Face Verification

```http
POST /v1/kyc/verify/{userId}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "verificationId": "verify_xyz789",
    "status": "FACE_VERIFIED",
    "scores": {
      "faceMatch": 0.92,
      "liveness": 0.88
    },
    "autoApproved": true,
    "completedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Testing Scripts

The system includes comprehensive test scripts for API validation:

#### Client API Tests

```bash
# Test with live API
cd apps/api
pnpm test:client-api --apiKey="your-api-key" --baseUrl="http://localhost:3001"

# Test with mock data (no real files)
pnpm test:client-api --mock

# Test specific scenarios
pnpm test:client-api --apiKey="test-key" --baseUrl="https://api.staging.com"
```

**Test Coverage**:
- ✅ API Authentication (valid/invalid keys)
- ✅ User Creation and Management
- ✅ Document Upload (all types)
- ✅ OCR Data Extraction
- ✅ Face Verification Process
- ✅ Status Tracking and Updates
- ✅ Error Handling (invalid inputs, file size limits)
- ✅ Rate Limiting (100 req/min validation)

#### Webhook Tests

```bash
# Start webhook test server
pnpm test:webhooks --secret="your-webhook-secret" --port=3002

# Test signature verification only
pnpm test:webhooks --verify-only --secret="your-webhook-secret"

# Auto-stop after timeout
pnpm test:webhooks --secret="test-secret" --timeout=60000
```

**Webhook Events**:
- `document_uploaded`: Document successfully stored
- `ocr_completed`: Text extraction finished
- `verification_completed`: Face verification done
- `kyc_status_changed`: Status updated

### SDK & Integration Examples

#### JavaScript/TypeScript Integration

```typescript
import axios from 'axios';

class KycClient {
  private client;

  constructor(apiKey: string, baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: { 'X-API-Key': apiKey }
    });
  }

  async createUser(userData: {
    userId: string;
    email: string;
    phone: string;
    name: string;
  }) {
    const response = await this.client.post('/v1/kyc/users', userData);
    return response.data;
  }

  async uploadDocument(userId: string, file: File, documentType: string) {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('documentType', documentType);

    const response = await this.client.post(
      `/v1/kyc/documents/upload/${userId}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  }

  async getStatus(userId: string) {
    const response = await this.client.get(`/v1/kyc/status/${userId}`);
    return response.data;
  }

  async triggerVerification(userId: string) {
    const response = await this.client.post(`/v1/kyc/verify/${userId}`);
    return response.data;
  }
}

// Usage
const kycClient = new KycClient('your-api-key', 'https://api.your-domain.com');

try {
  const user = await kycClient.createUser({
    userId: 'customer-123',
    email: 'customer@example.com',
    phone: '+919876543210',
    name: 'Customer Name'
  });
  console.log('User created:', user);
} catch (error) {
  console.error('API Error:', error.response?.data?.error);
}
```

#### cURL Examples

```bash
# Create user
curl -X POST "https://api.your-domain.com/v1/kyc/users" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "customer-123",
    "email": "customer@example.com",
    "phone": "+919876543210",
    "name": "Customer Name"
  }'

# Upload Aadhaar front
curl -X POST "https://api.your-domain.com/v1/kyc/documents/upload/customer-123" \
  -H "X-API-Key: your-api-key" \
  -F "document=@aadhaar-front.jpg" \
  -F "documentType=AADHAAR_FRONT"

# Check status
curl -X GET "https://api.your-domain.com/v1/kyc/status/customer-123" \
  -H "X-API-Key: your-api-key"

# Trigger verification
curl -X POST "https://api.your-domain.com/v1/kyc/verify/customer-123" \
  -H "X-API-Key: your-api-key"
```

## �🔮 Future Enhancements

- **DigiLocker Integration**: Fetch verified documents directly from DigiLocker API (eliminates manual uploads)
- **CVL KRA Submission**: Auto-submit verified KYC data to CVL KRA (Central KYC Registry)
- **Video KYC**: Live video call verification for high-value customers
- **Blink Detection**: Enhanced liveness detection (detect eye blinks)
- **Multi-language Support**: Internationalize UI (i18n)
- **Webhook Notifications**: Real-time status updates via webhooks
- **Analytics Dashboard**: Track verification rates, rejection reasons, avg processing time

## 🤝 Contributing

### Code Style

- **Backend**: Follow NestJS best practices (dependency injection, modules)
- **Frontend**: Use React hooks, avoid class components
- **TypeScript**: Enable `strict` mode, no `any` types
- **Formatting**: Prettier (single quotes, 2-space indent, 120 char line width)
- **Linting**: ESLint with recommended rules

### Commit Messages

Follow Conventional Commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Examples**:
```
feat(kyc): add Aadhaar front/back upload support
fix(ocr): improve PAN regex pattern for edge cases
docs(readme): update architecture diagram
```

### Pull Request Process

1. Create feature branch: `git checkout -b feat/your-feature-name`
2. Commit changes with conventional commit messages
3. Push to remote: `git push origin feat/your-feature-name`
4. Open PR against `main` branch
5. Ensure CI checks pass (linting, type checking, build)
6. Request review from team lead
7. Squash and merge after approval

## 📄 License

This project is proprietary software owned by EnxtAI. All rights reserved. Unauthorized copying, distribution, or use is strictly prohibited.

---

**Built with ❤️ by the EnxtAI Team**

For questions or support, contact: [support@enxtai.com](mailto:support@enxtai.com)

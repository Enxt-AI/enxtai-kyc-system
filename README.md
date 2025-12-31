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
    Frontend->>API: POST /api/kyc/upload/pan
    API->>Storage: Store in kyc-pan bucket
    API->>DB: Create/Update Submission (DOCUMENTS_UPLOADED)
    API-->>Frontend: Success + submissionId
    
    User->>Frontend: Upload Aadhaar Front/Back
    Frontend->>API: POST /api/kyc/upload/aadhaar
    API->>Storage: Store in kyc-aadhaar-cards bucket
    API->>DB: Update Submission
    API-->>Frontend: Success
    
    User->>Frontend: Capture Live Photo
    Frontend->>API: POST /api/kyc/upload/live-photo
    API->>Storage: Store in kyc-live-photos bucket
    API->>DB: Update Submission
    API-->>Frontend: Success
    
    User->>Frontend: Trigger Verification
    Frontend->>API: POST /api/kyc/verify/face
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
| POST | `/api/kyc/submission` | Create new KYC submission |
| GET | `/api/kyc/status/:userId` | Get KYC status with progress % |
| GET | `/api/kyc/submission/:userId` | Get full submission details |
| POST | `/api/kyc/upload/pan` | Upload PAN card image |
| POST | `/api/kyc/upload/aadhaar` | Upload Aadhaar front/back images |
| POST | `/api/kyc/upload/live-photo` | Upload live photo (selfie) |
| POST | `/api/kyc/verify/face` | Trigger face verification workflow |
| POST | `/api/kyc/extract/pan` | Extract PAN data via OCR |
| POST | `/api/kyc/extract/aadhaar` | Extract Aadhaar data via OCR |

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

## 🧪 Testing

### Manual Testing Flow

1. **Start KYC Process:**
   - Navigate to http://localhost:3000
   - Click "Start KYC"

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
   - Navigate to http://localhost:3000/admin
   - View pending reviews
   - Approve or reject with notes

### Database Inspection

```bash
# Access Prisma Studio (visual database browser)
cd apps/api
pnpm prisma studio
# Opens at http://localhost:5555
```

## 🐳 Deployment

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

## 🔮 Future Enhancements

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

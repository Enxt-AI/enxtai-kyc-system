# Documentation Implementation Guide

This document contains comprehensive JSDoc comments to be added to the KYC system codebase. 
All sections follow the detailed implementation plan provided.

## ✅ Completed Files

1. **apps/api/src/kyc/kyc.controller.ts** - Fully documented with class-level and method-level JSDoc
   - All HTTP endpoints documented (upload/pan, upload/aadhaar, upload/live-photo, verify/face, extract/pan, extract/aadhaar)
   - Fastify multipart stream handling explained
   - Request/response examples included

2. **apps/api/src/kyc/kyc.service.ts** - Partially documented (class-level, getOrCreateUser helper)
   - Needs: All public methods, helper methods, validation logic

## 📋 Remaining Implementation Tasks

### Backend Files

#### apps/api/src/kyc/kyc.service.ts (Continue from line 85)

Add JSDoc to remaining methods:

**getOrCreateSubmission()**
```typescript
/**
 * Get or Create Submission (Helper)
 * 
 * Auto-creates a KYC submission for a user if one doesn't already exist.
 * Always returns the most recent submission for the user.
 * 
 * @param userId - UUID v4 string
 * @returns KYCSubmission object (existing or newly created with PENDING status)
 * @private
 */
```

**createSubmission()**
```typescript
/**
 * Create KYC Submission
 * 
 * Public method to create a new KYC submission. Auto-creates the user if needed.
 * Called by frontend before starting document uploads.
 * 
 * @param userId - UUID v4 string
 * @returns Created submission with id, userId, status (PENDING), timestamps
 * @throws BadRequestException if userId is invalid
 */
```

**uploadPanDocument(), uploadAadhaarFront(), uploadAadhaarBack(), uploadLivePhotoDocument()**
```typescript
/**
 * Upload [Document Type]
 * 
 * Validates file (type, size, dimensions), buffers to memory, uploads to MinIO,
 * updates submission record with document URL. Auto-creates user/submission if needed.
 * 
 * **Validation Rules**:
 * - MIME: image/jpeg or image/png only
 * - Size: Max 5MB (MAX_FILE_SIZE constant)
 * - Dimensions: 300x300 to 8192x8192 pixels
 * 
 * @param userId - UUID v4 string
 * @param file - MultipartFile from Fastify (already buffered in controller)
 * @returns Updated KYCSubmission object
 * @throws BadRequestException if validation fails
 * @throws PayloadTooLargeException if file exceeds 5MB
 */
```

**verifyFaceAndUpdate()**
```typescript
/**
 * Verify Face and Update Submission
 * 
 * Core face verification logic. Downloads documents from MinIO, extracts faces,
 * computes similarity score, performs liveness detection, updates submission.
 * 
 * **Algorithm**:
 * 1. Download: Fetch live photo and reference photo (PAN → Aadhaar fallback)
 * 2. Extract Faces: Use face-api.js SSD MobileNet v1 detector
 * 3. Compute Descriptors: 128-dimensional face embeddings
 * 4. Calculate Distance: Euclidean distance (threshold: 0.6)
 * 5. Liveness Check: Basic landmark analysis (MVP)
 * 6. Combined Score: faceMatch * 0.7 + liveness * 0.3
 * 7. Decision: ≥80% → FACE_VERIFIED, <80% → PENDING_REVIEW
 * 
 * **Fallback Logic**:
 * - Prefers PAN document for face extraction (typically clearer photo)
 * - Falls back to Aadhaar front if PAN unavailable
 * - Fails if no reference photo found
 * 
 * @param submissionId - UUID of KYC submission
 * @returns Updated submission with faceMatchScore, livenessScore, internalStatus
 * @throws NotFoundException if submission/documents not found
 * @throws BadRequestException if no face detected in images
 */
```

**extractPanDataAndUpdate(), extractAadhaarDataAndUpdate()**
```typescript
/**
 * Extract [Document Type] Data and Update
 * 
 * Performs OCR using Tesseract.js. Preprocesses image (grayscale, normalize, sharpen),
 * extracts text, applies regex patterns to find structured data (PAN/Aadhaar numbers,
 * name, DOB, address), updates submission record.
 * 
 * **[Document Type] Patterns**:
 * - [List specific regex patterns]
 * - Confidence threshold: 60%
 * - [Any masking logic]
 * 
 * @param submissionId - UUID of KYC submission
 * @returns Updated submission with extracted fields
 * @throws NotFoundException if submission/document not found
 * @throws BadRequestException if OCR fails or no data extracted
 */
```

**calculateProgress()**
```typescript
/**
 * Calculate Progress Percentage
 * 
 * Maps internal status to progress percentage for UI display.
 * 
 * **Status → Progress Mapping**:
 * - PENDING: 0%
 * - DOCUMENTS_UPLOADED: 33%
 * - OCR_COMPLETED: 66%
 * - FACE_VERIFIED: 100%
 * - PENDING_REVIEW: 90%
 * - VERIFIED: 100%
 * - REJECTED: 100%
 * 
 * @param status - Current internal status
 * @returns Progress percentage (0-100)
 * @private
 */
```

**prepareFileBuffer()**
```typescript
/**
 * Prepare File Buffer (Helper)
 * 
 * Validates MIME type and file size, converts MultipartFile to Buffer.
 * 
 * @param file - MultipartFile from Fastify
 * @param allowedMimeTypes - Array of allowed MIME types
 * @returns Buffer of file contents
 * @throws BadRequestException if MIME type invalid
 * @throws PayloadTooLargeException if size > MAX_FILE_SIZE (5MB)
 * @private
 */
```

**validateImageDimensionsIfNeeded()**
```typescript
/**
 * Validate Image Dimensions (Helper)
 * 
 * Uses Sharp to extract image metadata and validate dimensions. Only runs for image/* MIME types.
 * 
 * **Dimension Rules**:
 * - Minimum: 300x300 pixels (lowered from 800x600 to support phone photos)
 * - Maximum: 8192x8192 pixels (increased from 4096x4096 for high-res scans)
 * 
 * @param mimetype - File MIME type
 * @param buffer - Image buffer
 * @throws BadRequestException if dimensions outside allowed range
 * @private
 */
```

#### apps/api/src/ocr/ocr.service.ts

Add class-level JSDoc and document all methods:

```typescript
/**
 * OCR Service
 * 
 * Handles Optical Character Recognition using Tesseract.js. Extracts text from
 * document images (PAN, Aadhaar) with preprocessing for improved accuracy.
 * 
 * **Preprocessing Pipeline** (Sharp):
 * 1. Grayscale conversion (removes color noise)
 * 2. Normalize (enhances contrast: stretch histogram to 1-99 percentiles)
 * 3. Sharpen (radius: 2, sigma: 1, M1: 2, M2: 1)
 * 4. Resize to 2000px width (optimal for Tesseract)
 * 
 * **Tesseract Configuration**:
 * - Language: English (eng)
 * - PSM (Page Segmentation Mode): 6 (single uniform block of text)
 * - OEM (OCR Engine Mode): 3 (default, legacy + LSTM)
 * 
 * @see https://github.com/tesseract-ocr/tesseract for Tesseract docs
 */
```

#### apps/api/src/storage/storage.service.ts

```typescript
/**
 * Storage Service
 * 
 * Handles all S3-compatible object storage operations using MinIO client.
 * Manages document upload/download, bucket lifecycle, encryption at rest.
 * 
 * **Bucket Structure**:
 * - kyc-pan: PAN card documents
 * - kyc-aadhaar-cards: Aadhaar front/back documents
 * - kyc-live-photos: User selfies for face verification
 * 
 * **Object Naming Convention**:
 * {userId}/{DOCUMENT_TYPE}_{timestamp}.{ext}
 * Example: 550e8400-e29b-41d4-a716-446655440000/PAN_CARD_1735552345678.jpg
 * 
 * **Security**:
 * - Encryption at rest: AES-256-SSE (Server-Side Encryption)
 * - Bucket policy: Private (no public access)
 * - Presigned URLs: 1-hour expiry for temporary access
 * 
 * @see https://min.io/docs/minio/linux/developers/javascript/API.html
 */
```

#### apps/api/src/face-recognition/face-recognition.service.ts

```typescript
/**
 * Face Recognition Service
 * 
 * Implements face detection, recognition, and liveness detection using face-api.js
 * (Vladimir Mandic's TypeScript port with TensorFlow.js backend).
 * 
 * **Models Loaded**:
 * 1. SSD MobileNet v1: Fast face detection (300x300 input)
 * 2. FaceLandmark68Net: 68-point facial landmark detection
 * 3. FaceRecognitionNet: 128-dimensional face descriptor extraction
 * 
 * **Face Matching Algorithm**:
 * 1. Detect faces in both images (live photo, ID document)
 * 2. Select largest face (primary subject)
 * 3. Extract 128-D descriptors (embeddings)
 * 4. Compute Euclidean distance: sqrt(sum((a[i] - b[i])^2))
 * 5. Convert to similarity: 1 - (distance / threshold)
 * 6. Threshold: 0.6 (distances <0.6 indicate same person)
 * 
 * **Liveness Detection (MVP)**:
 * - Basic landmark analysis (eye/nose/mouth triangle ratios)
 * - Future enhancement: Blink detection, head pose estimation
 * 
 * @see https://github.com/vladmandic/face-api
 */
```

#### apps/api/prisma/schema.prisma

Add model-level and field-level comments:

```prisma
/// User model - Stores user identity and aggregate KYC status
/// 
/// Fields:
/// - id: UUID v4 (client-generated for stateless uploads)
/// - email: User email (auto-generated for MVP: user-xxx@kyc-temp.local)
/// - phone: User phone (auto-generated for MVP: 999xxxxxxx)
/// - kycStatus: Aggregate status across all submissions (PENDING, IN_PROGRESS, VERIFIED, REJECTED)
/// - kycSubmissions: One-to-many relationship with KYCSubmission
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  phone         String?
  kycStatus     KYCStatus @default(PENDING)
  
  // Relationships
  kycSubmissions KYCSubmission[]
  auditLogs      AuditLog[]
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@map("users")
}

/// KYCSubmission model - Tracks individual KYC verification attempts
/// 
/// Workflow:
/// 1. Created with PENDING status
/// 2. Documents uploaded → DOCUMENTS_UPLOADED
/// 3. OCR extraction → OCR_COMPLETED (panNumber, aadhaarNumber, etc. populated)
/// 4. Face verification → FACE_VERIFIED (scores ≥80%) or PENDING_REVIEW (<80%)
/// 5. Admin review (if needed) → VERIFIED or REJECTED
/// 
/// Document URLs format: bucket/userId/DOCUMENT_TYPE_timestamp.ext
/// Example: kyc-pan/550e8400.../PAN_CARD_1735552345678.jpg
model KYCSubmission {
  id                      String   @id @default(uuid())
  userId                  String
  user                    User     @relation(fields: [userId], references: [id])
  
  // Document URLs (MinIO object paths)
  /// PAN card image URL (MinIO: kyc-pan bucket)
  panDocumentUrl          String?
  
  /// Aadhaar front side URL (contains photo) - MinIO: kyc-aadhaar-cards bucket
  aadhaarFrontUrl         String?
  
  /// Aadhaar back side URL (contains address) - MinIO: kyc-aadhaar-cards bucket
  aadhaarBackUrl          String?
  
  /// Legacy single Aadhaar image (kept for backward compatibility)
  aadhaarDocumentUrl      String?
  
  /// Live photo (selfie) URL for face verification - MinIO: kyc-live-photos bucket
  livePhotoUrl            String?
  
  // Extracted data from OCR
  /// PAN number (format: ABCDE1234F) - extracted via Tesseract.js
  panNumber               String?
  
  /// Aadhaar number (MASKED: only last 4 digits, e.g., "XXXX XXXX 1234") - UIDAI compliance
  aadhaarNumber           String?
  
  /// Full name from PAN/Aadhaar (merged if both available)
  fullName                String?
  
  /// Date of birth from PAN (format: YYYY-MM-DD)
  dateOfBirth             DateTime?
  
  /// Address from Aadhaar back side
  address                 String?
  
  // Verification scores (0-1 range, ≥0.8 for auto-approval)
  /// Face match score: similarity between live photo and ID document photo (threshold: 0.8)
  faceMatchScore          Float?
  
  /// Liveness score: basic landmark analysis (MVP - future: blink detection) (threshold: 0.8)
  livenessScore           Float?
  
  // Status tracking
  /// Internal workflow status (PENDING → DOCUMENTS_UPLOADED → OCR_COMPLETED → FACE_VERIFIED)
  internalStatus          InternalStatus @default(PENDING)
  
  /// Final status after admin review (null until reviewed)
  finalStatus             FinalStatus?
  
  /// Admin review notes (rejection reason, manual verification notes)
  reviewNotes             String?
  
  /// Timestamp when admin reviewed the submission
  reviewedAt              DateTime?
  
  // Future integrations
  /// CVL KRA submission flag (future feature)
  cvlKraSubmitted         Boolean @default(false)
  
  /// CVL KRA response status (future feature)
  cvlKraStatus            String?
  
  /// DigiLocker consent token (future feature)
  digilockerConsent       Boolean @default(false)
  
  /// Document source (MANUAL_UPLOAD or DIGILOCKER)
  documentSource          DocumentSource @default(MANUAL_UPLOAD)
  
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  
  @@index([userId])
  @@index([internalStatus])
  @@map("kyc_submissions")
}

/// AuditLog model - Immutable audit trail for compliance
/// 
/// Logs all KYC-related actions: document uploads, status changes, admin actions.
/// Used for compliance reporting and forensic analysis.
model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  
  /// Action type (e.g., KYC_DOCUMENT_UPLOAD, KYC_STATUS_CHANGE, ADMIN_APPROVAL)
  action    String
  
  /// JSON metadata (document type, old/new status, IP address, etc.)
  metadata  Json?
  
  createdAt DateTime @default(now())
  
  @@index([userId])
  @@index([action])
  @@map("audit_logs")
}

/// KYCStatus enum - User-level aggregate status
enum KYCStatus {
  PENDING       /// No submission or incomplete
  IN_PROGRESS   /// Documents uploaded, verification in progress
  VERIFIED      /// Successfully verified
  REJECTED      /// Rejected by system or admin
}

/// InternalStatus enum - Submission workflow states
enum InternalStatus {
  PENDING                /// Just created, no documents
  DOCUMENTS_UPLOADED     /// All required documents uploaded
  OCR_COMPLETED          /// Text extraction completed
  FACE_VERIFIED          /// Face match ≥80%, auto-approved
  PENDING_REVIEW         /// Face match <80%, needs admin review
}

/// FinalStatus enum - Terminal states after admin review
enum FinalStatus {
  VERIFIED   /// Admin approved
  REJECTED   /// Admin rejected or system failed
}

/// DocumentSource enum - How documents were obtained
enum DocumentSource {
  MANUAL_UPLOAD   /// User uploaded via web interface
  DIGILOCKER      /// Fetched from DigiLocker API (future)
}
```

### Frontend Files

#### apps/web/src/app/kyc/upload/page.tsx

```typescript
/**
 * KYC Document Upload Page
 * 
 * Main upload interface for KYC documents. Users upload PAN card, Aadhaar front, and
 * Aadhaar back in sequence. Progress indicator shows X/3 documents completed.
 * 
 * **User Flow**:
 * 1. Page loads → Generate stable userId using uuid v4 (useMemo)
 * 2. Upload PAN → Set panUploaded=true, store submissionId
 * 3. Upload Aadhaar Front → Set aadhaarFrontUploaded=true
 * 4. Upload Aadhaar Back → Set aadhaarBackUploaded=true
 * 5. All 3 uploaded → Enable "Continue to Live Photo" button
 * 6. Navigate to /kyc/photo page
 * 
 * **State Management**:
 * - userId: Generated once per mount, stable across re-renders (useMemo)
 * - submissionId: Set from first upload response, used for subsequent operations
 * - Upload flags: Track completion of each document type
 * 
 * **Auto-Creation**: Backend creates user/submission automatically on first upload
 * (no need for pre-creation API call)
 */
```

#### apps/web/src/components/DocumentUpload.tsx

```typescript
/**
 * DocumentUpload Component
 * 
 * Reusable drag-and-drop file upload component with preview, progress tracking,
 * and error handling. Supports single-file uploads for PAN, Aadhaar front/back.
 * 
 * **Features**:
 * - Drag-and-drop or click to select file
 * - Client-side preview using URL.createObjectURL
 * - Real-time upload progress (0-100%)
 * - File validation (type, size)
 * - Error display with API error message extraction
 * 
 * **Props**:
 * - documentType: 'PAN' | 'AADHAAR_FRONT' | 'AADHAAR_BACK'
 * - userId: UUID v4 (generated by parent)
 * - onUploadSuccess: Callback with MinIO document URL
 * - onUploadError: Callback with error message
 * - onSubmissionCreated: Callback with submissionId (first upload only)
 * 
 * **Validation**:
 * - MIME: image/jpeg, image/png, application/pdf
 * - Max size: 5MB (MAX_SIZE constant)
 * 
 * **Memory Management**: Properly cleans up object URLs via useEffect cleanup
 */
```

#### apps/web/src/components/WebcamCapture.tsx

```typescript
/**
 * WebcamCapture Component
 * 
 * Live photo capture using react-webcam with client-side face detection (pico.js).
 * Implements 5-second fallback if face detection fails to improve UX.
 * 
 * **Face Detection** (pico.js):
 * - Loads cascade from CDN (https://raw.githubusercontent.com/nenadmarkus/pico/master/rnt/cascades/facefinder)
 * - Runs detection loop every 500ms
 * - Displays "Face Detected ✓" when face found
 * - Times out after 5 seconds → allows capture without face
 * 
 * **Camera Permissions**:
 * - Requests getUserMedia on mount
 * - Shows error if permission denied
 * - Provides retry button
 * 
 * **Capture Flow**:
 * 1. Camera loads → setCameraReady(true)
 * 2. Face detected OR 5s timeout → Enable capture button
 * 3. User clicks capture → Generate base64 data URL
 * 4. Validate image (size, dimensions)
 * 5. Convert base64 → File object
 * 6. Call API (uploadLivePhoto)
 * 7. Navigate to /kyc/verify on success
 * 
 * **Image Validation**:
 * - Min dimensions: 800x600 (for face-api.js accuracy)
 * - Max size: 5MB
 * - Format: JPEG (converted from canvas)
 */
```

#### apps/web/src/lib/api-client.ts

```typescript
/**
 * API Client
 * 
 * Centralized Axios instance for all backend API calls. Configures base URL,
 * timeout, and error interceptor.
 * 
 * **Configuration**:
 * - Base URL: NEXT_PUBLIC_API_URL env var or http://localhost:3001
 * - Timeout: 15 seconds (OCR/face verification can be slow)
 * - Error Interceptor: Passthrough (can be enhanced for toast notifications)
 * 
 * **Functions**:
 * - uploadPanDocument(), uploadAadhaarFront(), uploadAadhaarBack(), uploadLivePhoto(): 
 *   Create FormData, set multipart/form-data header, track upload progress
 * - verifyFace(): Trigger face verification workflow
 * - getKycStatus(): Retrieve progress and status label
 * - Admin functions: getPendingReviews(), approveKycSubmission(), rejectKycSubmission()
 * 
 * **Error Handling**:
 * - Network errors: Caught by Axios interceptor
 * - API errors: Response includes { message: string, statusCode: number }
 * - Component responsibility: Extract error.response.data.message
 */
```

### README.md Enhancement

Create comprehensive README with:

1. **Project Overview** (100 words describing in-house KYC system)
2. **Architecture Diagram** (Mermaid - Frontend → API → MinIO/PostgreSQL/Redis)
3. **KYC Workflow Diagram** (Mermaid sequence diagram)
4. **Prerequisites** (Node 20, pnpm 8, Docker)
5. **Environment Variables** (table with API and Web vars)
6. **Installation Steps** (clone, install, docker-compose up, prisma migrate)
7. **Project Structure** (TurboRepo layout)
8. **API Endpoints** (table with method, path, description)
9. **Status Progression** (table mapping InternalStatus to progress %)
10. **Testing Instructions** (manual testing steps)
11. **Deployment** (Docker build, env configs)
12. **Future Enhancements** (DigiLocker, CVL KRA, video KYC)
13. **Contributing** (code style, commit messages)
14. **License** (to be determined)

## Implementation Priority

1. ✅ KYC Controller (COMPLETED)
2. ✅ KYC Service (partial - class-level COMPLETED)
3. 🔄 Complete KYC Service method documentation
4. OCR Service
5. Storage Service
6. Face Recognition Service
7. Prisma Schema
8. Frontend Upload Page
9. Frontend DocumentUpload Component
10. Frontend WebcamCapture Component
11. Frontend API Client
12. README.md
13. Admin Controller/Service
14. DTOs and minor files

## Notes

- All documentation follows standard JSDoc format
- Examples use realistic data (UUID v4, proper MIME types)
- Comments explain "why" not just "what"
- Business logic rationale included (thresholds, fallbacks, validations)
- Security considerations noted (Aadhaar masking, encryption)
- Future features clearly marked

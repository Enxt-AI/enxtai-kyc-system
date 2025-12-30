# Storage Service

A MinIO-backed storage module handling uploads, downloads, deletions, and presigned URL generation for KYC documents.

## Buckets
- pan-cards
- aadhaar-cards
- live-photos

Configure bucket names via env (defaults shown):
- `MINIO_PAN_BUCKET=pan-cards`
- `MINIO_AADHAAR_BUCKET=aadhaar-cards`
- `MINIO_LIVE_PHOTO_BUCKET=live-photos`

## Methods
- `uploadDocument(documentType, userId, file)`
- `downloadDocument(bucketName, objectName)`
- `deleteDocument(bucketName, objectName)`
- `generatePresignedUrl(bucketName, objectName, expirySeconds?)`

## Error Handling
Custom HttpExceptions for upload, download, delete, and presigned URL failures. All include bucket and object context.

## Security
- Buckets are auto-created with AES256 server-side encryption.
- Filenames are sanitized and namespaced per user with timestamps.
- Presigned URLs default to 1 hour expiry.

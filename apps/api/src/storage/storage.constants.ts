// DEPRECATED: These constants are no longer used for bucket names.
// Bucket names are now generated dynamically per-client: kyc-{clientId}-{suffix}
// Kept for backward compatibility with existing tests and documentation.
export const PAN_CARDS_BUCKET = 'pan-cards';
export const AADHAAR_CARDS_BUCKET = 'aadhaar-cards';
export const LIVE_PHOTOS_BUCKET = 'live-photos';
export const SIGNATURES_BUCKET = 'signatures';
export const ENCRYPTION_ALGORITHM = 'AES256';
export const PRESIGNED_URL_EXPIRY = 3600; // seconds (1 hour)
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

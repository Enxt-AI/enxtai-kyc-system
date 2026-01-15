/**
 * DigiLocker Integration Types
 *
 * Type definitions for DigiLocker OAuth 2.0 authentication and document fetching.
 * Shared between backend services and frontend components.
 */

/**
 * DigiLocker OAuth Token Response
 *
 * Returned by DigiLocker after successful authorization code exchange.
 * Tokens must be stored securely in database for subsequent API calls.
 */
export interface DigiLockerTokenResponse {
  access_token: string;      // Bearer token for API requests
  token_type: string;         // Always "Bearer"
  expires_in: number;         // Token lifetime in seconds (typically 3600)
  refresh_token?: string;     // Optional refresh token for token renewal
  scope: string;              // Granted scopes (space-separated)
}

/**
 * DigiLocker Document Metadata
 *
 * Represents a document available in user's DigiLocker account.
 */
export interface DigiLockerDocument {
  uri: string;                // Unique document identifier
  name: string;               // Document name (e.g., "PAN Card")
  type: string;               // Document type (e.g., "PANCR", "ADHAR")
  size: string;               // File size (e.g., "245KB")
  date: string;               // Issue date (ISO 8601)
  issuer: string;             // Issuing authority (e.g., "Income Tax Department")
}

/**
 * DigiLocker Aadhaar XML Data
 *
 * Parsed demographic data from Aadhaar XML response.
 */
export interface DigiLockerAadhaarData {
  uid: string;                // Aadhaar number (masked)
  name: string;               // Full name
  dob: string;                // Date of birth (DD-MM-YYYY)
  gender: string;             // Gender (M/F/O)
  address: {
    house?: string;
    street?: string;
    landmark?: string;
    locality?: string;
    vtc?: string;             // Village/Town/City
    district?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  photo?: string;             // Base64 encoded photo
}

/**
 * DigiLocker API Error Response
 *
 * Standard error format from DigiLocker API.
 */
export interface DigiLockerError {
  error: string;              // Error code (e.g., "invalid_grant")
  error_description: string;  // Human-readable error message
}

/**
 * DigiLocker Document List Response
 *
 * Response from DigiLocker /files/issued endpoint.
 * Contains array of documents available in user's account.
 */
export interface DigiLockerDocumentListResponse {
  files: DigiLockerDocument[];  // Array of available documents
}

/**
 * DigiLocker File Download Response
 *
 * Response from DigiLocker /file endpoint.
 * Contains the actual document file data and metadata.
 */
export interface DigiLockerFileDownloadResponse {
  data: Buffer;               // File binary data
  contentType: string;        // MIME type (e.g., "application/pdf")
  filename?: string;          // Optional filename from Content-Disposition
  contentLength?: number;     // File size in bytes
}
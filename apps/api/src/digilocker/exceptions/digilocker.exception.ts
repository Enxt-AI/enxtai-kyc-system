import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * DigiLocker Error Codes
 *
 * Centralized error codes for DigiLocker operations.
 * Used in exception context to provide structured error information.
 */
export enum DigiLockerErrorCode {
  // Authentication & Authorization
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  AUTHORIZATION_DENIED = 'AUTHORIZATION_DENIED',

  // API Errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  API_CONNECTION_FAILED = 'API_CONNECTION_FAILED',

  // Document Operations
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  DOCUMENT_ACCESS_DENIED = 'DOCUMENT_ACCESS_DENIED',

  // Data Processing
  DATA_EXTRACTION_FAILED = 'DATA_EXTRACTION_FAILED',
  XML_PARSING_FAILED = 'XML_PARSING_FAILED',

  // Storage Operations
  STORAGE_UPLOAD_FAILED = 'STORAGE_UPLOAD_FAILED',
  STORAGE_CONNECTION_FAILED = 'STORAGE_CONNECTION_FAILED',

  // Validation
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_STATE = 'INVALID_STATE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
}

/**
 * DigiLocker Exception
 *
 * Custom exception for DigiLocker API errors.
 * Provides consistent error handling across DigiLocker operations.
 *
 * @remarks
 * **Error Scenarios**:
 * - OAuth authorization failures (invalid_grant, access_denied)
 * - Token exchange failures (invalid_client, invalid_code)
 * - API request failures (network errors, rate limits)
 * - Document fetch failures (document not found, access denied)
 *
 * **HTTP Status Codes**:
 * - 401: Authentication failures (invalid credentials)
 * - 403: Authorization failures (insufficient permissions)
 * - 404: Document not found
 * - 429: Rate limit exceeded
 * - 500: Internal DigiLocker API errors
 */
export class DigiLockerException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly context?: Record<string, any>
  ) {
    super(
      {
        statusCode,
        message: `DigiLocker Error: ${message}`,
        context,
      },
      statusCode
    );
  }
}
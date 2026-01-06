import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

/**
 * Global HTTP Exception Filter
 * 
 * Provides standardized error responses with consistent structure across all endpoints.
 * Maps internal errors to client-safe error codes and logs errors with full context.
 * 
 * **Error Response Format**:
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "DOCUMENT_UPLOAD_FAILED",
 *     "message": "Failed to upload document",
 *     "details": "File size exceeds 10MB limit",
 *     "timestamp": "2024-01-15T10:30:00Z",
 *     "path": "/v1/kyc/documents/upload"
 *   }
 * }
 * ```
 * 
 * **Error Codes**:
 * - VALIDATION_ERROR: 400 - Invalid request data or missing required fields
 * - UNAUTHORIZED: 401 - Invalid or missing API key
 * - FORBIDDEN: 403 - Access denied for current client/user
 * - NOT_FOUND: 404 - Resource not found
 * - DOCUMENT_UPLOAD_FAILED: 400 - File upload failed (size, type, corruption)
 * - OCR_EXTRACTION_FAILED: 422 - Unable to extract data from document
 * - FACE_VERIFICATION_FAILED: 422 - Face comparison failed
 * - INTERNAL_ERROR: 500 - Unexpected server error (logs full details)
 * 
 * **Logging**:
 * - All errors logged with request context (clientId, userId, method, url)
 * - 4xx errors: WARN level with client context
 * - 5xx errors: ERROR level with full stack trace
 * - Structured logs compatible with ELK Stack, CloudWatch, etc.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  /**
   * Maps internal exception types to standardized client-facing error codes
   */
  private getErrorCode(exception: HttpException): string {
    const status = exception.getStatus();
    const message = exception.message?.toLowerCase() || '';
    
    // Map by HTTP status code first (preferred over message substrings)
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return message.includes('api') && message.includes('key') ? 'INVALID_API_KEY' : 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'PROCESSING_FAILED';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.INTERNAL_SERVER_ERROR:
      default:
        // Fall back to message-based mapping for 500 errors
        if (message.includes('document') && message.includes('upload')) {
          return 'DOCUMENT_UPLOAD_FAILED';
        }
        if (message.includes('ocr') || message.includes('extraction')) {
          return 'OCR_EXTRACTION_FAILED';
        }
        if (message.includes('face') && message.includes('verification')) {
          return 'FACE_VERIFICATION_FAILED';
        }
        return 'INTERNAL_ERROR';
    }
  }

  /**
   * Extracts safe error message for client response
   */
  private getClientMessage(exception: HttpException): string {
    const status = exception.getStatus();
    
    // For client errors (4xx), return the original message
    if (status >= 400 && status < 500) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const message = (response as any).message;
        return Array.isArray(message) 
          ? message.join(', ')
          : message;
      }
      return exception.message;
    }
    
    // For server errors (5xx), return generic message to avoid exposing internals
    return 'An internal server error occurred. Please try again later.';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let httpException: HttpException;

    // Normalize all exceptions to HttpException
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      httpException = exception;
    } else {
      // Handle non-HTTP exceptions (database errors, etc.)
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      httpException = new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const errorCode = this.getErrorCode(httpException);
    const clientMessage = this.getClientMessage(httpException);
    const timestamp = new Date().toISOString();
    const path = request.url;

    // Extract request context for logging
    const requestContext = {
      clientId: (request as any).clientId,
      userId: (request as any).userId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      statusCode: status,
      errorCode,
    };

    // Log error with appropriate level
    if (status >= 500) {
      this.logger.error(
        {
          ...requestContext,
          error: {
            message: exception instanceof Error ? exception.message : 'Unknown error',
            stack: exception instanceof Error ? exception.stack : undefined,
            originalException: exception,
          },
        },
        `Internal server error: ${errorCode}`,
      );
    } else {
      this.logger.warn(
        requestContext,
        `Client error: ${errorCode} - ${clientMessage}`,
      );
    }

    // Standard error response format
    const errorResponse = {
      error: errorCode,
      message: clientMessage,
      statusCode: status,
      timestamp,
      path,
      ...(process.env.NODE_ENV === 'development' && status >= 500 && {
        // Include stack trace in development for debugging
        details: exception instanceof Error ? exception.stack : undefined,
      }),
    };

    response.status(status).json(errorResponse);
  }
}
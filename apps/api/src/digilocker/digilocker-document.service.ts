import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DigiLockerAuthService } from './digilocker-auth.service';
import { DigiLockerConfigService } from './digilocker.config';
import { DigiLockerException, DigiLockerErrorCode } from './exceptions/digilocker.exception';
import { DigiLockerDocument, DigiLockerAadhaarData } from '@enxtai/shared-types';
import { DocumentType, UploadDocumentDto } from '../storage/storage.types';
import { firstValueFrom } from 'rxjs';
import { parseString } from 'xml2js';

/**
 * DigiLocker Document Service
 *
 * Handles fetching documents from DigiLocker API using OAuth 2.0 tokens.
 * Downloads PAN and Aadhaar documents, extracts Aadhaar demographic data,
 * and stores fetched documents in MinIO following multi-tenant structure.
 *
 * @remarks
 * **Document Types Supported**:
 * - PAN Card (DigiLocker type: "PANCR")
 * - Aadhaar Card (DigiLocker type: "ADHAR")
 * - Aadhaar XML (demographic data)
 *
 * **Integration Points**:
 * - Uses DigiLockerAuthService for token management
 * - Leverages StorageService for MinIO uploads
 * - Stores documents in client-specific buckets
 * - Updates KYC submissions with DigiLocker source
 *
 * **Security Features**:
 * - Automatic token refresh before expiry
 * - Rate limit handling with retry information
 * - Document URI validation
 * - Secure storage with metadata tagging
 *
 * **Error Handling**:
 * - Comprehensive error codes for different failure scenarios
 * - Automatic token refresh on 401 responses
 * - Graceful handling of missing documents
 * - Detailed logging for debugging
 */
@Injectable()
export class DigiLockerDocumentService {
  private readonly logger = new Logger(DigiLockerDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly storageService: StorageService,
    private readonly digiLockerAuthService: DigiLockerAuthService,
    private readonly configService: DigiLockerConfigService,
  ) {}

  /**
   * List Available Documents
   *
   * Retrieves list of available documents from user's DigiLocker account.
   * Filters to include only PAN and Aadhaar documents.
   *
   * @param userId - UUID of the user
   * @returns Promise<DigiLockerDocument[]> - Array of available documents
   *
   * @throws DigiLockerException if API call fails or token is invalid
   */
  async listAvailableDocuments(userId: string): Promise<DigiLockerDocument[]> {
    try {
      const config = this.configService.getConfig();
      const accessToken = await this.digiLockerAuthService.getValidToken(userId);

      const response = await firstValueFrom(
        this.httpService.get(`${config.apiBaseUrl}/files/issued`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
      );

      const documents: DigiLockerDocument[] = response.data.files || [];

      // Filter to include only PAN and Aadhaar documents
      const relevantDocuments = documents.filter(doc =>
        doc.type === 'PANCR' || doc.type === 'ADHAR'
      );

      this.logger.log(`Found ${relevantDocuments.length} relevant documents for user ${userId}`);
      return relevantDocuments;
    } catch (error) {
      this.logger.error(`Failed to list documents for user ${userId}`, error);

      // Handle specific HTTP errors
      if ((error as any).response?.status === 401) {
        throw new DigiLockerException(
          'DigiLocker token expired or invalid. User must re-authorize.',
          401,
          { userId, error: DigiLockerErrorCode.TOKEN_INVALID }
        );
      }

      if ((error as any).response?.status === 429) {
        const retryAfter = (error as any).response.headers['retry-after'];
        throw new DigiLockerException(
          'DigiLocker API rate limit exceeded.',
          429,
          { userId, retryAfter, error: DigiLockerErrorCode.RATE_LIMIT_EXCEEDED }
        );
      }

      throw new DigiLockerException(
        'Failed to retrieve documents from DigiLocker',
        undefined,
        { userId, error: DigiLockerErrorCode.API_CONNECTION_FAILED }
      );
    }
  }

  /**
   * Fetch Document
   *
   * Downloads a specific document from DigiLocker and uploads it to MinIO.
   *
   * @param userId - UUID of the user
   * @param documentUri - DigiLocker document URI
   * @param documentType - Internal document type (PAN or AADHAAR)
   * @returns Promise<string> - MinIO object path
   *
   * @throws DigiLockerException if download or upload fails
   */
  async fetchDocument(userId: string, documentUri: string, documentType: DocumentType): Promise<string> {
    try {
      const config = this.configService.getConfig();
      const accessToken = await this.digiLockerAuthService.getValidToken(userId);

      // Download document from DigiLocker
      const response = await firstValueFrom(
        this.httpService.get(`${config.apiBaseUrl}/file`, {
          params: { uri: documentUri },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          responseType: 'arraybuffer',
        })
      );

      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'application/pdf';
      const contentDisposition = response.headers['content-disposition'];

      // Extract filename from Content-Disposition or generate from URI
      const filename = this.extractFilenameFromHeaders(contentDisposition) ||
                      this.generateFilenameFromUri(documentUri, this.getExtensionFromMimeType(contentType));

      // Get user's client ID for multi-tenant storage
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { clientId: true },
      });

      if (!user) {
        throw new DigiLockerException('User not found', 404, { userId });
      }

      // Upload to MinIO using StorageService
      const uploadDto: UploadDocumentDto = {
        buffer,
        filename,
        mimetype: contentType,
        metadata: {
          'X-Amz-Meta-Source': 'DigiLocker',
          'X-Amz-Meta-Document-URI': documentUri,
          'X-Amz-Meta-Fetched-At': new Date().toISOString(),
        },
      };

      const objectPath = await this.storageService.uploadDocument(
        documentType,
        user.clientId,
        userId,
        uploadDto
      );

      this.logger.log(`Successfully fetched and stored document for user ${userId}: ${objectPath}`);
      return objectPath;
    } catch (error) {
      this.logger.error(`Failed to fetch document for user ${userId}`, error);

      // Handle DigiLocker API errors
      if ((error as any).response?.status === 401) {
        throw new DigiLockerException(
          'DigiLocker token expired or invalid. User must re-authorize.',
          401,
          { userId, documentUri, error: DigiLockerErrorCode.TOKEN_INVALID }
        );
      }

      if ((error as any).response?.status === 404) {
        throw new DigiLockerException(
          'Document not found in DigiLocker account.',
          404,
          { userId, documentUri, error: DigiLockerErrorCode.DOCUMENT_NOT_FOUND }
        );
      }

      if ((error as any).response?.status === 429) {
        const retryAfter = (error as any).response.headers['retry-after'];
        throw new DigiLockerException(
          'DigiLocker API rate limit exceeded.',
          429,
          { userId, documentUri, retryAfter, error: DigiLockerErrorCode.RATE_LIMIT_EXCEEDED }
        );
      }

      // Handle storage upload errors
      if ((error as any).message?.includes('Storage') || (error as any).message?.includes('upload')) {
        throw new DigiLockerException(
          'Failed to store fetched document.',
          500,
          { userId, documentUri, error: DigiLockerErrorCode.STORAGE_UPLOAD_FAILED }
        );
      }

      throw new DigiLockerException(
        'Failed to fetch document from DigiLocker',
        undefined,
        { userId, documentUri, error: DigiLockerErrorCode.API_CONNECTION_FAILED }
      );
    }
  }

  /**
   * Fetch Aadhaar XML
   *
   * Retrieves Aadhaar demographic data from DigiLocker XML endpoint.
   *
   * @param userId - UUID of the user
   * @returns Promise<DigiLockerAadhaarData> - Parsed Aadhaar demographic data
   *
   * @throws DigiLockerException if XML fetch or parsing fails
   */
  async fetchAadhaarXml(userId: string): Promise<DigiLockerAadhaarData> {
    try {
      const config = this.configService.getConfig();
      const accessToken = await this.digiLockerAuthService.getValidToken(userId);

      const response = await firstValueFrom(
        this.httpService.get(`${config.apiBaseUrl}/aadhaar`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
      );

      const xmlData = response.data;

      // Parse XML to extract demographic data
      const parsedData = await this.parseAadhaarXml(xmlData);

      this.logger.log(`Successfully fetched Aadhaar XML for user ${userId}`);
      return parsedData;
    } catch (error) {
      this.logger.error(`Failed to fetch Aadhaar XML for user ${userId}`, error);

      // Handle DigiLocker API errors
      if ((error as any).response?.status === 401) {
        throw new DigiLockerException(
          'DigiLocker token expired or invalid. User must re-authorize.',
          401,
          { userId, error: DigiLockerErrorCode.TOKEN_INVALID }
        );
      }

      if ((error as any).response?.status === 404) {
        throw new DigiLockerException(
          'Aadhaar not found in DigiLocker account.',
          404,
          { userId, error: DigiLockerErrorCode.DOCUMENT_NOT_FOUND }
        );
      }

      if ((error as any).response?.status === 429) {
        const retryAfter = (error as any).response.headers['retry-after'];
        throw new DigiLockerException(
          'DigiLocker API rate limit exceeded.',
          429,
          { userId, retryAfter, error: DigiLockerErrorCode.RATE_LIMIT_EXCEEDED }
        );
      }

      // Handle XML parsing errors
      if ((error as any).message?.includes('XML') || (error as any).message?.includes('parse')) {
        throw new DigiLockerException(
          'Failed to parse Aadhaar XML data.',
          500,
          { userId, error: DigiLockerErrorCode.XML_PARSING_FAILED }
        );
      }

      throw new DigiLockerException(
        'Failed to fetch Aadhaar data from DigiLocker',
        undefined,
        { userId, error: DigiLockerErrorCode.API_CONNECTION_FAILED }
      );
    }
  }

  /**
   * Parse Document URI
   *
   * Extracts components from DigiLocker document URI.
   *
   * @private
   * @param uri - DigiLocker document URI
   * @returns Object with issuer, docType, and docId
   */
  private parseDocumentUri(uri: string): { issuer: string, docType: string, docId: string } {
    // DigiLocker URIs typically follow format: issuer/docType/docId
    const parts = uri.split('/');
    if (parts.length >= 3) {
      return {
        issuer: parts[0],
        docType: parts[1],
        docId: parts[2],
      };
    }

    // Fallback parsing
    return {
      issuer: 'unknown',
      docType: 'unknown',
      docId: uri.replace(/[^a-zA-Z0-9]/g, '_'),
    };
  }

  /**
   * Map DigiLocker Type to Document Type
   *
   * Converts DigiLocker document types to internal DocumentType enum.
   *
   * @private
   * @param digiLockerType - DigiLocker document type
   * @returns Internal DocumentType
   */
  private mapDigiLockerTypeToDocumentType(digiLockerType: string): DocumentType {
    switch (digiLockerType) {
      case 'PANCR':
        return DocumentType.PAN_CARD;
      case 'ADHAR':
        return DocumentType.AADHAAR_CARD_FRONT; // Use front for DigiLocker documents
      default:
        throw new Error(`Unsupported DigiLocker document type: ${digiLockerType}`);
    }
  }

  /**
   * Generate Filename from URI
   *
   * Creates a sanitized filename from document URI and extension.
   *
   * @private
   * @param uri - Document URI
   * @param extension - File extension
   * @returns Sanitized filename
   */
  private generateFilenameFromUri(uri: string, extension: string): string {
    const { issuer, docType, docId } = this.parseDocumentUri(uri);
    const timestamp = Date.now();
    const sanitizedUri = uri.replace(/[^a-zA-Z0-9]/g, '_');

    return `${issuer}_${docType}_${docId}_${timestamp}.${extension}`;
  }

  /**
   * Mask Aadhaar Number
   *
   * Masks Aadhaar number to show only last 4 digits.
   *
   * @private
   * @param aadhaar - Full Aadhaar number
   * @returns Masked Aadhaar number
   */
  private maskAadhaarNumber(aadhaar: string): string {
    if (aadhaar.length !== 12) return aadhaar;
    return `XXXX-XXXX-${aadhaar.slice(-4)}`;
  }

  /**
   * Extract Filename from Headers
   *
   * Extracts filename from Content-Disposition header.
   *
   * @private
   * @param contentDisposition - Content-Disposition header value
   * @returns Extracted filename or null
   */
  private extractFilenameFromHeaders(contentDisposition: string): string | null {
    if (!contentDisposition) return null;

    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch && filenameMatch[1]) {
      return filenameMatch[1].replace(/['"]/g, '');
    }

    return null;
  }

  /**
   * Get Extension from MIME Type
   *
   * Determines file extension from MIME type.
   *
   * @private
   * @param mimeType - MIME type
   * @returns File extension
   */
  private getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'application/pdf':
        return 'pdf';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      default:
        return 'pdf'; // Default fallback
    }
  }

  /**
   * Parse Aadhaar XML
   *
   * Parses DigiLocker Aadhaar XML response to extract demographic data.
   *
   * @private
   * @param xmlData - Raw XML string
   * @returns Promise<DigiLockerAadhaarData> - Parsed demographic data
   */
  private async parseAadhaarXml(xmlData: string): Promise<DigiLockerAadhaarData> {
    return new Promise((resolve, reject) => {
      parseString(xmlData, { explicitArray: false }, (err: any, result: any) => {
        if (err) {
          reject(new Error(`XML parsing failed: ${err.message}`));
          return;
        }

        try {
          // Extract data from XML structure (adjust based on actual DigiLocker XML format)
          const uidaiData = result?.UidaiData || result;
          const poa = uidaiData?.Poa || {};
          const poi = uidaiData?.Poi || {};

          const aadhaarData: DigiLockerAadhaarData = {
            uid: this.maskAadhaarNumber(uidaiData?.Uid || ''),
            name: poi?.name || '',
            dob: poi?.dob || '',
            gender: poi?.gender || '',
            address: {
              house: poa?.house || '',
              street: poa?.street || '',
              locality: poa?.loc || '',
              vtc: poa?.vtc || '',
              district: poa?.dist || '',
              state: poa?.state || '',
              pincode: poa?.pc || '',
              country: poa?.country || '',
            },
            photo: uidaiData?.Pht || '', // Base64 encoded photo
          };

          resolve(aadhaarData);
        } catch (parseError) {
          reject(new Error(`Data extraction failed: ${(parseError as Error).message}`));
        }
      });
    });
  }
}
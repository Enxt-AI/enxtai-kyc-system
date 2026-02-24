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

  private getAlternateDocumentsBaseUrl(primary: string): string | null {
    try {
      const url = new URL(primary);
      if (url.hostname.includes('meripehchaan.gov.in')) {
        url.hostname = 'api.digitallocker.gov.in';
        return url.toString().replace(/\/$/, '');
      }
      if (url.hostname.includes('api.digitallocker.gov.in')) {
        url.hostname = 'digilocker.meripehchaan.gov.in';
        return url.toString().replace(/\/$/, '');
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeIssuedDocuments(payload: any): DigiLockerDocument[] {
    if (!payload) return [];

    // Common shapes seen across DigiLocker docs / implementations.
    // Note: XML parsing is handled before calling this.
    const candidates = [
      payload.files,
      payload.files?.file,
      payload.Files,
      payload.Files?.file,
      payload.file,
      payload.items,
      payload.documents,
      payload.issued?.files,
      payload.issued?.items,
      payload?.Files,
      payload?.Issued?.Files,
    ];

    const firstArray = candidates.find((c) => Array.isArray(c));
    return (firstArray || []) as DigiLockerDocument[];
  }

  private parseXml(xml: string): Promise<any> {
    return new Promise((resolve, reject) => {
      parseString(
        xml,
        {
          explicitArray: false,
          ignoreAttrs: false,
          trim: true,
          mergeAttrs: true,
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        },
      );
    });
  }

  private normalizeIssuedDocumentsFromXml(parsed: any): DigiLockerDocument[] {
    if (!parsed) return [];

    // Heuristic: locate a "file"/"files" node and normalize to an array.
    const possibleFilesNode =
      parsed?.files ||
      parsed?.Files ||
      parsed?.response?.files ||
      parsed?.response?.Files ||
      parsed?.issued?.files ||
      parsed?.Issued?.Files ||
      parsed?.Issued ||
      parsed?.response;

    const fileNode = possibleFilesNode?.file || possibleFilesNode?.File || possibleFilesNode;
    if (!fileNode) return [];

    const asArray = Array.isArray(fileNode) ? fileNode : fileNode.file ? (Array.isArray(fileNode.file) ? fileNode.file : [fileNode.file]) : [fileNode];
    return asArray as DigiLockerDocument[];
  }

  private isRelevantIssuedDoc(doc: any): boolean {
    const t = this.extractIssuedDocType(doc);
    // PAN and Aadhaar vary by partner/integration.
    return t === 'PANCR' || t === 'PAN' || t === 'ADHAR' || t === 'AADHAAR' || t === 'ADHAAR';
  }

  private extractIssuedDocType(doc: any): string {
    // DigiLocker "issued" entries often have a generic type like "FILE" and the real
    // document code lives in `doctype`/`docType` (e.g., PANCR, ADHAR).
    const raw =
      doc?.doctype ??
      doc?.docType ??
      doc?.doc_type ??
      doc?.documentType ??
      doc?.document_type ??
      doc?.type ??
      doc?.id ??
      '';
    return String(raw).toUpperCase();
  }

  private extractIssuedDocUri(doc: any): string {
    const raw =
      doc?.uri ??
      doc?.URI ??
      doc?.docUri ??
      doc?.documentUri ??
      doc?.document_uri ??
      '';
    return String(raw);
  }

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

      const fetchIssued = async (baseUrl: string) => {
        const url = `${baseUrl.replace(/\/$/, '')}/files/issued`;
        const response = await firstValueFrom(
          this.httpService.get(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
        );
        return { url, payload: response.data, contentType: response.headers?.['content-type'] as string | undefined };
      };

      const primaryBase = config.documentsUrl.replace(/\/$/, '');
      const primary = await fetchIssued(primaryBase);

      const coercePayload = async (payload: any, contentType?: string) => {
        if (payload == null) return null;
        if (typeof payload !== 'string') return payload;

        const trimmed = payload.trim();

        // If API is returning HTML (often a login/error page), keep as string for later debug.
        if (contentType?.includes('text/html')) {
          return payload;
        }

        // JSON string
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            return JSON.parse(payload);
          } catch {
            return payload;
          }
        }

        // XML
        if (trimmed.startsWith('<')) {
          try {
            return await this.parseXml(payload);
          } catch {
            return payload;
          }
        }

        return payload;
      };

      const primaryCoerced = await coercePayload(primary.payload, primary.contentType);

      let documents: DigiLockerDocument[] = [];
      if (typeof primaryCoerced === 'string') {
        documents = [];
      } else if (primaryCoerced && (primaryCoerced as any).$) {
        // xml2js root sometimes has "$" attrs; still try xml normalization
        documents = this.normalizeIssuedDocumentsFromXml(primaryCoerced);
      } else {
        documents = this.normalizeIssuedDocuments(primaryCoerced);
        if (documents.length === 0) {
          // Might still be XML-ish object
          documents = this.normalizeIssuedDocumentsFromXml(primaryCoerced);
        }
      }

      // If the list is empty, try the alternate DigiLocker host once.
      if (documents.length === 0) {
        const altBase = this.getAlternateDocumentsBaseUrl(primaryBase);
        if (altBase && altBase !== primaryBase) {
          const alt = await fetchIssued(altBase);
          const altCoerced = await coercePayload(alt.payload, alt.contentType);
          let altDocs: DigiLockerDocument[] = [];
          if (typeof altCoerced === 'string') {
            altDocs = [];
          } else {
            altDocs = this.normalizeIssuedDocuments(altCoerced);
            if (altDocs.length === 0) altDocs = this.normalizeIssuedDocumentsFromXml(altCoerced);
          }
          if (altDocs.length > 0) {
            this.logger.warn(
              `Issued-documents endpoint returned empty on primary base; using alternate base (count=${altDocs.length})`
            );
            documents = altDocs;
          }
        }
      }

      // Filter to include only PAN and Aadhaar documents
      const relevantDocuments = documents.filter((doc) => this.isRelevantIssuedDoc(doc));

      // Helpful debug info (no tokens/URIs)
      const types = Array.from(
        new Set(documents.map((d: any) => this.extractIssuedDocType(d)))
      ).slice(0, 20);
      this.logger.debug(
        `DigiLocker issued-documents raw counts total=${documents.length} relevant=${relevantDocuments.length} types=${types.join('|') || '(none)'} contentType=${primary.contentType || '(unknown)'} base=${primaryBase}`
      );

      if (documents.length > 0) {
        const sample = documents[0] as any;
        const sampleKeys = Object.keys(sample || {}).slice(0, 30);
        this.logger.debug(
          `DigiLocker issued-documents sample keys=${sampleKeys.join('|') || '(none)'} extractedType=${this.extractIssuedDocType(sample) || '(none)'} hasUri=${Boolean(this.extractIssuedDocUri(sample))}`
        );
      }

      // If we got a non-JSON response, log a tiny hint for debugging.
      if (typeof primaryCoerced === 'string') {
        const snippet = primaryCoerced.trim().slice(0, 80).replace(/\s+/g, ' ');
        this.logger.warn(
          `DigiLocker issued-documents response was not JSON/XML (contentType=${primary.contentType || '(unknown)'}): "${snippet}"`
        );
      }

      this.logger.log(`Found ${relevantDocuments.length} relevant documents for user ${userId}`);
      return relevantDocuments;
    } catch (error) {
      if (error instanceof DigiLockerException) {
        throw error;
      }

      const status = (error as any)?.response?.status;
      const data = (error as any)?.response?.data;
      const axiosCode = (error as any)?.code;
      const axiosMessage = (error as any)?.message;
      const requestUrl = (error as any)?.config?.url;

      this.logger.error(`Failed to list documents for user ${userId}`, {
        status,
        data,
        axiosCode,
        axiosMessage,
        requestUrl,
      });

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

      const normalizedUri = String(documentUri || '').trim();
      if (!normalizedUri) {
        throw new DigiLockerException('DigiLocker document URI missing', 400, { userId, error: DigiLockerErrorCode.INVALID_REQUEST });
      }

      const isUriMissingError = (error: any): boolean => {
        const status = error?.response?.status;
        if (status !== 400) return false;

        const data = error?.response?.data;
        try {
          if (!data) return false;
          if (typeof data === 'string') {
            return data.includes('uri_missing');
          }
          if (Buffer.isBuffer(data)) {
            return data.toString('utf8').includes('uri_missing');
          }
          if (data && typeof data === 'object') {
            return data.error === 'uri_missing' || data.error_description?.includes('URI parameter missing');
          }
        } catch {
          return false;
        }
        return false;
      };

      // DigiLocker /file endpoint - try multiple strategies as implementations vary
      const downloadFrom = async (baseUrl: string) => {
        const base = baseUrl.replace(/\/$/, '');
        const strategies: Array<{ name: string; request: () => ReturnType<typeof firstValueFrom> }> = [
          // Strategy 1: GET with query parameter (standard OAuth resource endpoint)
          {
            name: 'GET ?uri=',
            request: () => firstValueFrom(
              this.httpService.get(`${base}/file?uri=${encodeURIComponent(normalizedUri)}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                responseType: 'arraybuffer',
              })
            ),
          },
          // Strategy 2: GET with URI as path segment (some DigiLocker docs show this)
          {
            name: 'GET /file/{uri}',
            request: () => firstValueFrom(
              this.httpService.get(`${base}/file/${encodeURIComponent(normalizedUri)}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                responseType: 'arraybuffer',
              })
            ),
          },
          // Strategy 3: POST with JSON body
          {
            name: 'POST JSON body',
            request: () => firstValueFrom(
              this.httpService.post(`${base}/file`, { uri: normalizedUri }, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer',
              })
            ),
          },
          // Strategy 4: POST with form-urlencoded body
          {
            name: 'POST form-urlencoded',
            request: () => firstValueFrom(
              this.httpService.post(`${base}/file`, new URLSearchParams({ uri: normalizedUri }).toString(), {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                responseType: 'arraybuffer',
              })
            ),
          },
          // Strategy 5: GET with URI in custom header
          {
            name: 'GET X-Digilocker-Uri header',
            request: () => firstValueFrom(
              this.httpService.get(`${base}/file`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'X-Digilocker-Uri': normalizedUri,
                },
                responseType: 'arraybuffer',
              })
            ),
          },
        ];

        let lastError: any = null;
        for (const strategy of strategies) {
          try {
            this.logger.debug(`Trying DigiLocker file download strategy: ${strategy.name} (uri=${normalizedUri})`);
            const response = await strategy.request();
            this.logger.log(`DigiLocker file download succeeded with strategy: ${strategy.name}`);
            return { url: `${base}/file`, response };
          } catch (error) {
            lastError = error;
            const status = (error as any)?.response?.status;
            // If we get a non-400 error (like 401 unauthorized, 404, 5xx), don't try other strategies
            if (status && status !== 400) {
              this.logger.warn(`DigiLocker strategy ${strategy.name} failed with status ${status}; stopping strategy iteration`);
              throw error;
            }
            this.logger.debug(`DigiLocker strategy ${strategy.name} failed with 400; trying next strategy`);
          }
        }

        // All strategies failed with 400
        throw lastError;
      };

      // Download document from DigiLocker (retry once against alternate host if needed)
      const primaryBase = config.documentsUrl.replace(/\/$/, '');
      let dl;
      try {
        dl = await downloadFrom(primaryBase);
      } catch (error) {
        const status = (error as any)?.response?.status;
        const axiosCode = (error as any)?.code;

        // Only retry if it looks like a network/base-host issue.
        const shouldRetry =
          status === 404 ||
          status === 502 ||
          status === 503 ||
          status === 504 ||
          isUriMissingError(error) ||
          axiosCode === 'ENOTFOUND' ||
          axiosCode === 'ECONNRESET' ||
          axiosCode === 'ETIMEDOUT' ||
          axiosCode === 'ECONNREFUSED';

        const altBase = this.getAlternateDocumentsBaseUrl(primaryBase);
        if (shouldRetry && altBase && altBase !== primaryBase) {
          this.logger.warn(
            `DigiLocker download failed on primary host; retrying on alternate host (status=${status ?? 'n/a'} code=${axiosCode ?? 'n/a'})`
          );
          dl = await downloadFrom(altBase);
        } else {
          throw error;
        }
      }

      const response = dl.response as any;

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
      if (error instanceof DigiLockerException) {
        throw error;
      }

      const status = (error as any)?.response?.status;
      const data = (error as any)?.response?.data;
      const axiosCode = (error as any)?.code;
      const axiosMessage = (error as any)?.message;
      const requestUrl = (error as any)?.config?.url;

      let dataSnippet = '';
      try {
        if (typeof data === 'string') {
          dataSnippet = data.trim().slice(0, 200);
        } else if (Buffer.isBuffer(data)) {
          dataSnippet = data.toString('utf8').trim().slice(0, 200);
        } else if (data && typeof data === 'object') {
          dataSnippet = JSON.stringify(data).slice(0, 200);
        }
      } catch {
        // ignore
      }

      this.logger.error(
        `Failed to fetch document for user ${userId} (status=${status ?? 'n/a'} code=${axiosCode ?? 'n/a'} url=${requestUrl ?? 'n/a'} msg=${axiosMessage ?? 'n/a'} data=${dataSnippet || '(none)'})`
      );

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
        this.httpService.get(`${config.documentsUrl}/aadhaar`, {
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
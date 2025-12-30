export enum DocumentType {
  PAN_CARD = 'PAN_CARD',
  AADHAAR_CARD = 'AADHAAR_CARD',
  LIVE_PHOTO = 'LIVE_PHOTO',
}

export interface UploadDocumentDto {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  metadata?: Record<string, string>;
}

export interface DownloadDocumentResult {
  stream: NodeJS.ReadableStream;
  metadata: Record<string, string>;
}

export interface StorageConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

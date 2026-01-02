export enum DocumentType {
  PAN_CARD = 'PAN_CARD',
  AADHAAR_CARD = 'AADHAAR_CARD',
  LIVE_PHOTO = 'LIVE_PHOTO',
  SIGNATURE = 'SIGNATURE',
}

export interface UploadResult {
  objectPath: string;
  uploadedAt: string;
}

export interface DownloadResult {
  stream: any;
  metadata: Record<string, string>;
}

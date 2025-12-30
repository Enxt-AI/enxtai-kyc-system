export interface PanOcrResult {
  panNumber: string;
  fullName?: string;
  dateOfBirth?: string;
  rawText: string;
  confidence: number;
}

export interface AadhaarOcrResult {
  aadhaarNumber: string;
  fullName?: string;
  address?: string;
  rawText: string;
  confidence: number;
}

export interface OcrError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

import { DocumentSource, InternalStatus, FinalStatus } from './enums';

export interface KYCSubmission {
  id: string;
  userId: string;
  submissionDate: Date;
  documentSource: DocumentSource;
  panDocumentUrl?: string | null;
  aadhaarDocumentUrl?: string | null;
  livePhotoUrl?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  fullName?: string | null;
  dateOfBirth?: Date | null;
  address?: Record<string, any> | null;
  ocrResults?: Record<string, any> | null;
  faceMatchScore?: number | null;
  livenessScore?: number | null;
  faceExtractionSuccess: boolean;
  cvlKraSubmitted: boolean;
  cvlKraSubmissionDate?: Date | null;
  cvlKraResponse?: Record<string, any> | null;
  cvlKraStatus?: string | null;
  internalStatus: InternalStatus;
  finalStatus: FinalStatus;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKYCSubmissionDto {
  userId: string;
  documentSource: DocumentSource;
}

export interface UpdateKYCSubmissionDto {
  panDocumentUrl?: string;
  aadhaarDocumentUrl?: string;
  livePhotoUrl?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  fullName?: string;
  dateOfBirth?: Date;
  address?: Record<string, any>;
  ocrResults?: Record<string, any>;
  faceMatchScore?: number;
  livenessScore?: number;
  faceExtractionSuccess?: boolean;
  internalStatus?: InternalStatus;
  finalStatus?: FinalStatus;
  rejectionReason?: string;
}

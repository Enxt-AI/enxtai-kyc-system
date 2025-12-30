export interface PendingReviewSubmission {
  id: string;
  userId: string;
  user: {
    email: string;
    phone: string;
  };
  submissionDate: Date;
  fullName?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  faceMatchScore?: number | null;
  livenessScore?: number | null;
  internalStatus: string;
}

export interface SubmissionWithPresignedUrls {
  id: string;
  userId: string;
  fullName?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  dateOfBirth?: Date | null;
  address?: any;
  faceMatchScore?: number | null;
  livenessScore?: number | null;
  internalStatus: string;
  finalStatus: string;
  rejectionReason?: string | null;
  presignedUrls: {
    panDocument?: string;
    aadhaarDocument?: string;
    livePhoto?: string;
  };
}

export interface ApproveSubmissionDto {
  submissionId: string;
  adminUserId: string;
  notes?: string;
}

export interface RejectSubmissionDto {
  submissionId: string;
  adminUserId: string;
  reason: string;
}

export interface KycStatusResponse {
  submission: any;
  progress: number;
  statusLabel: string;
}

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

/**
 * Admin Client List Item
 *
 * Lightweight client data for admin table display.
 *
 * @property id - Client UUID
 * @property name - Organization name
 * @property status - Client status (ACTIVE, SUSPENDED, TRIAL)
 * @property apiKey - Masked API key (first 10 chars + '...')
 * @property totalKycs - Total KYC submissions count
 * @property createdAt - ISO 8601 timestamp
 */
export interface AdminClientListItem {
  id: string;
  name: string;
  status: string; // 'ACTIVE' | 'SUSPENDED' | 'TRIAL'
  apiKey: string; // Masked: 'client_abc...'
  totalKycs: number;
  verifiedKycs: number;
  rejectedKycs: number;
  createdAt: string; // ISO 8601
}

/**
 * Admin Client Detail
 *
 * Full client data for edit page.
 *
 * @property id - Client UUID
 * @property name - Organization name
 * @property status - Client status
 * @property apiKey - Masked API key
 * @property webhookUrl - Webhook endpoint URL (null if not configured)
 * @property webhookSecret - Masked webhook secret ('***' or null)
 * @property allowedDomains - Domain whitelist for API request origin validation (optional)
 * @property totalKycs - Total KYC submissions count
 * @property verifiedKycs - Count of verified submissions
 * @property rejectedKycs - Count of rejected submissions
 * @property createdAt - ISO 8601 timestamp
 * @property updatedAt - ISO 8601 timestamp
 */
export interface AdminClientDetail {
  id: string;
  name: string;
  status: string;
  apiKey: string; // Masked
  webhookUrl: string | null;
  webhookSecret: string | null; // Masked
  allowedDomains?: string[] | null; // Domain whitelist (optional)
  totalKycs: number;
  verifiedKycs: number;
  rejectedKycs: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create Client Response
 *
 * Response after creating a new client.
 * Contains plaintext API key (shown once).
 *
 * @property id - Client UUID
 * @property name - Organization name
 * @property apiKey - Plaintext API key (SHOW ONCE, then clear)
 * @property defaultAdminEmail - Email of created default admin user
 * @property defaultAdminPassword - Temporary password for default admin (SHOW ONCE)
 */
export interface CreateClientResponse {
  id: string;
  name: string;
  apiKey: string; // Plaintext (show once)
  defaultAdminEmail: string;
  defaultAdminPassword: string; // Temporary password (show once)
}

/**
 * Regenerate API Key Response
 *
 * Response after regenerating client API key.
 *
 * @property apiKey - New plaintext API key (SHOW ONCE)
 */
export interface RegenerateApiKeyResponse {
  apiKey: string; // Plaintext (show once)
}

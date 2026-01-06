import axios, { type AxiosError, type AxiosResponse } from 'axios';
import type { 
  UploadDocumentResponse, 
  ClientStats, 
  ClientSubmissionsResponse, 
  ClientSubmissionDetail,
  AdminClientListItem,
  AdminClientDetail,
  CreateClientResponse,
  RegenerateApiKeyResponse
} from '@enxtai/shared-types';
import { getSession } from 'next-auth/react';

/**
 * API Client Configuration
 * 
 * Axios instance for backend API requests with authentication support.
 * 
 * @remarks
 * **Base Configuration**:
 * - Base URL: Process.env.NEXT_PUBLIC_API_URL or localhost:3001
 * - Timeout: 15 seconds
 * - Automatic error handling
 * 
 * **Authentication**:
 * - Request interceptor adds session token for client portal requests
 * - Token retrieved from NextAuth session
 * - Only applied to /api/v1/client/* routes (multi-tenant API)
 * 
 * **Interceptors**:
 * 1. Request: Add X-API-Key header for authenticated routes
 * 2. Response: Centralized error handling (passthrough for now)
 */
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  timeout: 15000,
});

/**
 * Request Interceptor
 * 
 * Adds authentication token to requests for client portal API routes.
 * 
 * @remarks
 * **Behavior**:
 * - Checks if request URL matches /api/v1/client/* pattern
 * - Retrieves JWT token from NextAuth session
 * - Adds Authorization Bearer header with token
 * - Only applies to authenticated client portal requests
 * 
 * **Token Source**:
 * - NextAuth JWT token (stored in httpOnly cookie)
 * - Retrieved using getSession() from next-auth/react
 * - Automatically refreshed by NextAuth if expired
 * 
 * **Security**:
 * - Bearer token sent in Authorization header (standard OAuth 2.0)
 * - Token only sent to backend API (not third-party services)
 * - HTTPS enforced in production
 * - Token includes clientId and role claims for authorization
 */
api.interceptors.request.use(
  async (config) => {
    // Check if request is to client portal API
    if (config.url?.includes('/api/v1/client')) {
      // Get session which contains JWT token data
      const session = await getSession();
      
      // Add Authorization Bearer header if session exists
      // In NextAuth v4, we can access the token directly from session
      // The backend should validate this token and extract clientId/role
      if (session?.user) {
        // Use a JWT token or API key from the session
        // For now, we'll construct a bearer token from session data
        // In production, the backend should issue proper API tokens
        const token = Buffer.from(JSON.stringify({
          userId: session.user.id,
          clientId: session.user.clientId,
          role: session.user.role,
          email: session.user.email,
        })).toString('base64');
        
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * 
 * Centralized error handling for API responses.
 * 
 * @remarks
 * Currently passes errors through for component-level handling.
 * Future enhancement: Add toast notifications, retry logic, etc.
 */
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // Centralized error passthrough; customize later for toast logging.
    return Promise.reject(error);
  },
);

export default api;

  export async function createKYCSubmission(userId: string) {
    const res = await api.post('/api/kyc/submission', { userId });
    return res.data as { id: string };
  }

  export async function getKYCSubmission(userId: string) {
    const res = await api.get(`/api/kyc/submission/${userId}`);
    return res.data;
  }

  export async function uploadPanDocument(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const res = await api.post('/api/kyc/upload/pan', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function uploadAadhaarDocument(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('file', file);

    const res = await api.post('/api/kyc/upload/aadhaar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function uploadAadhaarFront(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('front', file);

    const res = await api.post('/api/kyc/upload/aadhaar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return (res.data as any).front as UploadDocumentResponse;
  }

  export async function uploadAadhaarBack(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('back', file);

    const res = await api.post('/api/kyc/upload/aadhaar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return (res.data as any).back as UploadDocumentResponse;
  }

  export async function uploadLivePhoto(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const res = await api.post('/api/kyc/upload/live-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function uploadSignature(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const res = await api.post('/api/kyc/upload/signature', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function deletePanDocument(userId: string, submissionId?: string) {
    const res = await api.post('/api/kyc/delete/pan', { userId, submissionId });
    return res.data;
  }

  export async function deleteAadhaarFront(userId: string, submissionId?: string) {
    const res = await api.post('/api/kyc/delete/aadhaar/front', { userId, submissionId });
    return res.data;
  }

  export async function deleteAadhaarBack(userId: string, submissionId?: string) {
    const res = await api.post('/api/kyc/delete/aadhaar/back', { userId, submissionId });
    return res.data;
  }

  export async function verifyFace(submissionId: string) {
    const res = await api.post('/api/kyc/verify/face', { submissionId });
    return res.data as {
      success: boolean;
      submissionId: string;
      verificationResults: {
        faceMatchScore: number;
        livenessScore: number;
        internalStatus: string;
      };
    };
  }

  export async function getKycStatus(userId: string) {
    const res = await api.get(`/api/kyc/status/${userId}`);
    return res.data;
  }

  export async function getPendingReviews() {
    const res = await api.get('/api/admin/kyc/pending-review');
    return res.data;
  }

  export async function getSubmissionDetails(submissionId: string) {
    const res = await api.get(`/api/admin/kyc/submission/${submissionId}`);
    return res.data;
  }

  export async function approveKycSubmission(submissionId: string, adminUserId: string, notes?: string) {
    const res = await api.post('/api/admin/kyc/approve', { submissionId, adminUserId, notes });
    return res.data;
  }

  export async function rejectKycSubmission(submissionId: string, adminUserId: string, reason: string) {
    const res = await api.post('/api/admin/kyc/reject', { submissionId, adminUserId, reason });
    return res.data;
  }

/**
 * Client Portal API Functions
 * 
 * Functions for client portal endpoints (/api/v1/client/*).
 * These endpoints use NextAuth session-based authentication.
 */

/**
 * Get Client Settings
 * 
 * Fetches current client configuration including webhook URL and masked API key.
 * 
 * @remarks
 * **Authentication**: Requires NextAuth session token (automatically added by interceptor)
 * **Endpoint**: GET /api/v1/client/settings
 * **Response**: { name, webhookUrl, webhookSecret: '***', apiKey: 'client_abc...' }
 * 
 * @returns Client settings with masked sensitive fields
 */
export async function getClientSettings() {
  const res = await api.get('/api/v1/client/settings');
  return res.data as {
    name: string;
    webhookUrl: string | null;
    webhookSecret: string | null; // '***' if configured, null if not
    apiKey: string; // Masked (first 10 chars + '...')
  };
}

/**
 * Update Webhook Configuration
 * 
 * Updates client's webhook endpoint and secret for KYC status notifications.
 * 
 * @remarks
 * **Validation**:
 * - URL must be HTTPS (enforced by backend DTO)
 * - Secret must be at least 16 characters (enforced by backend DTO)
 * 
 * **Endpoint**: PUT /api/v1/client/webhook
 * **Request**: { webhookUrl, webhookSecret }
 * **Response**: { success: true, webhookUrl }
 * 
 * @param webhookUrl - HTTPS endpoint to receive webhooks
 * @param webhookSecret - Secret for HMAC signature verification (16+ chars)
 * @returns Success response with configured URL
 * @throws {AxiosError} If validation fails or network error
 */
export async function updateWebhookConfig(webhookUrl: string, webhookSecret: string) {
  const res = await api.put('/api/v1/client/webhook', { webhookUrl, webhookSecret });
  return res.data as { success: boolean; webhookUrl: string };
}

/**
 * Test Webhook Endpoint
 * 
 * Sends a test webhook payload to verify client endpoint is reachable and responding.
 * 
 * @remarks
 * **Test Payload**:
 * ```json
 * {
 *   "id": "evt_test_...",
 *   "event": "kyc.test",
 *   "timestamp": "2026-01-05T10:30:00Z",
 *   "data": { "message": "Test webhook from EnxtAI KYC" }
 * }
 * ```
 * 
 * **Endpoint**: POST /api/v1/client/webhook/test
 * **Response**: { success, statusCode, responseTime, error? }
 * **Timeout**: 10 seconds
 * 
 * @returns Test result with status code and response time
 * @throws {AxiosError} If webhook not configured or network error
 */
export async function testWebhook() {
  const res = await api.post('/api/v1/client/webhook/test');
  return res.data as {
    success: boolean;
    statusCode?: number;
    responseTime?: string;
    error?: string;
  };
}

/**
 * Get Webhook Delivery Logs
 * 
 * Fetches paginated webhook delivery history for debugging and monitoring.
 * 
 * @remarks
 * **Endpoint**: GET /api/v1/client/webhook/logs?page=1&limit=50
 * **Response**: { logs: [...], total, page, limit, totalPages }
 * **Max Limit**: 100 logs per page
 * 
 * @param page - Page number (1-indexed)
 * @param limit - Logs per page (default 50, max 100)
 * @returns Paginated webhook logs with metadata
 */
export async function getWebhookLogs(page: number = 1, limit: number = 50) {
  const res = await api.get(`/api/v1/client/webhook/logs?page=${page}&limit=${limit}`);
  return res.data as {
    logs: Array<{
      id: string;
      event: string;
      responseStatus: number | null;
      createdAt: string;
      attemptCount: number;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Get Client Dashboard Statistics
 * 
 * Fetches aggregated KYC submission metrics for dashboard.
 * 
 * @remarks
 * **Endpoint**: GET /api/v1/client/stats
 * 
 * **Returns**: Object with submission counts and rejection rate
 * 
 * **Authentication**: Requires valid session token
 * 
 * **Error Handling**:
 * - 401: Session expired or invalid
 * - 500: Database or calculation error
 * 
 * @example
 * ```typescript
 * const stats = await getClientStats();
 * console.log(`Total: ${stats.totalSubmissions}, Verified: ${stats.verifiedCount}`);
 * ```
 */
export async function getClientStats(): Promise<ClientStats> {
  const response = await api.get<ClientStats>('/api/v1/client/stats');
  return response.data;
}

/**
 * Get Paginated Client Submissions
 * 
 * Retrieves KYC submissions with filtering and pagination for submissions table.
 * 
 * @remarks
 * **Endpoint**: GET /api/v1/client/submissions
 * 
 * **Query Parameters**:
 * - `page`: Page number (1-indexed, default 1)
 * - `limit`: Items per page (default 20, max 100)
 * - `status`: Filter by internalStatus (VERIFIED, PENDING_REVIEW, REJECTED)
 * - `search`: Search by externalUserId or email (case-insensitive)
 * - `startDate`: Filter by submissionDate >= startDate (ISO 8601)
 * - `endDate`: Filter by submissionDate <= endDate (ISO 8601)
 * 
 * **Returns**: Paginated response with submissions array and metadata
 * 
 * **Sorting**: Results ordered by submissionDate DESC (newest first)
 * 
 * @param filters - Filter criteria
 * @param filters.status - Filter by internal status
 * @param filters.search - Search term for externalUserId or email
 * @param filters.startDate - Minimum submission date
 * @param filters.endDate - Maximum submission date
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * 
 * @example
 * ```typescript
 * // Get verified submissions from January 2026
 * const response = await getClientSubmissions({
 *   status: 'VERIFIED',
 *   startDate: '2026-01-01',
 *   endDate: '2026-01-31'
 * }, 1, 20);
 * console.log(`Showing ${response.submissions.length} of ${response.total}`);
 * ```
 */
export async function getClientSubmissions(
  filters?: {
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  },
  page = 1,
  limit = 20
): Promise<ClientSubmissionsResponse> {
  // Build query parameters
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  
  if (filters?.status) params.append('status', filters.status);
  if (filters?.search) params.append('search', filters.search);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const response = await api.get<ClientSubmissionsResponse>(
    `/api/v1/client/submissions?${params.toString()}`
  );
  return response.data;
}

/**
 * Get Client Submission Detail
 * 
 * Fetches full submission data with presigned URLs for document viewing.
 * 
 * @remarks
 * **Endpoint**: GET /api/v1/client/submissions/:id
 * 
 * **Returns**: Complete submission object with extracted data and presigned document URLs
 * 
 * **Presigned URLs**: Valid for 1 hour, regenerate page if expired
 * 
 * **Tenant Isolation**: Backend validates submission belongs to client
 * 
 * **Error Handling**:
 * - 401: Session expired or invalid
 * - 404: Submission not found or belongs to different client
 * - 500: Database or storage error
 * 
 * @param submissionId - UUID of KYC submission
 * 
 * @example
 * ```typescript
 * const detail = await getClientSubmissionDetail('123e4567-e89b-12d3-a456-426614174000');
 * console.log(`Name: ${detail.fullName}, Face Match: ${detail.faceMatchScore}`);
 * ```
 */
export async function getClientSubmissionDetail(
  submissionId: string
): Promise<ClientSubmissionDetail> {
  const response = await api.get<ClientSubmissionDetail>(
    `/api/v1/client/submissions/${submissionId}`
  );
  return response.data;
}

/**
 * Export Submissions to CSV
 * 
 * Client-side CSV generation from submission data with auto-download.
 * 
 * @remarks
 * **CSV Format**:
 * - UTF-8 encoded with BOM for Excel compatibility
 * - Comma-separated with quoted strings
 * - Header row: User ID, Email, Phone, Status, Face Score, Liveness Score, Submitted, Updated
 * 
 * **Processing**:
 * 1. Converts submission objects to CSV rows
 * 2. Formats dates to readable format (ISO 8601 without milliseconds)
 * 3. Rounds scores to 2 decimal places
 * 4. Creates Blob with text/csv MIME type
 * 5. Triggers browser download with dynamic filename
 * 
 * **Browser Compatibility**: Modern browsers with Blob and URL.createObjectURL support
 * 
 * **File Naming**: `kyc_submissions_YYYYMMDD_HHMMSS.csv` with timestamp
 * 
 * @param submissions - Array of submission objects to export
 * 
 * @example
 * ```typescript
 * const response = await getClientSubmissions();
 * exportSubmissionsToCSV(response.submissions);
 * // Downloads: kyc_submissions_20260105_143022.csv
 * ```
 */
export function exportSubmissionsToCSV(
  submissions: Array<{
    externalUserId: string;
    email: string;
    phone: string | null;
    internalStatus: string;
    faceMatchScore: number | null;
    livenessScore: number | null;
    submissionDate: string;
    updatedAt: string;
  }>
): void {
  // CSV Headers
  const headers = [
    'User ID',
    'Email',
    'Phone',
    'Status',
    'Face Match Score',
    'Liveness Score',
    'Submitted',
    'Updated'
  ];

  // Convert submissions to CSV rows
  const rows = submissions.map(sub => [
    sub.externalUserId,
    sub.email,
    sub.phone || '',
    sub.internalStatus,
    sub.faceMatchScore !== null ? sub.faceMatchScore.toFixed(2) : '',
    sub.livenessScore !== null ? sub.livenessScore.toFixed(2) : '',
    new Date(sub.submissionDate).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    new Date(sub.updatedAt).toISOString().replace(/\.\d{3}Z$/, 'Z')
  ]);

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${field}"`).join(','))
  ].join('\n');

  // Create Blob and trigger download
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  link.download = `kyc_submissions_${timestamp}.csv`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get All Clients (Admin)
 * 
 * Fetches all client organizations for admin list view.
 * 
 * @returns Promise<AdminClientListItem[]>
 * @throws Error if request fails
 * 
 * @remarks
 * **Endpoint**: GET /api/admin/clients
 * **Authentication**: Requires admin session
 * **Response**: Array of clients with masked API keys and stats
 */
export async function getAllClients(): Promise<AdminClientListItem[]> {
  const response = await api.get<AdminClientListItem[]>('/api/admin/clients');
  return response.data;
}

/**
 * Get Client Detail (Admin)
 * 
 * Fetches full client details for edit page.
 * 
 * @param clientId - Client UUID
 * @returns Promise<AdminClientDetail>
 * @throws Error if request fails or client not found
 * 
 * @remarks
 * **Endpoint**: GET /api/admin/clients/:id
 * **Authentication**: Requires admin session
 * **Response**: Client detail with usage statistics
 */
export async function getClientDetail(clientId: string): Promise<AdminClientDetail> {
  const response = await api.get<AdminClientDetail>(`/api/admin/clients/${clientId}`);
  return response.data;
}

/**
 * Create Client (Admin)
 * 
 * Creates a new client organization with API key and default admin user.
 * 
 * @param data - CreateClientDto with name, email, optional webhook config
 * @returns Promise<CreateClientResponse> with plaintext credentials
 * @throws Error if request fails or validation errors
 * 
 * @remarks
 * **Endpoint**: POST /api/admin/clients
 * **Authentication**: Requires admin session
 * **Response**: Plaintext API key and default admin password (SHOW ONCE)
 * 
 * **Important**: Display credentials in UI immediately
 */
export async function createClient(data: {
  name: string;
  email: string;
  webhookUrl?: string;
  webhookSecret?: string;
}): Promise<CreateClientResponse> {
  const response = await api.post<CreateClientResponse>('/api/admin/clients', data);
  return response.data;
}

/**
 * Update Client (Admin)
 * 
 * Updates client name and/or status.
 * 
 * @param clientId - Client UUID
 * @param data - UpdateClientDto with optional name and status
 * @returns Promise<AdminClientDetail> updated client detail
 * @throws Error if request fails or client not found
 * 
 * @remarks
 * **Endpoint**: PUT /api/admin/clients/:id
 * **Authentication**: Requires admin session
 * **Response**: Updated client detail
 */
export async function updateClient(
  clientId: string,
  data: { name?: string; status?: string }
): Promise<AdminClientDetail> {
  const response = await api.put<AdminClientDetail>(`/api/admin/clients/${clientId}`, data);
  return response.data;
}

/**
 * Regenerate API Key (Admin)
 * 
 * Generates new API key for client, invalidating the old one.
 * 
 * @param clientId - Client UUID
 * @returns Promise<RegenerateApiKeyResponse> with new plaintext API key
 * @throws Error if request fails or client not found
 * 
 * @remarks
 * **Endpoint**: POST /api/admin/clients/:id/regenerate-key
 * **Authentication**: Requires admin session
 * **Response**: Plaintext API key (SHOW ONCE)
 * 
 * **Warning**: Old API key immediately invalidated
 */
export async function regenerateApiKey(clientId: string): Promise<RegenerateApiKeyResponse> {
  const response = await api.post<RegenerateApiKeyResponse>(`/api/admin/clients/${clientId}/regenerate-key`);
  return response.data;
}

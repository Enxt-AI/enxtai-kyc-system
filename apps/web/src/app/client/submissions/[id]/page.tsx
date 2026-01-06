'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getClientSubmissionDetail } from '@/lib/api-client';
import type { ClientSubmissionDetail } from '@enxtai/shared-types';
import Link from 'next/link';

/**
 * Submission Detail Page
 * 
 * Displays full submission details with extracted data and document previews.
 * 
 * @remarks
 * **Features**:
 * - Full extracted data display (PAN, Aadhaar, name, DOB, etc.)
 * - Face match and liveness score indicators
 * - Document image previews with presigned URLs (1-hour expiry)
 * - Status badge with color coding
 * - Back navigation to submissions list
 * 
 * **Data Source**:
 * - API endpoint: GET /api/v1/client/submissions/:id
 * - Requires session authentication
 * - Returns full submission with presigned URLs for documents
 * 
 * **Security**:
 * - Presigned URLs valid for 1 hour
 * - Tenant isolation enforced by backend (clientId validation)
 * - Aadhaar number masked (XXXX XXXX 1234)
 * 
 * **Document Previews**:
 * - PAN Document
 * - Aadhaar Front
 * - Aadhaar Back
 * - Live Photo
 * - Signature (if available)
 * 
 * **Error Handling**:
 * - 404: Submission not found or belongs to different client
 * - Network errors: Display retry button
 */
export default function SubmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<ClientSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (submissionId) {
      loadSubmissionDetail();
    }
  }, [submissionId]);

  const loadSubmissionDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getClientSubmissionDetail(submissionId);
      setSubmission(data);
    } catch (err: any) {
      console.error('Failed to load submission detail:', err);
      if (err.response?.status === 404) {
        setError('Submission not found or you do not have permission to view it.');
      } else {
        setError(err.response?.data?.message || 'Failed to load submission details');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'bg-green-100 text-green-800';
      case 'PENDING_REVIEW':
        return 'bg-yellow-100 text-yellow-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderScoreBar = (score: number | null, label: string) => {
    if (score === null) return null;
    
    const percentage = score * 100;
    const color = percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500';

    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm font-semibold text-gray-900">{percentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full ${color} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/client/submissions" className="text-blue-600 hover:text-blue-800 font-medium">
            ← Back to Submissions
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
          <p className="text-gray-600">Loading submission details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/client/submissions" className="text-blue-600 hover:text-blue-800 font-medium">
            ← Back to Submissions
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-8">
          <div className="flex items-start">
            <div className="text-red-600 text-3xl mr-4">⚠️</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-800">Error Loading Submission</h3>
              <p className="text-red-700 mt-2">{error}</p>
              <div className="mt-4 space-x-4">
                <button
                  onClick={loadSubmissionDetail}
                  className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                >
                  Retry
                </button>
                <Link
                  href="/client/submissions"
                  className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                >
                  Go Back
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!submission) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Back Navigation */}
      <div className="mb-8">
        <Link href="/client/submissions" className="text-blue-600 hover:text-blue-800 font-medium">
          ← Back to Submissions
        </Link>
      </div>

      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Submission Details</h1>
            <p className="mt-2 text-gray-600">User ID: {submission.externalUserId}</p>
          </div>
          <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${getStatusBadgeColor(submission.internalStatus)}`}>
            {submission.internalStatus.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: User Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Personal Information</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                <dd className="text-base font-semibold text-gray-900 mt-1">{submission.fullName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                <dd className="text-base text-gray-900 mt-1">{submission.dateOfBirth || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="text-base text-gray-900 mt-1">{submission.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Phone</dt>
                <dd className="text-base text-gray-900 mt-1">{submission.phone || 'N/A'}</dd>
              </div>
            </dl>
          </div>

          {/* Document Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Document Information</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">PAN Number</dt>
                <dd className="text-base font-mono text-gray-900 mt-1">{submission.panNumber || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Aadhaar Number (Masked)</dt>
                <dd className="text-base font-mono text-gray-900 mt-1">{submission.aadhaarNumber || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Father's Name</dt>
                <dd className="text-base text-gray-900 mt-1">{submission.fathersName || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Gender</dt>
                <dd className="text-base text-gray-900 mt-1">{submission.gender || 'N/A'}</dd>
              </div>
            </dl>
          </div>

          {/* Address Information */}
          {submission.address && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Address</h2>
              <p className="text-base text-gray-900">{submission.address}</p>
            </div>
          )}

          {/* Submission Timeline */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Timeline</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Submitted</dt>
                <dd className="text-base text-gray-900 mt-1">{formatDate(submission.submissionDate)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="text-base text-gray-900 mt-1">{formatDate(submission.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Final Status</dt>
                <dd className="text-base text-gray-900 mt-1">{submission.finalStatus}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Right Column: Scores & Documents */}
        <div className="space-y-6">
          {/* Verification Scores */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Verification Scores</h2>
            {renderScoreBar(submission.faceMatchScore, 'Face Match Score')}
            {renderScoreBar(submission.livenessScore, 'Liveness Score')}
            {renderScoreBar(submission.documentQuality, 'Document Quality')}
          </div>

          {/* Document Previews */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents</h2>
            <div className="space-y-4">
              {/* PAN Document */}
              {submission.presignedUrls.panDocument && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">PAN Card</h3>
                  <a
                    href={submission.presignedUrls.panDocument}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={submission.presignedUrls.panDocument}
                      alt="PAN Document"
                      className="w-full rounded-lg border border-gray-200 hover:border-blue-500 transition-colors cursor-pointer"
                    />
                  </a>
                </div>
              )}

              {/* Aadhaar Front */}
              {submission.presignedUrls.aadhaarFront && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Aadhaar Card (Front)</h3>
                  <a
                    href={submission.presignedUrls.aadhaarFront}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={submission.presignedUrls.aadhaarFront}
                      alt="Aadhaar Front"
                      className="w-full rounded-lg border border-gray-200 hover:border-blue-500 transition-colors cursor-pointer"
                    />
                  </a>
                </div>
              )}

              {/* Aadhaar Back */}
              {submission.presignedUrls.aadhaarBack && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Aadhaar Card (Back)</h3>
                  <a
                    href={submission.presignedUrls.aadhaarBack}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={submission.presignedUrls.aadhaarBack}
                      alt="Aadhaar Back"
                      className="w-full rounded-lg border border-gray-200 hover:border-blue-500 transition-colors cursor-pointer"
                    />
                  </a>
                </div>
              )}

              {/* Live Photo */}
              {submission.presignedUrls.livePhoto && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Live Photo</h3>
                  <a
                    href={submission.presignedUrls.livePhoto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={submission.presignedUrls.livePhoto}
                      alt="Live Photo"
                      className="w-full rounded-lg border border-gray-200 hover:border-blue-500 transition-colors cursor-pointer"
                    />
                  </a>
                </div>
              )}

              {/* Signature */}
              {submission.presignedUrls.signature && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Signature</h3>
                  <a
                    href={submission.presignedUrls.signature}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={submission.presignedUrls.signature}
                      alt="Signature"
                      className="w-full rounded-lg border border-gray-200 hover:border-blue-500 transition-colors cursor-pointer bg-white p-4"
                    />
                  </a>
                </div>
              )}
            </div>

            {/* URL Expiry Notice */}
            <p className="text-xs text-gray-500 mt-4 italic">
              ⚠️ Document preview links expire after 1 hour. Refresh the page if images fail to load.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

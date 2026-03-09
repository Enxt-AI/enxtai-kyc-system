import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * Reject Submission DTO
 *
 * Validates the request body for rejecting a KYC submission.
 * Requires a non-empty rejection reason that will be stored
 * on the submission record and included in the webhook payload
 * sent to the client's configured webhook URL.
 *
 * @remarks
 * **Validation Rules**:
 * - rejectionReason: Required, must be a non-empty string, max 1000 characters
 *
 * **Usage**: POST /api/v1/client/submissions/:id/reject
 */
export class RejectSubmissionDto {
  /**
   * Reason for rejecting the KYC submission.
   * Stored on the KYCSubmission record and forwarded to the
   * client webhook in the KYC_STATUS_CHANGED event payload.
   *
   * Examples: "PAN document image is blurry and unreadable",
   * "Face does not match the photo ID", "Aadhaar address is illegible"
   */
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @MaxLength(1000, { message: 'Rejection reason must be 1000 characters or fewer' })
  rejectionReason!: string;
}

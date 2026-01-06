import DashboardContent from './DashboardContent';

/**
 * Client Dashboard Page
 * 
 * Main dashboard for authenticated client portal users.
 * 
 * @remarks
 * **Current State**: Placeholder page for Phase 7 implementation
 * 
 * **Future Features** (Phase 7):
 * - KYC submission statistics (total, pending, approved, rejected)
 * - Recent submission activity timeline
 * - API usage metrics (requests, rate limits)
 * - Webhook delivery status
 * - Quick action buttons (create submission, view docs, settings)
 * 
 * **User Info**:
 * - Displays welcome message with user email
 * - Shows client ID for reference
 * - Displays user role (ADMIN or VIEWER)
 * 
 * **Styling**:
 * - Matches existing gray/blue theme
 * - Responsive design
 * - Card-based layout for future widgets
 */
export default function DashboardPage() {
  return <DashboardContent />;
}

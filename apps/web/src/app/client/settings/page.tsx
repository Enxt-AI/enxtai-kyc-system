'use client';

import { useState, useEffect } from 'react';
import {
  getClientSettings,
  updateWebhookConfig,
  testWebhook,
  getWebhookLogs,
} from '@/lib/api-client';

/**
 * Webhook Log Interface
 *
 * Represents a single webhook delivery attempt.
 */
interface WebhookLog {
  id: string;
  event: string;
  responseStatus: number | null;
  createdAt: string;
  attemptCount: number;
}

/**
 * Settings Page
 *
 * Webhook configuration management and monitoring for client portal.
 *
 * @remarks
 * **Features**:
 * - Webhook URL configuration (HTTPS required)
 * - Webhook secret generation and management
 * - Real-time webhook endpoint testing
 * - Webhook delivery log viewing with pagination
 * - API key display (masked)
 *
 * **Validation**:
 * - Webhook URL must use HTTPS protocol
 * - Webhook secret must be at least 16 characters
 * - Form validation before submission
 * - Backend validation via UpdateWebhookDto
 *
 * **State Management**:
 * - Form inputs (webhookUrl, webhookSecret)
 * - Loading states (form submission, testing)
 * - Test results (success/error, timing)
 * - Webhook logs with pagination
 *
 * **Error Handling**:
 * - Inline validation errors (HTTPS, length)
 * - Network error alerts
 * - Backend validation error display
 * - User-friendly error messages
 *
 * **Security Considerations**:
 * - Secret masking in UI (show/hide toggle)
 * - API key masked (first 10 chars + '...')
 * - HTTPS enforced for webhook URLs
 * - 16+ character minimum for secrets
 */
export default function SettingsPage() {
  // Form state
  const [clientName, setClientName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [hasStoredSecret, setHasStoredSecret] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    statusCode?: number;
    responseTime?: string;
    error?: string;
  } | null>(null);

  // Webhook logs state
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  /**
   * Load Settings on Mount
   *
   * Fetches current client settings and webhook logs.
   */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getClientSettings();
        setClientName(settings.name);
        setApiKey(settings.apiKey);
        setWebhookUrl(settings.webhookUrl || '');
        // Track if secret exists (masked as '***') to enable test button
        if (settings.webhookSecret === '***') {
          setHasStoredSecret(true);
        } else if (settings.webhookSecret) {
          setWebhookSecret(settings.webhookSecret);
          setHasStoredSecret(true);
        }
      } catch (error: any) {
        console.error('Failed to load settings:', error);
        alert(`Failed to load settings: ${error.message}`);
      }
    };

    loadSettings();
    loadWebhookLogs();
  }, []);

  /**
   * Load Webhook Logs
   *
   * Fetches paginated webhook delivery logs.
   */
  const loadWebhookLogs = async () => {
    setLogsLoading(true);
    try {
      const { logs, totalPages } = await getWebhookLogs(logsPage, 50);
      setWebhookLogs(logs);
      setLogsTotalPages(totalPages);
    } catch (error: any) {
      console.error('Failed to load webhook logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  /**
   * Reload logs when page changes
   */
  useEffect(() => {
    loadWebhookLogs();
  }, [logsPage]);

  /**
   * Generate Random Secret
   *
   * Creates a cryptographically secure random secret.
   */
  const handleGenerateSecret = () => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const hex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setWebhookSecret(`wh_secret_${hex}`);
  };

  /**
   * Test Webhook
   *
   * Sends a test webhook payload to verify endpoint connectivity.
   */
  const handleTestWebhook = async () => {
    setTestLoading(true);
    setTestResult(null);

    try {
      const result = await testWebhook();
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        error: error.response?.data?.message || error.message,
      });
    } finally {
      setTestLoading(false);
    }
  };

  /**
   * Save Configuration
   *
   * Validates and saves webhook configuration.
   */
  const handleSave = async () => {
    // Validate URL format
    if (!webhookUrl.startsWith('https://')) {
      alert('Webhook URL must use HTTPS protocol');
      return;
    }

    // Validate secret length
    if (webhookSecret.length < 16) {
      alert('Webhook secret must be at least 16 characters');
      return;
    }

    setLoading(true);
    try {
      await updateWebhookConfig(webhookUrl, webhookSecret);
      alert('✅ Webhook configuration saved successfully!');
      setTestResult(null); // Clear test results after save
    } catch (error: any) {
      alert(`❌ Failed to save: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">
          Manage your webhook configuration and API settings
        </p>
      </div>

      {/* Client Info Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Client Information
        </h2>

        <div className="space-y-4">
          {/* Client Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={clientName}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="text"
              value={apiKey}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed font-mono text-sm"
            />
            <p className="mt-1 text-sm text-gray-500">
              Use this API key for external API requests to /api/v1/kyc endpoints
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Configuration Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Webhook Configuration
        </h2>

        <div className="space-y-4">
          {/* Webhook URL Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-domain.com/api/webhooks/kyc"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-sm text-gray-600">
              Must be HTTPS. We&apos;ll send KYC status updates to this endpoint.
            </p>
          </div>

          {/* Webhook Secret Input with Show/Hide Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="wh_secret_abc123xyz..."
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showSecret ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              Minimum 16 characters. Use this to verify webhook signatures (HMAC-SHA256).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleGenerateSecret}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
            >
              🔑 Generate Random Secret
            </button>
            <button
              onClick={handleTestWebhook}
              disabled={!webhookUrl || (!webhookSecret && !hasStoredSecret) || testLoading}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testLoading ? '🔄 Testing...' : '🧪 Test Webhook'}
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !webhookUrl || !webhookSecret}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '💾 Saving...' : '💾 Save Configuration'}
            </button>
          </div>

          {/* Test Result Display */}
          {testResult && (
            <div
              className={`p-4 rounded-md border ${
                testResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {testResult.success ? (
                <div>
                  <p className="font-medium text-green-900">
                    ✅ Webhook test successful!
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Status: {testResult.statusCode}, Response time:{' '}
                    {testResult.responseTime}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-red-900">
                    ❌ Webhook test failed
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    {testResult.error}
                  </p>
                  {testResult.responseTime && (
                    <p className="text-sm text-red-700 mt-1">
                      Response time: {testResult.responseTime}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Webhook Logs Card */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Webhook Delivery Logs
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Last 50 webhook deliveries (page {logsPage} of {logsTotalPages})
            </p>
          </div>
          <button
            onClick={loadWebhookLogs}
            disabled={logsLoading}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            {logsLoading ? '🔄' : '🔄 Refresh'}
          </button>
        </div>

        {/* Logs Table */}
        {webhookLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-4xl mb-2">📋</p>
            <p>No webhook logs yet</p>
            <p className="text-sm mt-1">
              Logs will appear here after webhook deliveries
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Event
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attempts
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {webhookLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {log.event}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {log.responseStatus ? (
                          <span
                            className={`font-medium ${
                              log.responseStatus >= 200 &&
                              log.responseStatus < 300
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {log.responseStatus}
                          </span>
                        ) : (
                          <span className="text-red-600 font-medium">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.attemptCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logsTotalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage === 1}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {logsPage} of {logsTotalPages}
                </span>
                <button
                  onClick={() =>
                    setLogsPage((p) => Math.min(logsTotalPages, p + 1))
                  }
                  disabled={logsPage === logsTotalPages}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreateClientResponse } from '@enxtai/shared-types';
import { createClient } from '@/lib/api-client';

/**
 * Create Client Page
 *
 * Form for onboarding new client organizations.
 *
 * @remarks
 * **Form Fields**:
 * - Name: Organization name (required, min 2 chars)
 * - Email: Default admin email (required, valid email)
 * - Webhook URL: Optional HTTPS endpoint
 * - Webhook Secret: Optional secret (min 16 chars)
 *
 * **Onboarding Flow**:
 * 1. User fills form and submits
 * 2. API creates client, generates API key, creates MinIO buckets
 * 3. Response contains plaintext API key and default admin password
 * 4. Display credentials in modal with copy buttons
 * 5. User must copy credentials (shown once)
 * 6. Redirect to client list after confirmation
 *
 * **Security**:
 * - API key shown once (cannot be retrieved later)
 * - Default password shown once (must be changed on first login)
 * - Webhook URL must be HTTPS (validated by backend)
 */
export default function CreateClientPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    webhookUrl: '',
    webhookSecret: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdClient, setCreatedClient] = useState<CreateClientResponse | null>(null);
  const [copied, setCopied] = useState({ apiKey: false, password: false });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Sanitize form data: remove empty webhook fields to avoid validation errors
      const payload: any = {
        name: formData.name,
        email: formData.email,
      };

      // Only include webhook fields if they have values
      if (formData.webhookUrl && formData.webhookUrl.trim() !== '') {
        payload.webhookUrl = formData.webhookUrl;
      }

      if (formData.webhookSecret && formData.webhookSecret.trim() !== '') {
        payload.webhookSecret = formData.webhookSecret;
      }

      const response = await createClient(payload);
      setCreatedClient(response);
    } catch (err: any) {
      setError(err?.message || 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: 'apiKey' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopied({ ...copied, [field]: true });
    setTimeout(() => setCopied({ ...copied, [field]: false }), 2000);
  };

  // Show credentials modal after creation
  if (createdClient) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Client Created Successfully
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            <strong>Important:</strong> Copy these credentials now. They will not be shown again.
          </p>

          {/* Password Reset Warning Banner */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Important:</strong> The client must change their password on first login via <code className="bg-yellow-100 px-1 rounded">/client/login</code>. The temporary password shown above is for one-time use only.
                </p>
              </div>
            </div>
          </div>

          {/* API Key */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={createdClient.apiKey}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
              />
              <button
                onClick={() => copyToClipboard(createdClient.apiKey, 'apiKey')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {copied.apiKey ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Default Admin Email */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Default Admin Email
            </label>
            <input
              type="text"
              value={createdClient.defaultAdminEmail}
              readOnly
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          {/* Default Admin Password */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Default Admin Password (Temporary)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={createdClient.defaultAdminPassword}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
              />
              <button
                onClick={() => copyToClipboard(createdClient.defaultAdminPassword, 'password')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {copied.password ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Admin must change password on first login
            </p>
          </div>

          {/* Confirm Button */}
          <button
            onClick={() => router.push('/admin/clients')}
            className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            I've Copied the Credentials
          </button>
        </div>
      </div>
    );
  }

  // Show creation form
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Create New Client</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Organization Name *
          </label>
          <input
            type="text"
            required
            minLength={2}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="e.g., SMC Private Wealth"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Default Admin Email *
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="admin@example.com"
          />
          <p className="mt-1 text-xs text-slate-500">
            A default admin account will be created with this email
          </p>
        </div>

        {/* Webhook URL (Optional) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Webhook URL (Optional)
          </label>
          <input
            type="url"
            value={formData.webhookUrl}
            onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="https://client.com/webhook"
          />
          <p className="mt-1 text-xs text-slate-500">
            Client can configure this later via their portal
          </p>
        </div>

        {/* Webhook Secret (Optional) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Webhook Secret (Optional)
          </label>
          <input
            type="text"
            minLength={16}
            value={formData.webhookSecret}
            onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="wh_secret_abc123..."
          />
          <p className="mt-1 text-xs text-slate-500">
            Minimum 16 characters. Client can configure this later.
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/admin/clients')}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Client'}
          </button>
        </div>
      </form>
    </div>
  );
}

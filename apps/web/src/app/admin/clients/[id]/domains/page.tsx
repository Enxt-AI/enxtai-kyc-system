'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { AdminClientDetail } from '@enxtai/shared-types';
import { getClientDetail, updateClientDomains } from '@/lib/api-client';

/**
 * Client Domains Management Page
 *
 * Manage domain whitelist for API request origin validation.
 *
 * @remarks
 * **Features**:
 * - View current whitelisted domains
 * - Add new domains (standard or wildcard)
 * - Delete existing domains
 * - Wildcard toggle for easy subdomain matching
 * - Real-time validation feedback
 *
 * **Domain Types**:
 * - Standard: "fintech.com", "localhost:3000"
 * - Wildcard: "*.smcwealth.com" (matches all subdomains)
 *
 * **Validation**:
 * - URL format validation (client-side)
 * - Duplicate detection
 * - Backend filters invalid domains
 *
 * **Security**:
 * - SUPER_ADMIN role required (enforced by backend)
 * - Changes logged to audit trail (future enhancement)
 */
export default function ClientDomainsPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<AdminClientDetail | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add domain form state
  const [newDomain, setNewDomain] = useState('');
  const [useWildcard, setUseWildcard] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    loadClient();
  }, [clientId]);

  const loadClient = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClientDetail(clientId);
      setClient(data);
      // Parse allowedDomains from client (stored as JSON in DB)
      const allowedDomains = (data as any).allowedDomains || [];
      setDomains(Array.isArray(allowedDomains) ? allowedDomains : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load client');
    } finally {
      setLoading(false);
    }
  };

  const validateDomain = (domain: string): boolean => {
    // Validate domain format (wildcard, standard, localhost)
    const wildcardPattern = /^\*\.[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/;
    const domainPattern = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*(:\d+)?$/;
    const localhostPattern = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

    return wildcardPattern.test(domain) || domainPattern.test(domain) || localhostPattern.test(domain);
  };

  const handleAddDomain = () => {
    setValidationError(null);
    setSuccessMessage(null);

    if (!newDomain.trim()) {
      setValidationError('Domain cannot be empty');
      return;
    }

    // Apply wildcard prefix if toggle enabled
    const domainToAdd = useWildcard && !newDomain.startsWith('*.')
      ? `*.${newDomain.trim()}`
      : newDomain.trim();

    // Validate format
    if (!validateDomain(domainToAdd)) {
      setValidationError('Invalid domain format. Examples: fintech.com, *.smcwealth.com, localhost:3000');
      return;
    }

    // Check for duplicates
    if (domains.includes(domainToAdd)) {
      setValidationError('Domain already exists in whitelist');
      return;
    }

    // Add to list
    setDomains([...domains, domainToAdd]);
    setNewDomain('');
    setUseWildcard(false);
  };

  const handleDeleteDomain = (domainToDelete: string) => {
    setDomains(domains.filter(d => d !== domainToDelete));
    setSuccessMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await updateClientDomains(clientId, domains);
      setSuccessMessage('Domain whitelist updated successfully');
      await loadClient(); // Refresh client data
    } catch (err: any) {
      setError(err?.message || 'Failed to update domains');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (error && !client) {
    return <div className="p-8 text-red-600">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push(`/admin/clients/${clientId}`)}
          className="text-sm text-blue-600 hover:text-blue-800 mb-2"
        >
          ← Back to Client Details
        </button>
        <h1 className="text-2xl font-semibold text-slate-900">Domain Whitelist</h1>
        <p className="text-sm text-slate-500">{client?.name}</p>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Add Domain Form */}
      <div className="rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Add Domain</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Domain or Subdomain
            </label>
            <input
              type="text"
              value={newDomain}
              onChange={(e) => {
                setNewDomain(e.target.value);
                setValidationError(null);
              }}
              placeholder="fintech.com or smcwealth.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Examples: fintech.com, api.fintech.com, localhost:3000
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="wildcard"
              checked={useWildcard}
              onChange={(e) => setUseWildcard(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="wildcard" className="ml-2 text-sm text-slate-700">
              Use wildcard (*.domain.com) to match all subdomains
            </label>
          </div>

          {validationError && (
            <p className="text-sm text-red-600">{validationError}</p>
          )}

          <button
            onClick={handleAddDomain}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Domain
          </button>
        </div>
      </div>

      {/* Domains Table */}
      <div className="rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Whitelisted Domains ({domains.length})
        </h2>
        {domains.length === 0 ? (
          <p className="text-sm text-slate-500">
            No domains whitelisted. Add domains above to restrict API access.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Domain
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {domains.map((domain, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900 font-mono">
                      {domain}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {domain.startsWith('*.') ? (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-800">
                          Wildcard
                        </span>
                      ) : domain.includes('localhost') || domain.includes('127.0.0.1') ? (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                          Development
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                          Standard
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => handleDeleteDomain(domain)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Info Box */}
      <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">How Domain Whitelisting Works</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>API requests are validated against the Origin/Referer header</li>
          <li>Wildcard domains (*.example.com) match all subdomains</li>
          <li>Empty whitelist allows requests from any domain (not recommended)</li>
          <li>Include localhost/127.0.0.1 for local development testing</li>
        </ul>
      </div>
    </div>
  );
}

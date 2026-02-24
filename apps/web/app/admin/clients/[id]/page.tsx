'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { AdminClientDetail, RegenerateApiKeyResponse } from '@enxtai/shared-types';
import { getClientDetail, updateClient, regenerateApiKey } from '@/lib/api-client';

/**
 * Edit Client Page
 *
 * View and edit client details, regenerate API key, view usage stats.
 *
 * @remarks
 * **Features**:
 * - View client details (name, status, API key, webhook config)
 * - Edit name and status
 * - Regenerate API key (with confirmation)
 * - View usage statistics (total/verified/rejected KYCs)
 * - Suspend/activate client
 *
 * **Actions**:
 * - Update Name: Text input with save button
 * - Change Status: Dropdown (ACTIVE, SUSPENDED, TRIAL)
 * - Regenerate API Key: Button with confirmation modal
 *
 * **Security**:
 * - API key masked (first 10 chars + '...')
 * - Regenerated key shown once in modal
 * - Webhook secret masked ('***')
 */
export default function EditClientPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<AdminClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ name: '', status: '' });
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  useEffect(() => {
    loadClient();
  }, [clientId]);

  const loadClient = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClientDetail(clientId);
      setClient(data);
      setFormData({ name: data.name, status: data.status });
    } catch (err: any) {
      setError(err?.message || 'Failed to load client');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      await updateClient(clientId, formData);
      await loadClient();
      setEditMode(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to update client');
    }
  };

  const handleRegenerateKey = async () => {
    try {
      const response = await regenerateApiKey(clientId);
      setNewApiKey(response.apiKey);
      setShowRegenerateModal(false);
      await loadClient();
    } catch (err: any) {
      setError(err?.message || 'Failed to regenerate API key');
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (error || !client) {
    return <div className="p-8 text-red-600">{error || 'Client not found'}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/clients')}
          className="text-sm text-blue-600 hover:text-blue-800 mb-2"
        >
          ← Back to Clients
        </button>
        <h1 className="text-2xl font-semibold text-slate-900">{client.name}</h1>
        <p className="text-sm text-slate-500">Client ID: {client.id}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Total KYCs</div>
          <div className="text-2xl font-semibold text-slate-900">{client.totalKycs}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Verified</div>
          <div className="text-2xl font-semibold text-green-600">{client.verifiedKycs}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Rejected</div>
          <div className="text-2xl font-semibold text-red-600">{client.rejectedKycs}</div>
        </div>
      </div>

      {/* Client Details */}
      <div className="rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Client Details</h2>
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Edit
            </button>
          )}
        </div>

        {editMode ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="TRIAL">TRIAL</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-sm text-slate-600">Name</div>
              <div className="text-slate-900">{client.name}</div>
            </div>
            <div>
              <div className="text-sm text-slate-600">Status</div>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                  client.status === 'ACTIVE'
                    ? 'bg-green-100 text-green-800'
                    : client.status === 'SUSPENDED'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {client.status}
              </span>
            </div>
            <div>
              <div className="text-sm text-slate-600">API Key</div>
              <div className="font-mono text-sm text-slate-900">{client.apiKey}</div>
            </div>
            <div>
              <div className="text-sm text-slate-600">Webhook URL</div>
              <div className="text-slate-900">{client.webhookUrl || 'Not configured'}</div>
            </div>
            <div>
              <div className="text-sm text-slate-600">Created</div>
              <div className="text-slate-900">{new Date(client.createdAt).toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Actions</h2>
        <div className="space-y-2">
          {/* Manage Domain Whitelist button */}
          <button
            onClick={() => router.push(`/admin/clients/${clientId}/domains`)}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-left"
          >
            Manage Domain Whitelist
          </button>
          {/* Regenerate API Key button */}
          <button
            onClick={() => setShowRegenerateModal(true)}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-left"
          >
            Regenerate API Key
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Warning: Regenerating API key will invalidate the current key immediately
        </p>
      </div>

      {/* Regenerate Confirmation Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Regenerate API Key?</h3>
            <p className="text-sm text-slate-600 mb-4">
              This will immediately invalidate the current API key. The client will need to update
              their systems with the new key.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRegenerateModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateKey}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New API Key Modal */}
      {newApiKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">New API Key Generated</h3>
            <p className="text-sm text-slate-600 mb-4">
              Copy this key now. It will not be shown again.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newApiKey}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(newApiKey)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setNewApiKey(null)}
              className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              I've Copied the Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

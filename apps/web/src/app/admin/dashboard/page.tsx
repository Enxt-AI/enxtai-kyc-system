"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllClients } from "@/lib/api-client";
import type { AdminClientListItem } from "@enxtai/shared-types";
import {
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  ChevronRight,
  AlertCircle,
  Building,
} from "lucide-react";

/**
 * Admin Dashboard Page
 *
 * Cross-tenant overview for platform administrators (Super Admin).
 *
 * @remarks
 * **Purpose**:
 * - Displays all clients with their KYC statistics at a glance
 * - Provides quick access to client management
 * - Shows overall platform health metrics
 *
 * **RBAC Protection**:
 * - SuperAdminGuard (via layout) ensures only SUPER_ADMIN can access
 * - Middleware validates session token before reaching this page
 * - Backend APIs validate SUPER_ADMIN role on all requests
 *
 * **Data Fetching Strategy**:
 * - Fetches all clients from `/api/admin/clients`
 * - Backend returns aggregated KYC counts per client
 * - Success rate calculated client-side: `(verified / total * 100)%`
 *
 * **Features**:
 * - Real-time client statistics table
 * - Status badges (color-coded by client status)
 * - Success rate indicators
 * - Quick navigation to client management
 * - Loading states and error handling
 *
 * **Cross-Tenant Visibility**:
 * SUPER_ADMIN users can view data from all clients (tenants) in a single view.
 * This enables platform monitoring and identifying clients with low success rates.
 */
export default function AdminDashboardPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const clients = await getAllClients();
      setClients(clients);
    } catch (err: any) {
      console.error("Failed to load clients:", err);
      setError(
        err.response?.data?.message || "Failed to load client statistics",
      );
    } finally {
      setLoading(false);
    }
  };

  const calculateSuccessRate = (
    verifiedKycs: number,
    totalKycs: number,
  ): string => {
    if (totalKycs === 0) return "0.0%";
    return ((verifiedKycs / totalKycs) * 100).toFixed(1) + "%";
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: "bg-zinc-100 text-zinc-900 border-zinc-200 shadow-sm",
      SUSPENDED:
        "bg-zinc-50 text-zinc-500 border-zinc-200 shadow-sm opacity-80",
      TRIAL: "bg-zinc-100 text-zinc-600 border-zinc-200 shadow-sm",
    };
    return (
      <span
        className={`px-2.5 py-1 text-[11px] font-bold tracking-wider rounded-md border ${
          styles[status as keyof typeof styles] ||
          "bg-zinc-50 text-zinc-700 border-zinc-200 shadow-sm"
        }`}
      >
        {status}
      </span>
    );
  };

  const totalClients = clients.length;
  const totalKycs = clients.reduce((sum, c) => sum + (c.totalKycs || 0), 0);
  const verifiedKycs = clients.reduce(
    (sum, c) => sum + (c.verifiedKycs || 0),
    0,
  );
  const rejectedKycs = clients.reduce(
    (sum, c) => sum + (c.rejectedKycs || 0),
    0,
  );

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Admin Dashboard
          </h1>
          <p className="mt-2 text-sm text-zinc-500 font-medium">
            Platform overview and client statistics
          </p>
        </div>
        <Link
          href="/admin/clients"
          className="inline-flex items-center justify-center px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all font-medium text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
        >
          <Building2 className="w-4 h-4 mr-2" />
          Manage Clients
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start">
            <AlertCircle className="text-red-600 w-6 h-6 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-900">
                Error Loading Client Data
              </h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={loadClients}
                className="mt-3 text-sm font-semibold text-red-800 hover:text-red-900 underline transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !clients.length && (
        <div className="min-h-[400px] bg-white rounded-2xl border border-zinc-200 p-8 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-200 border-t-zinc-900 mb-4"></div>
          <p className="text-zinc-500 font-medium text-sm">
            Loading statistics...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && clients.length === 0 && (
        <div className="min-h-[400px] bg-white rounded-2xl border border-zinc-200 p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-center mb-6">
            <Building className="w-8 h-8 text-zinc-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">
            No Platform Clients
          </h2>
          <p className="text-zinc-500 text-sm max-w-sm mb-8">
            Establish your first client organization to begin processing KYC
            submissions.
          </p>
          <Link
            href="/admin/clients"
            className="inline-flex items-center px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all font-medium text-sm"
          >
            Create Organization
          </Link>
        </div>
      )}

      {!loading && clients.length > 0 && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  Total Organizations
                </p>
                <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                  {totalClients}
                </p>
              </div>
              <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-zinc-400" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  Global KYCs
                </p>
                <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                  {totalKycs}
                </p>
              </div>
              <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-zinc-400" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  System Approvals
                </p>
                <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                  {verifiedKycs}
                </p>
              </div>
              <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-zinc-400" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  System Rejections
                </p>
                <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                  {rejectedKycs}
                </p>
              </div>
              <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                <XCircle className="w-5 h-5 text-zinc-400" />
              </div>
            </div>
          </div>

          {/* Clients Table */}
          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900">
                Registered Organizations
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-6 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                      Client
                    </th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                      Status
                    </th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                      Traffic
                    </th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                      Approval Rate
                    </th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                      Boarded
                    </th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {clients.map((client) => {
                    const successRate = calculateSuccessRate(
                      client.verifiedKycs || 0,
                      client.totalKycs || 0,
                    );
                    return (
                      <tr
                        key={client.id}
                        className="group hover:bg-zinc-50/80 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="h-9 w-9 flex-shrink-0 bg-white border border-zinc-200 rounded-lg flex items-center justify-center">
                              <span className="text-zinc-600 font-bold text-sm">
                                {client.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-semibold text-zinc-900">
                                {client.name}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono mt-0.5 tracking-wide">
                                {client.id.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          {getStatusBadge(client.status)}
                        </td>
                        <td className="px-6 py-4 align-middle text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-semibold text-zinc-900">
                              {client.totalKycs || 0}
                            </span>
                            <div className="text-[10px] font-medium text-zinc-400 mt-0.5 flex gap-2">
                              <span>{client.verifiedKycs || 0} ✓</span>
                              <span>{client.rejectedKycs || 0} ✕</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 align-middle text-center">
                          <div className="inline-flex items-center justify-center px-2.5 py-1 rounded bg-zinc-100 text-zinc-900">
                            <span className="text-xs font-bold tracking-wide">
                              {successRate}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 align-middle text-right text-sm text-zinc-500 font-medium">
                          {new Date(client.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </td>
                        <td className="px-6 py-4 align-middle text-right">
                          <Link
                            href={`/admin/clients/${client.id}`}
                            className="inline-flex items-center text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors group-hover:underline"
                          >
                            Oversight
                            <ChevronRight className="w-4 h-4 ml-1 opacity-50 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

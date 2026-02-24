"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { getClientStats } from "@/lib/api-client";
import type { ClientStats } from "@enxtai/shared-types";
import Link from "next/link";
import axios from "axios";
import {
  Building2,
  BarChart3,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  ClipboardList,
  Settings,
  RefreshCw,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  status: string;
}

/**
 * Dashboard Content - Client Component
 *
 * Main dashboard for client portal with KYC statistics and quick actions.
 *
 * @remarks
 * **Features**:
 * - Real-time statistics cards (total, verified, pending, rejected)
 * - Rejection rate indicator with color-coded alert levels
 * - Quick action buttons for common tasks
 * - Loading states and error handling
 *
 * **Data Fetching**:
 * - Loads stats on mount using getClientStats()
 * - Automatic retry on error (manual refresh button)
 * - Session-based authentication via NextAuth
 *
 * **Visual Design**:
 * - Statistics cards with icons and trend colors
 * - Rejection rate badge: Green (<10%), Yellow (10-20%), Red (>20%)
 * - Responsive grid layout (1 column mobile, 4 columns desktop)
 */
export default function DashboardContent() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [loadingClients, setLoadingClients] = useState(false);

  const isSuperAdmin = (session?.user as any)?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (isSuperAdmin) {
      loadClients();
    } else {
      loadStats();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin && selectedClientId) {
      loadStats();
    }
  }, [selectedClientId]);

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/admin/clients`,
      );
      setClients(response.data);
    } catch (err: any) {
      console.error("Failed to load clients:", err);
      setError(err.response?.data?.message || "Failed to load clients");
    } finally {
      setLoadingClients(false);
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getClientStats();
      setStats(data);
    } catch (err: any) {
      console.error("Failed to load stats:", err);
      setError(
        err.response?.data?.message || "Failed to load dashboard statistics",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="">
      {/* SUPER_ADMIN Client Selector */}
      {isSuperAdmin && (
        <div className="mb-6 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start">
            <div className="w-10 h-10 bg-zinc-50 rounded-lg flex items-center justify-center mr-4 border border-zinc-100">
              <Building2 className="w-5 h-5 text-zinc-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-zinc-900 mb-1">
                Super Admin Overview
              </h3>
              <p className="text-sm text-zinc-500 mb-4">
                Select an organization to view detailed analytics
              </p>
              {loadingClients ? (
                <div className="flex items-center text-sm text-zinc-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-zinc-200 border-t-zinc-900 mr-2"></div>
                  Loading organizations...
                </div>
              ) : (
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full max-w-md px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white text-zinc-900 text-sm font-medium transition-all"
                >
                  <option value="">-- Select Organization --</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.status})
                    </option>
                  ))}
                </select>
              )}
              {selectedClientId && (
                <p className="text-xs text-zinc-500 mt-3 font-medium">
                  Currently viewing:{" "}
                  <span className="font-bold text-zinc-900">
                    {clients.find((c) => c.id === selectedClientId)?.name}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUPER_ADMIN: Show message if no client selected */}
      {isSuperAdmin && !selectedClientId ? (
        <div className="min-h-[400px] bg-white rounded-2xl border border-zinc-200 p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-center mb-6">
            <BarChart3 className="w-8 h-8 text-zinc-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">
            Select Organization
          </h2>
          <p className="text-zinc-500 text-sm max-w-sm mb-8">
            Choose a client from the dropdown above to view their workspace
            analytics.
          </p>
        </div>
      ) : (
        <>
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
              Dashboard
            </h1>
            <p className="mt-2 text-sm text-zinc-500 font-medium">
              Welcome back,{" "}
              <span className="font-bold text-zinc-900">
                {session?.user?.email}
              </span>
            </p>
          </div>

          {/* Error State */}
          {error && (
            <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-rose-600 mr-3 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-rose-800">
                    Error Loading Statistics
                  </h3>
                  <p className="text-sm text-rose-700 mt-1">{error}</p>
                  <button
                    onClick={loadStats}
                    className="mt-3 text-sm font-bold text-rose-900 hover:text-rose-800 transition-colors"
                  >
                    Retry Request
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && !stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-zinc-200 p-6 animate-pulse"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-3 bg-zinc-200 rounded-full w-24 mb-3"></div>
                      <div className="h-8 bg-zinc-200 rounded-md w-16"></div>
                    </div>
                    <div className="w-10 h-10 bg-zinc-100 rounded-lg"></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Statistics Cards */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
              {/* Total Submissions */}
              <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                      Global Traffic
                    </p>
                    <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                      {stats.totalSubmissions}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-zinc-400" />
                  </div>
                </div>
              </div>

              {/* Verified */}
              <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                      Approvals
                    </p>
                    <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                      {stats.verifiedCount}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-zinc-400" />
                  </div>
                </div>
                {stats.totalSubmissions > 0 && (
                  <p className="text-[11px] font-bold text-zinc-400 mt-2 tracking-wide">
                    {(
                      (stats.verifiedCount / stats.totalSubmissions) *
                      100
                    ).toFixed(1)}
                    % SUCCESS RATE
                  </p>
                )}
              </div>

              {/* Pending Review */}
              <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                      In Queue
                    </p>
                    <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                      {stats.pendingReviewCount}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-zinc-400" />
                  </div>
                </div>
              </div>

              {/* Rejected */}
              <div className="bg-white rounded-2xl p-6 border border-zinc-200 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                      Exceptions
                    </p>
                    <p className="text-3xl font-bold text-zinc-900 tracking-tight">
                      {stats.rejectedCount}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-zinc-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rejection Rate Alert */}
          {stats && stats.totalSubmissions > 0 && (
            <div
              className={`mb-8 rounded-xl p-5 border ${
                stats.rejectionRate > 20
                  ? "bg-rose-50 border-rose-200"
                  : stats.rejectionRate > 10
                    ? "bg-amber-50 border-amber-200"
                    : "bg-emerald-50 border-emerald-200"
              }`}
            >
              <div className="flex items-start">
                <div className="mr-3 mt-0.5">
                  {stats.rejectionRate > 20 ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  ) : stats.rejectionRate > 10 ? (
                    <Info className="w-5 h-5 text-amber-600" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <h3
                    className={`text-sm font-bold tracking-wide ${
                      stats.rejectionRate > 20
                        ? "text-rose-900"
                        : stats.rejectionRate > 10
                          ? "text-amber-900"
                          : "text-emerald-900"
                    }`}
                  >
                    REJECTION RATE: {stats.rejectionRate}%
                  </h3>
                  <p
                    className={`text-sm mt-1 font-medium ${
                      stats.rejectionRate > 20
                        ? "text-rose-700"
                        : stats.rejectionRate > 10
                          ? "text-amber-700"
                          : "text-emerald-700"
                    }`}
                  >
                    {stats.rejectionRate > 20
                      ? "High exception volume detected. Review systemic submission patterns."
                      : stats.rejectionRate > 10
                        ? "Moderate exception level. Monitor quality checks."
                        : "Healthy baseline maintained."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8">
            <h2 className="text-base font-bold text-zinc-900 mb-6">
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/client/submissions"
                className="group flex items-start p-5 border border-zinc-200 rounded-xl hover:border-zinc-900 hover:bg-zinc-50 transition-all"
              >
                <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center mr-4 group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-zinc-200 transition-all">
                  <ClipboardList className="w-5 h-5 text-zinc-600 group-hover:text-zinc-900 transition-colors" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 text-sm">
                    View Submissions
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium mt-1">
                    Browse all platform KYCs
                  </p>
                </div>
              </Link>

              <Link
                href="/client/settings"
                className="group flex items-start p-5 border border-zinc-200 rounded-xl hover:border-zinc-900 hover:bg-zinc-50 transition-all"
              >
                <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center mr-4 group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-zinc-200 transition-all">
                  <Settings className="w-5 h-5 text-zinc-600 group-hover:text-zinc-900 transition-colors" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 text-sm">
                    Client Settings
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium mt-1">
                    Manage core configuration
                  </p>
                </div>
              </Link>

              <button
                onClick={loadStats}
                disabled={loading}
                className="group text-left flex items-start p-5 border border-zinc-200 rounded-xl hover:border-zinc-900 hover:bg-zinc-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center mr-4 group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-zinc-200 transition-all">
                  <RefreshCw
                    className={`w-5 h-5 text-zinc-600 group-hover:text-zinc-900 transition-colors ${loading ? "animate-spin" : ""}`}
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 text-sm">
                    Synchronize
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium mt-1">
                    Refresh metrics view
                  </p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

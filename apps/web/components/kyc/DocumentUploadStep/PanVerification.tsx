"use client";

import React, { useEffect, useRef } from "react";

interface PanVerificationProps {
  digiLockerError: string | null;
  digiLockerAuthorized: boolean;
  fetchingFromDigiLocker: boolean;
  onDigiLockerAuth: () => void;
  onFetchFromDigiLocker: () => void;
}

export function PanVerification({
  digiLockerError,
  digiLockerAuthorized,
  fetchingFromDigiLocker,
  onDigiLockerAuth,
  onFetchFromDigiLocker,
}: PanVerificationProps) {
  const hasFetchedRef = useRef(false);

  // Auto-trigger fetch as soon as DigiLocker is authorized
  useEffect(() => {
    if (digiLockerAuthorized && !fetchingFromDigiLocker && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      onFetchFromDigiLocker();
    }
  }, [digiLockerAuthorized, fetchingFromDigiLocker, onFetchFromDigiLocker]);

  return (
    <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center text-center">
      <div className="bg-blue-50 p-4 rounded-full mb-4">
        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Automated PAN Verification</h2>
      <p className="text-gray-500 mb-8 text-sm">To verify your identity securely, we will fetch your authenticated PAN details directly from DigiLocker.</p>

      {digiLockerError && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 w-full text-sm font-medium border border-red-100">
          {digiLockerError}
        </div>
      )}

      {!digiLockerAuthorized ? (
        <button 
          onClick={onDigiLockerAuth}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2"
        >
          Connect to DigiLocker
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      ) : (
        <div className="w-full flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-emerald-600 font-medium text-sm">Fetching PAN details securely...</p>
        </div>
      )}
    </div>
  );
}

